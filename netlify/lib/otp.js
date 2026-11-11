// Shared helpers for Nati's verification codes (SMS first, email backup).
//
// Stateless design: no database. When a code is sent we return a signed
// "challenge" token that carries the destination and expiry, plus an HMAC of
// the code. On verify we recompute the HMAC; on success we issue a signed
// "verified" token that /api/apply checks before forwarding to TaskFlow.
//
// Secrets (Netlify env vars, never sent to the browser):
//   CLICKATELL_OTP_API_KEY  Clickatell One API key ("Nati website (verification codes)")
//   OTP_SIGNING_SECRET      optional; if absent a key is derived from the Clickatell key
//   BREVO_API_KEY           optional; enables the email backup
//   OTP_EMAIL_FROM          optional; sender address for email codes (default noreply@manati.co.za)
import crypto from "node:crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;      // a code is valid for 10 minutes
export const VERIFIED_TTL_MS = 3 * 60 * 60 * 1000; // a verified number stays valid for 3 hours

export const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

function secret() {
  if (process.env.OTP_SIGNING_SECRET) return process.env.OTP_SIGNING_SECRET;
  const k = process.env.CLICKATELL_OTP_API_KEY || "";
  if (!k) return "";
  return crypto.createHash("sha256").update("nati-otp-signing-v1:" + k).digest("hex");
}

const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString("utf8");
const hmac = (msg) => crypto.createHmac("sha256", secret()).update(msg).digest("base64url");
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function configured() { return !!secret(); }

// SA mobile numbers only (stops SMS-pumping to premium/foreign numbers).
// Accepts 0821234567, 27821234567, +27 82 123 4567. Returns 27XXXXXXXXX or null.
export function normalisePhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) d = "27" + d.slice(1);
  return /^27[6-8]\d{8}$/.test(d) ? d : null;
}
export function normaliseEmail(v) {
  const e = String(v || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200 ? e : null;
}

export function newCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, "0"); }

// Challenge token: payload.sig where sig = HMAC("c|" + payload + "|" + code)
export function makeChallenge(ch, to, code) {
  const payload = b64(JSON.stringify({ ch, to, exp: Date.now() + CODE_TTL_MS, n: crypto.randomBytes(6).toString("hex") }));
  return payload + "." + hmac("c|" + payload + "|" + code);
}
export function checkChallenge(token, code) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return { ok: false, error: "invalid" };
  let p; try { p = JSON.parse(unb64(payload)); } catch (_) { return { ok: false, error: "invalid" }; }
  if (!p.exp || Date.now() > p.exp) return { ok: false, error: "expired" };
  if (!/^\d{6}$/.test(String(code || ""))) return { ok: false, error: "wrong" };
  if (!safeEq(sig, hmac("c|" + payload + "|" + code))) return { ok: false, error: "wrong" };
  return { ok: true, ch: p.ch, to: p.to, n: p.n };
}

// Verified token: payload.sig where sig = HMAC("v|" + payload)
export function makeVerified(ch, to) {
  const at = Date.now();
  const payload = b64(JSON.stringify({ ch, to, at, exp: at + VERIFIED_TTL_MS }));
  return payload + "." + hmac("v|" + payload);
}
export function checkVerified(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig || !configured()) return null;
  if (!safeEq(sig, hmac("v|" + payload))) return null;
  let p; try { p = JSON.parse(unb64(payload)); } catch (_) { return null; }
  if (!p.exp || Date.now() > p.exp) return null;
  return p; // { ch, to, at, exp }
}

// Best-effort per-key rate limiter (serverless instances don't share memory;
// this stops a single source hammering one warm instance).
export function limiter(windowMs, max) {
  const hits = new Map();
  return (key) => {
    if (!key) return false;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    return recent.length > max;
  };
}

export function clientIpOf(req) {
  return req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
}

export function mask(ch, to) {
  if (ch === "sms") return "0" + to.slice(2, 4) + " *** " + to.slice(-4);
  const [u, d] = to.split("@");
  return (u.slice(0, 2) + "***@" + d);
}
