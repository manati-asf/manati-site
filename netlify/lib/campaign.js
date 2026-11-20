// Campaign tags for Nati leads.
//
// Tracked links made in TaskFlow's Link Tracker (manati.taskflow.co.za/r/xxx)
// redirect here with utm_campaign / utm_source in the address. The browser keeps
// those two values for the session (see Base.astro) and sends them with the
// application and the drop-off record. This file decides whether they may become
// a TaskFlow tag.
//
// Campaign and source are still checked as two separate values against the Link
// Tracker. They are only combined into one tag (x_tag_four, "Campaign - Source")
// when the lead is sent, because TaskFlow's bot_webhook ignores x_tag_three
// (confirmed in the 19 Nov 2026 test). Once TaskFlow maps campaign and source
// into the lead's own Campaign and Source fields, campaignTag() can go.
//
// TaskFlow creates a tag for any new value it receives, so a value is only used
// when it matches a tracked link that exists in the Link Tracker and points to
// manati.co.za. To add a campaign, create its links in the Link Tracker: nothing
// changes here. FALLBACK is used only when TaskFlow cannot be asked (the
// nati-lookup user is not configured, cannot read link.tracker, or is down).
import { tfConfigured, findTrackedLink } from "./tfread.js";

export const MAX_LEN = 60;

export const FALLBACK = {
  "UCT Posters 2027": ["UCT Poster 1", "UCT Poster 2", "UCT Poster 3", "UCT Poster 4"]
};

// Letters, digits, spaces and a few separators. No % or _ (wildcards in a
// TaskFlow name search) and nothing that could carry markup.
const SAFE = /^[\p{L}\p{N} .,&()'\/-]+$/u;

export function clean(v) {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!s || s.length > MAX_LEN || !SAFE.test(s)) return null;
  return s;
}

function fromFallback(campaign, source) {
  const key = Object.keys(FALLBACK).find((k) => k.toLowerCase() === campaign.toLowerCase());
  if (!key) return null;
  const src = source ? FALLBACK[key].find((x) => x.toLowerCase() === source.toLowerCase()) || null : null;
  return { campaign: key, source: src };
}

// The one tag sent to TaskFlow for an approved campaign: "Campaign - Source",
// or just the campaign when no approved source came with it. null when there
// is no approved campaign.
export function campaignTag(c) {
  if (!c || !c.campaign) return null;
  return c.source ? c.campaign + " - " + c.source : c.campaign;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // "campaign|source" (lower case) -> { at, value }

// Returns { campaign, source } with the exact spelling from TaskFlow (source may
// be null if only the campaign matched), or null if nothing may be sent.
// Never throws: a problem here must never stop an application.
export async function approvedCampaign(input) {
  try {
    const campaign = clean(input && input.campaign);
    if (!campaign) return null;
    const source = clean(input && input.source);
    const key = (campaign + "|" + (source || "")).toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

    let value;
    if (tfConfigured()) {
      try {
        value = await findTrackedLink(campaign, source);
      } catch (e) {
        console.log("campaign check: TaskFlow lookup failed, using fallback list", String(e).slice(0, 120));
        value = fromFallback(campaign, source);
      }
    } else {
      value = fromFallback(campaign, source);
    }
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.log("campaign check error", String(e).slice(0, 120));
    return null;
  }
}
