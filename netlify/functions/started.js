// Netlify Function: /api/started
// Called by Nati straight after an applicant verifies their code. Remembers
// their contact details so we can follow up if they do not finish.
import { json, checkVerified, normalisePhone, normaliseEmail, limiter, clientIpOf } from "../lib/otp.js";
import { store, keyFor } from "../lib/dropoff.js";

const ipLimit = limiter(10 * 60 * 1000, 10);
const clip = (v, n) => (v === undefined || v === null ? null : String(v).trim().slice(0, n) || null);

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false });
  if (ipLimit(clientIpOf(req))) return json(429, { ok: false });
  let body; try { body = await req.json(); } catch (_) { return json(400, { ok: false }); }
  const vt = checkVerified(body && body.verifiedToken);
  if (!vt) return json(403, { ok: false });
  const d = (body && body.data) || {};
  const rec = {
    at: Date.now(), ch: vt.ch, to: vt.to,
    who: d.who === "Sponsor" ? "Sponsor" : "Student",
    first: clip(d.first, 60), last: clip(d.last, 60),
    phone: normalisePhone(d.phone) || clip(d.phone, 20),
    email: normaliseEmail(d.email),
    institution: clip(d.institution, 120), unlisted: !!d.unlisted,
    existing: d.existing === "Yes" ? "Yes" : "No",
    wa: d.wa === "WhatsApp" ? "WhatsApp" : "SMS/email"
  };
  try { await store().setJSON(keyFor(vt.ch, vt.to), rec); } catch (e) { console.log("started store failed", String(e).slice(0, 120)); }
  return json(200, { ok: true });
};
