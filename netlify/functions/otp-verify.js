// Netlify Function: /api/otp-verify
// Checks a 6-digit code against the signed challenge from /api/otp-send and,
// if it matches, returns a signed "verified" token for /api/apply.
import { json, configured, checkChallenge, makeVerified, limiter, clientIpOf } from "../lib/otp.js";

const ipLimit = limiter(10 * 60 * 1000, 20);   // 20 attempts per IP per 10 min
const tokLimit = limiter(10 * 60 * 1000, 5);   // 5 attempts per code

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!configured()) return json(503, { ok: false, error: "Verification is not available right now." });
  if (ipLimit(clientIpOf(req))) return json(429, { ok: false, error: "Too many attempts. Please wait a few minutes and try again." });

  let body; try { body = await req.json(); } catch (_) { return json(400, { ok: false, error: "Invalid request" }); }
  const challenge = String((body && body.challenge) || "");
  const code = String((body && body.code) || "").replace(/\D/g, "");
  if (tokLimit(challenge.slice(-24))) return json(429, { ok: false, error: "Too many wrong attempts. Please request a new code." });

  const r = checkChallenge(challenge, code);
  if (!r.ok) {
    const msg = r.error === "expired" ? "That code has expired. Please request a new one." : "That code isn't right. Please check it and try again.";
    return json(r.error === "expired" ? 410 : 422, { ok: false, error: msg, reason: r.error });
  }
  return json(200, { ok: true, channel: r.ch, verified: makeVerified(r.ch, r.to) });
};
