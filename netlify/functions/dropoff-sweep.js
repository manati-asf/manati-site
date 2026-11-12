// Scheduled Netlify Function: every 30 minutes, send verified applicants who
// did not finish within 2 hours to TaskFlow as a "Nati drop-off" lead.
// Switched off unless DROPOFF_ENABLED=1 (TaskFlow needs the "Nati drop-off"
// stage and the webhook mapping for it first).
import { store, DROPOFF_AFTER_MS, DROPOFF_MAX_AGE_MS } from "../lib/dropoff.js";
import { buildPayload } from "./apply.js";

export const config = { schedule: "*/30 * * * *" };

export default async () => {
  if (process.env.DROPOFF_ENABLED !== "1") return new Response("disabled");
  const url = process.env.TASKFLOW_WEBHOOK_URL;
  const s = store();
  const { blobs } = await s.list();
  let sent = 0, dropped = 0, waiting = 0;
  for (const b of blobs) {
    const rec = await s.get(b.key, { type: "json" });
    if (!rec) continue;
    const age = Date.now() - (rec.at || 0);
    if (age < DROPOFF_AFTER_MS) { waiting++; continue; }
    if (age > DROPOFF_MAX_AGE_MS || !url) { await s.delete(b.key); dropped++; continue; }
    const sp = rec.who === "Sponsor";
    const local = rec.phone && /^27\d{9}$/.test(rec.phone) ? "0" + rec.phone.slice(2) : rec.phone;
    const data = {
      "x_student_or_sponsor": rec.who,
      "x_application_outcome": "Nati drop-off",
      "x_tag_two": "Nati drop-off",
      "x_crm.lead-x_educational_institution_id": rec.institution,
      "x_crm.lead-x_current_student_loan": rec.existing,
      "x_whatsapp_consent": rec.wa === "WhatsApp" ? "Yes" : "No",
      "x_contact_channel": rec.wa,
      "x_special_instruction": "Nati drop-off: verified their " + (rec.ch === "sms" ? "mobile number" : "email address") +
        " on " + new Date(rec.at).toISOString().replace("T", " ").slice(0, 16) + " UTC but did not finish the application." +
        (rec.existing === "Yes" ? " Says they are an EXISTING Manati customer." : "") +
        (rec.unlisted ? " Institution not on Nati's list: " + rec.institution + "." : "")
    };
    if (sp) { data["x_sponsor.one-phone"] = local; data["x_sponsor.one-email"] = rec.email; }
    else { data["x_student-phone"] = local; data["x_student-email"] = rec.email; }
    if (rec.unlisted) { delete data["x_crm.lead-x_educational_institution_id"]; data["x_crm.lead-x_name_of_campus"] = "Not on Nati list: " + rec.institution; }
    const payload = buildPayload(data);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.ok) { await s.delete(b.key); sent++; } else console.log("dropoff send failed", r.status);
    } catch (e) { console.log("dropoff send error", String(e).slice(0, 120)); }
  }
  console.log("dropoff-sweep sent", sent, "waiting", waiting, "expired", dropped);
  return new Response("ok");
};
