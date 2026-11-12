// Nati drop-offs: applicants who verified their mobile/email but did not finish.
// We hold a small record per verified applicant in Netlify Blobs; /api/apply
// removes it on a successful submission, and the scheduled dropoff-sweep sends
// anything older than DROPOFF_AFTER_MS to TaskFlow as a "Nati drop-off" lead.
// Records hold contact details only and are deleted once sent (or after 48h).
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

export const DROPOFF_AFTER_MS = 2 * 60 * 60 * 1000;   // treat as a drop-off after 2 hours
export const DROPOFF_MAX_AGE_MS = 48 * 60 * 60 * 1000; // never keep a record longer than 48 hours

export const store = () => getStore("nati-dropoff");
export const keyFor = (ch, to) => crypto.createHash("sha256").update("dropoff-v1:" + ch + ":" + to).digest("hex");

export async function forget(ch, to) {
  try { await store().delete(keyFor(ch, to)); } catch (e) { console.log("dropoff forget failed", String(e).slice(0, 120)); }
}
