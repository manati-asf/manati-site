// Netlify Function: /api/lookup
// For existing customers: after the applicant has verified their mobile number
// (or email) with a code, find their most recent application in TaskFlow and
// return a SHORT, fixed set of details to pre-fill Nati.
//
// Privacy rules (POPIA):
//  - Only works with a valid "verified" token from /api/otp-verify.
//  - Only searches by the verified number/email, in the applicant's own role.
//  - Reads only the fields in FIELDS below. Never ID numbers, dates of birth,
//    income, banking, addresses, credit or affordability data.
//  - If the number/email matches more than one different person, returns
//    nothing (shared numbers are common), so no one sees someone else's details.
//
// Env (Netlify, secret): TF_LOOKUP_URL, TF_LOOKUP_DB, TF_LOOKUP_USER, TF_LOOKUP_PASSWORD
import { json, checkVerified, limiter, clientIpOf } from "../lib/otp.js";

const ipLimit = limiter(10 * 60 * 1000, 10);
const tokLimit = limiter(60 * 60 * 1000, 3);

const FIELDS = [
  "id", "write_date",
  "x_related_sponsor1_name", "x_related_sponsor1_surname", "x_related_sponsor1_phone", "x_related_sponsor1_email", "x_related_sponsor1_state_id", "x_relation_to_student",
  "x_related_student_name", "x_related_student_surname", "x_related_student_phone", "x_related_student_email", "x_related_student_state_id"
];

let session = null; // { uid } cached on a warm instance

async function rpc(service, method, args) {
  const r = await fetch(process.env.TF_LOOKUP_URL.replace(/\/$/, "") + "/jsonrpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() })
  });
  const j = await r.json();
  if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message || "TaskFlow error");
  return j.result;
}
async function uid() {
  if (session) return session.uid;
  const u = await rpc("common", "login", [process.env.TF_LOOKUP_DB, process.env.TF_LOOKUP_USER, process.env.TF_LOOKUP_PASSWORD]);
  if (!u) throw new Error("TaskFlow login failed");
  session = { uid: u };
  return u;
}
async function searchRead(domain, limit) {
  const u = await uid();
  return rpc("object", "execute_kw", [process.env.TF_LOOKUP_DB, u, process.env.TF_LOOKUP_PASSWORD, "crm.lead", "search_read", [domain], { fields: FIELDS, limit, order: "write_date desc", context: { active_test: false } }]);
}

const digits = (v) => String(v || "").replace(/\D/g, "");
const last9 = (v) => digits(v).slice(-9);
const lc = (v) => String(v || "").trim().toLowerCase();
const m2o = (v) => (Array.isArray(v) ? v[1] : null);
const clean = (v) => (v && v !== false ? String(v).trim() : null);

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!process.env.TF_LOOKUP_URL || !process.env.TF_LOOKUP_PASSWORD) return json(200, { ok: true, found: false, reason: "not_configured" });
  if (ipLimit(clientIpOf(req))) return json(429, { ok: false, error: "Too many requests. Please continue with your application." });

  let body; try { body = await req.json(); } catch (_) { return json(400, { ok: false, error: "Invalid request" }); }
  const vt = checkVerified(body && body.verifiedToken);
  if (!vt) return json(403, { ok: false, error: "Please verify your number first." });
  if (tokLimit(String(body.verifiedToken).slice(-24))) return json(429, { ok: false, error: "Too many requests." });

  const role = body.role === "Sponsor" ? "sponsor" : "student";
  const pf = role === "sponsor" ? "x_related_sponsor1_" : "x_related_student_";
  let domain;
  if (vt.ch === "sms") {
    const n9 = vt.to.slice(-9); // e.g. 834140032
    const spaced = n9.slice(0, 2) + " " + n9.slice(2, 5) + " " + n9.slice(5); // 83 414 0032
    domain = ["|", [pf + "phone", "ilike", n9], [pf + "phone", "ilike", spaced]];
  } else {
    domain = [[pf + "email", "=ilike", vt.to]];
  }

  try {
    const rows = await searchRead(domain, 20);
    // Confirm the match exactly (ilike can over-match) and that it is one person.
    const mine = rows.filter((r) => vt.ch === "sms" ? last9(r[pf + "phone"]) === vt.to.slice(-9) : lc(r[pf + "email"]) === vt.to);
    if (!mine.length) { console.log("lookup", role, vt.ch, "none"); return json(200, { ok: true, found: false }); }
    const people = new Set(mine.map((r) => lc(r[pf + "name"]).split(" ")[0] + "|" + lc(r[pf + "surname"])));
    if (people.size > 1) { console.log("lookup", role, vt.ch, "ambiguous", people.size); return json(200, { ok: true, found: false, reason: "ambiguous" }); }

    const r = mine[0]; // most recently updated application for this person
    console.log("lookup", role, vt.ch, "found lead", r.id);
    const out = {
      sponsor: role === "sponsor" ? {
        first: clean(r.x_related_sponsor1_name), last: clean(r.x_related_sponsor1_surname),
        email: clean(r.x_related_sponsor1_email), province: m2o(r.x_related_sponsor1_state_id),
        relation: clean(r.x_relation_to_student)
      } : null,
      student: {
        first: clean(r.x_related_student_name), last: clean(r.x_related_student_surname),
        phone: role === "sponsor" ? clean(r.x_related_student_phone) : null,
        email: clean(r.x_related_student_email), province: m2o(r.x_related_student_state_id)
      }
    };
    return json(200, { ok: true, found: true, details: out });
  } catch (e) {
    session = null;
    console.log("lookup error", String(e).slice(0, 200));
    return json(200, { ok: true, found: false, reason: "error" });
  }
};
