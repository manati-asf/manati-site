// Netlify Function: /api/otp-send
// Sends a 6-digit verification code by SMS (Clickatell One API) or, as a backup,
// by email (Brevo). Returns a signed challenge token; the code itself is never
// returned to the browser.
import { json, configured, normalisePhone, normaliseEmail, newCode, makeChallenge, limiter, clientIpOf, mask } from "../lib/otp.js";

const ipLimit = limiter(10 * 60 * 1000, 5);   // 5 sends per IP per 10 min
const toLimit = limiter(10 * 60 * 1000, 3);   // 3 sends per number/email per 10 min

async function sendSms(to, code) {
  const r = await fetch("https://platform.clickatell.com/v1/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": process.env.CLICKATELL_OTP_API_KEY },
    body: JSON.stringify({ messages: [{ channel: "sms", to, content: `Your Manati verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.` }] })
  });
  const j = await r.json().catch(() => ({}));
  const m = j && j.messages && j.messages[0];
  if (!r.ok || !m || m.accepted === false) {
    console.log("otp-send sms failed", r.status, JSON.stringify(j).slice(0, 300));
    return false;
  }
  return true;
}

async function sendEmail(to, code) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return false;
  const from = process.env.OTP_EMAIL_FROM || "noreply@mail.manati.co.za";
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "api-key": key },
    body: JSON.stringify({
      sender: { name: "Manati Student Funding", email: from },
      to: [{ email: to }],
      subject: `Your Manati verification code: ${code}`,
      textContent: `Your Manati verification code is ${code}.\n\nIt expires in 10 minutes. Do not share this code with anyone. If you did not request it, you can ignore this email.\n\nManati Alternate Student Funding (NCRCP8052)`,
      htmlContent: `<p>Your Manati verification code is <b style="font-size:20px;letter-spacing:2px">${code}</b>.</p><p>It expires in 10 minutes. Do not share this code with anyone. If you did not request it, you can ignore this email.</p><p>Manati Alternate Student Funding (NCRCP8052)</p>`
    })
  });
  if (!r.ok) { console.log("otp-send email failed", r.status, (await r.text()).slice(0, 300)); return false; }
  return true;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!configured()) return json(503, { ok: false, error: "Verification is not available right now." });
  if (ipLimit(clientIpOf(req))) return json(429, { ok: false, error: "Too many codes requested. Please wait a few minutes and try again." });

  let body; try { body = await req.json(); } catch (_) { return json(400, { ok: false, error: "Invalid request" }); }
  if (body && body.company) return json(200, { ok: true, challenge: null }); // honeypot

  const ch = body && body.channel === "email" ? "email" : "sms";
  if (ch === "email" && !process.env.BREVO_API_KEY) {
    return json(400, { ok: false, error: "Email codes are not available right now. Please use your mobile number." });
  }
  const to = ch === "sms" ? normalisePhone(body.to) : normaliseEmail(body.to);
  if (!to) {
    return json(422, { ok: false, error: ch === "sms" ? "Please enter a valid South African mobile number." : "Please enter a valid email address." });
  }
  if (toLimit(ch + ":" + to)) return json(429, { ok: false, error: "We've already sent a few codes. Please wait a few minutes before asking for another." });

  const code = newCode();
  const sent = ch === "sms" ? await sendSms(to, code) : await sendEmail(to, code);
  if (!sent) return json(502, { ok: false, error: ch === "sms" ? "We couldn't send the SMS just now. Please try again, or use your email address instead." : "We couldn't send the email just now. Please try again." });

  return json(200, { ok: true, channel: ch, sentTo: mask(ch, to), challenge: makeChallenge(ch, to, code) });
};
