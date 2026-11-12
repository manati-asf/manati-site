// Netlify Function: /api/apply
// Receives the application bot's collected answers, assembles the exact TaskFlow
// payload (correct keys + casing), and POSTs it server-side to the TaskFlow
// bot_webhook endpoint. The endpoint URL (which contains the secret token) is
// read from the TASKFLOW_WEBHOOK_URL environment variable and is NEVER exposed
// to the browser.
//
// Set in Netlify: Site settings → Environment variables →
//   TASKFLOW_WEBHOOK_URL = https://manati.taskflow.co.za/webhook/json/bot_webhook/<token>
// (Optional) TASKFLOW_TEST_MODE = "1" to log instead of forwarding while testing.

import { checkVerified, normalisePhone, normaliseEmail } from "../lib/otp.js";
import { forget } from "../lib/dropoff.js";

// Canonical payload template — every key TaskFlow expects, defaulting to null.
// Keys and casing must match exactly (note the capital-X on two of them).
const TEMPLATE = {
  "x_bot_id": null,
  "x_header": null,
  "x_stage": null,
  "x_application_outcome": null,
  "x_decline_reason": null,
  "x_applying_device": null,
  "x_crm.lead-user_id": null,
  "x_student_hero_partnership_status": null,
  "x_educational_institution_manati_partnered": null,
  "x_crm.lead-x_consent_credit_check": null,
  "x_sponsor.one-x_credit_check": null,
  "x_sponsor.two-x_credit_check": null,
  "x_student-x_credit_check": null,
  "x_credit_check_timestamp": null,
  "x_crm.lead-x_educational_institution_id": null,
  "x_crm.lead-x_name_of_campus": null,
  "x_crm.lead-x_advisor_name": null,
  "x_student_advisor_email": null,
  "x_student_or_sponsor": null,
  "x_crm.lead-x_self_funded": null,
  "x_sponsor_two_yes_no": null,
  "x_sponsor_one_bank_qualified_yes_no": null,
  "x_sponsor_one_manati_qualified_yes_no": null,
  "x_sponsor_two_income_details_available_yes_no": null,
  "x_sponsor_two_bank_qualified_yes_no": null,
  "x_sponsor_two_manati_qualified_yes_no": null,
  "x_joint_application_manati_qualified_yes_no": null,
  "x_explore_manati_yes_no": null,
  "x_documents_uploaded_yes_no": null,
  "x_unsuccesful_verification_selection": null,
  "x_sponsor_one_callback_scheduled_yes_no": null,
  "x_sponsor_one_callback_scheduled_time": null,
  "x_special_instruction": null,
  "x_sponsor.one-name": null,
  "X_sponsor.one-surname": null,
  "x_sponsor.one-id_number": null,
  "x_sponsor.one-dob": null,
  "x_sponsor.one-phone": null,
  "x_sponsor.one-mobile": null,
  "x_sponsor.one-email": null,
  "x_sponsor_one_contact_preference": null,
  "x_sponsor_one_whatsapp_agent": null,
  "x_crm.lead-x_relation_to_student": null,
  "x_crm.lead-x_employment_status": null,
  "x_crm.lead-x_gross_salary": null,
  "x_crm.lead-x_nett_salary": null,
  "x_crm.lead-x_sponsor_one_additional_income": null,
  "x_crm.lead-x_sponsor_one_additional_income_value": null,
  "x_crm.lead-x_sponsor_one_additional_income_source": null,
  "x_sponsor_one_surplus": null,
  "x_sponsor_one_net_income_3rd": null,
  "x_sponsor_one_affordability_manati": null,
  "x_sponsor_one_income_total": null,
  "x_sponsor.one-gender": null,
  "x_sponsor.one-x_race": null,
  "x_sponsor_one_marital_status": null,
  "x_sponsor.one-x_state_id": null,
  "x_sponsor_one_credit_status": null,
  "x_sponsor_one_bank": null,
  "X_sponsor_one_monthly_expenses": null,
  "x_sponsor_one_bond_or_rent": null,
  "x_sponsor_one_vehicle_finance_instalment": null,
  "x_sponsor_one_other_loans_instalment": null,
  "x_sponsor_one_travel_expense": null,
  "x_sponsor_one_telepone_and_data": null,
  "x_sponsor_one_groceries": null,
  "x_sponsor_one_other_expenses": null,
  "x_sponsor_one_insurance_instalment": null,
  "x_sponsor_one_insurance_type": null,
  "x_sponsor.two-x_name": null,
  "x_sponsor.two-x_surname": null,
  "x_sponsor_two_id_number_available_yes_no": null,
  "x_sponsor.two-x_id_number": null,
  "x_sponsor_two_relation_to_sponsor_one": null,
  "x_sponsor.two-phone": null,
  "x_sponsor.two-email": null,
  "x_sponsor_two_contact_preference": null,
  "x_crm.lead-x_sponsor_two_gross_income": null,
  "x_crm.lead-x_sponsor_two_net_income": null,
  "x_sponsor_two_employment_status": null,
  "x_crm.lead-x_sponsor_two_additional_income_source": null,
  "x_crm.lead-x_sponsor_two_additional_income_value": null,
  "x_sponsor_two_monthly_expenses": null,
  "x_sponsor_two_credit_status": null,
  "x_sponsor_two_surplus": null,
  "x_sponsor_two_net_income_3rd": null,
  "x_sponsor_two_affordability_manati": null,
  "x_joint_manati_affordability": null,
  "x_student-x_name": null,
  "x_student-x_surname": null,
  "x_student-phone": null,
  "x_student-email": null,
  "x_student-x_id_number": null,
  "x_crm.lead-x_loan_amount": null,
  "x_loan_amount_tuition_fee": null,
  "x_loan_amount_equipment": null,
  "x_loan_amount_accomodation": null,
  "x_loan_amount_arrear_fees": null,
  "x_loan_amount_total_manati": null,
  "x_loan_term_manati": null,
  "x_loan_instalment_interest_only": null,
  "x_loan_instalment_bank": null,
  "x_loan_instalment_manati": null,
  "x_student_registered_yes_no": null,
  "x_crm.lead-x_qualification": null,
  "x_student_year_of_study": null,
  "x_student_course_duration": null,
  // --- NEW keys sent by apply-bot v2 (aligned to Landbot). Names UNCONFIRMED against the
  // TaskFlow bot_webhook schema — confirm before go-live. Kept here so buildPayload does not
  // drop them; harmless if the webhook ignores unknown keys. ---
  "x_whatsapp_consent": null,
  "x_contact_channel": null,
  "x_consent_given_by": null,
  "x_consent_timestamp": null,
  "x_consent_version": null,
  // Existing-customer flag. Uses the x_crm.lead-<field> convention (like x_self_funded) so the
  // bot_webhook writes it to the crm.lead boolean x_current_student_loan ("Yes"/"No").
  "x_crm.lead-x_current_student_loan": null,
  "x_student-identification_type": null,
  "x_student-alt_phone": null,
  "x_student-gender": null,
  "x_student-x_race": null,
  "x_student-x_state_id": null,
  "x_source": null,
  "x_tag_one": null,
  "x_tag_two": null,
  "x_tag_three": null,
  "x_tag_four": null,
  "x_tag_five": null,
  "sponsor_docs": {
    "x_doc_sponsor_id": null,
    "x_doc_sponsor_payslips": null,
    "x_doc_sponsor_bankstatements": null,
    "x_doc_sponsor_proof_of_residence": null
  },
  "student_docs": {
    "x_doc_student_id": null,
    "x_doc_student_latest_results": null,
    "x_doc_student_letter_of_acceptance": null,
    "x_doc_student_fee_statement": null
  },
  "mail_notify_force_send": false
};

// Netlify Functions v2 (export default) must return a Web Response object.
const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json" }
});

// --- Lightweight per-IP rate limit (secondary guard behind Turnstile) ---
// Caps how often one IP can submit. This is best-effort: serverless instances
// don't share memory, so it's not a hard global limit, but it stops a single
// source from hammering the endpoint and loading TaskFlow. Turnstile remains
// the primary bot defence. Generous enough that a real applicant retrying will
// not hit it (5 submissions per IP per 10 minutes).
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 5;
const rlHits = new Map(); // ip -> [timestamps within window]

function clientIpOf(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
  );
}

function rateLimited(ip) {
  if (!ip) return false; // no IP to key on: don't block (Turnstile still applies)
  const now = Date.now();
  const recent = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  rlHits.set(ip, recent);
  // Bound memory on warm instances: drop IPs whose window has fully elapsed.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      if (!v.length || now - v[v.length - 1] > RL_WINDOW_MS) rlHits.delete(k);
    }
  }
  return recent.length > RL_MAX;
}

export function buildPayload(data) {
  // Start from a deep copy of the template so every key is present with the
  // exact name/casing, then overlay only the keys the client actually sent.
  const out = JSON.parse(JSON.stringify(TEMPLATE));
  for (const key of Object.keys(data || {})) {
    if (key === "sponsor_docs" || key === "student_docs") {
      // documents handled in a later phase — keep nulls for now
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = data[key];
    }
  }
  // Server-set fields (don't trust the client for these)
  out["x_application_outcome"] = out["x_application_outcome"] || "New Application";
  out["x_source"] = out["x_source"] || "manati.co.za web bot";
  // Attribution tag so applications from Nati are identifiable in TaskFlow (like "From Student Hero").
  out["x_tag_one"] = "From Manati Bot";
  out["x_credit_check_timestamp"] = new Date().toISOString().slice(0, 10);
  return out;
}

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  // Shed abusive volume from a single source before doing any real work.
  if (rateLimited(clientIpOf(req))) {
    return json(429, { ok: false, error: "Too many attempts. Please wait a few minutes and try again." });
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  // Honeypot: bots fill hidden fields; humans don't.
  if (body && body.company) {
    return json(200, { ok: true, ref: null }); // silently accept + drop
  }

  // Cloudflare Turnstile verification. Only enforced once TURNSTILE_SECRET_KEY
  // is set in the Netlify environment, so the live form keeps working until the
  // keys are in place. Once set, a valid token is required.
  const TS_SECRET = process.env.TURNSTILE_SECRET_KEY;
  if (TS_SECRET) {
    const token = body && body.turnstileToken;
    if (!token) {
      return json(403, { ok: false, error: "Human verification required. Please try again." });
    }
    try {
      const form = new URLSearchParams();
      form.append("secret", TS_SECRET);
      form.append("response", token);
      const ip =
        req.headers.get("x-nf-client-connection-ip") ||
        (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
      if (ip) form.append("remoteip", ip);
      const vr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form
      });
      const vj = await vr.json().catch(() => ({ success: false }));
      if (!vj.success) {
        return json(403, { ok: false, error: "Human verification failed. Please try again." });
      }
    } catch (_) {
      return json(502, { ok: false, error: "Could not verify your request. Please try again." });
    }
  }

  const data = (body && body.data) || {};

  // Minimal validation: need at least a contactable applicant and consent.
  const hasContact =
    data["x_student-email"] || data["x_sponsor.one-email"] ||
    data["x_student-phone"] || data["x_sponsor.one-phone"];
  if (!hasContact) {
    return json(422, { ok: false, error: "Missing applicant contact details" });
  }
  // The applicant's own declaration + consent (the two tick-boxes on the final
  // screen) is what we require here. The client only sets x_consent_timestamp once
  // both boxes are ticked, so its presence proves the applicant consented.
  // NOTE: do NOT require x_crm.lead-x_consent_credit_check === "Yes". That field is
  // the LOAN HOLDER's credit-check consent, which is legitimately "Outstanding" when
  // a student applies on behalf of a sponsor who must still give their own consent
  // (sponsor routes). Requiring "Yes" here wrongly blocked those applications.
  if (!data["x_consent_timestamp"]) {
    return json(422, { ok: false, error: "Consent is required" });
  }

  // Verification code check (see netlify/lib/otp.js). The verified number/email
  // must belong to the applicant: the sponsor when a sponsor applies, otherwise
  // the student. Enforced only when OTP_REQUIRED=1, so this can ship before the
  // bot step is switched on; when a valid token is present we always note it.
  let verifiedNote = null;
  const vt = checkVerified(body && body.verifiedToken);
  if (vt) {
    const isSponsor = data["x_student_or_sponsor"] === "Sponsor";
    const phone = isSponsor ? data["x_sponsor.one-phone"] : data["x_student-phone"];
    const email = isSponsor ? data["x_sponsor.one-email"] : data["x_student-email"];
    const matches = vt.ch === "sms" ? normalisePhone(phone) === vt.to : normaliseEmail(email) === vt.to;
    if (matches) {
      const what = vt.ch === "sms" ? "mobile number 0" + vt.to.slice(2) + " verified by SMS code" : "email address " + vt.to + " verified by email code";
      verifiedNote = "Applicant's " + what + " (" + new Date(vt.at).toISOString().replace("T", " ").slice(0, 16) + " UTC).";
    }
  }
  if (process.env.OTP_REQUIRED === "1" && !verifiedNote) {
    return json(403, { ok: false, error: "Please verify your mobile number (or email) before submitting." });
  }

  const url = process.env.TASKFLOW_WEBHOOK_URL;
  if (!url) {
    return json(500, { ok: false, error: "Webhook URL not configured" });
  }

  // Outcome / drop-off tag are set server-side only (the drop-off sweep uses its own values).
  delete data["x_application_outcome"]; delete data["x_tag_two"];
  const payload = buildPayload(data);
  // The TaskFlow webhook does not (yet) map the existing-customer flag onto the
  // lead's "Currently have a student loan?" box, so also say it in the note.
  const existingNote = data["x_crm.lead-x_current_student_loan"] === "Yes"
    ? "Applicant says they are an EXISTING Manati customer." : null;
  const lead = [existingNote, verifiedNote].filter(Boolean).join(" ");
  if (lead) {
    payload["x_special_instruction"] = payload["x_special_instruction"] ? lead + " " + payload["x_special_instruction"] : lead;
  }

  // Test mode: don't forward, just echo back what would be sent.
  if (process.env.TASKFLOW_TEST_MODE === "1") {
    return json(200, { ok: true, test: true, wouldSend: payload });
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    if (!resp.ok) {
      return json(502, { ok: false, error: "TaskFlow rejected the request", status: resp.status, detail: text.slice(0, 500) });
    }
    if (vt) await forget(vt.ch, vt.to); // finished: not a drop-off
    return json(200, { ok: true, status: resp.status });
  } catch (err) {
    return json(502, { ok: false, error: "Could not reach TaskFlow", detail: String(err).slice(0, 200) });
  }
};
