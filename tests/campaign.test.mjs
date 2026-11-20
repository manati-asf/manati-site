// Local checks for campaign tags. No network: TaskFlow is simulated.
// Run: node --test tests/campaign.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { clean, approvedCampaign, campaignTag } = await import("../netlify/lib/campaign.js");

test("clean() accepts real names and rejects junk", () => {
  assert.equal(clean("UCT Posters 2027"), "UCT Posters 2027");
  assert.equal(clean("  UCT   Poster 1 "), "UCT Poster 1");
  assert.equal(clean("<script>alert(1)</script>"), null);
  assert.equal(clean("100%"), null);          // % is a wildcard in TaskFlow searches
  assert.equal(clean("a_b"), null);           // so is _
  assert.equal(clean("x".repeat(61)), null);  // length cap
  assert.equal(clean(""), null);
  assert.equal(clean(undefined), null);
  assert.equal(clean(["UCT"]), null);
});

test("campaignTag() combines only approved values", () => {
  assert.equal(campaignTag({ campaign: "UCT Posters 2027", source: "UCT Poster 1" }), "UCT Posters 2027 - UCT Poster 1");
  assert.equal(campaignTag({ campaign: "UCT Posters 2027", source: null }), "UCT Posters 2027");
  assert.equal(campaignTag(null), null);
  assert.equal(campaignTag({ campaign: null, source: "UCT Poster 1" }), null);
});

test("no TaskFlow login configured: fallback list, TaskFlow spelling", async () => {
  delete process.env.TF_LOOKUP_URL; delete process.env.TF_LOOKUP_PASSWORD;
  assert.deepEqual(await approvedCampaign({ campaign: "UCT Posters 2027", source: "UCT Poster 1" }), { campaign: "UCT Posters 2027", source: "UCT Poster 1" });
  assert.deepEqual(await approvedCampaign({ campaign: "uct posters 2027", source: "uct poster 2" }), { campaign: "UCT Posters 2027", source: "UCT Poster 2" });
  assert.deepEqual(await approvedCampaign({ campaign: "UCT Posters 2027", source: "Hacked" }), { campaign: "UCT Posters 2027", source: null });
  assert.equal(await approvedCampaign({ campaign: "Free Money 2027", source: "UCT Poster 1" }), null);
  assert.equal(await approvedCampaign({ source: "UCT Poster 1" }), null);
  assert.equal(await approvedCampaign(null), null);
});

// Simulated TaskFlow JSON-RPC for the nati-lookup user.
function fakeTaskFlow(handler) {
  process.env.TF_LOOKUP_URL = "https://tf.test"; process.env.TF_LOOKUP_DB = "db";
  process.env.TF_LOOKUP_USER = "nati-lookup"; process.env.TF_LOOKUP_PASSWORD = "x";
  globalThis.fetch = async (url, opts) => {
    const p = JSON.parse(opts.body).params;
    if (p.service === "common") return new Response(JSON.stringify({ result: 346 }));
    return new Response(JSON.stringify(handler(p.args)));
  };
}

test("TaskFlow is the source of truth when it answers", async () => {
  fakeTaskFlow((args) => {
    const camp = args[5][0][0][2];
    if (camp.toLowerCase() === "open day 2028") return { result: [{ campaign_id: [9, "Open Day 2028"], source_id: [80, "Stand A"] }] };
    return { result: [] };
  });
  assert.deepEqual(await approvedCampaign({ campaign: "open day 2028", source: "stand a" }), { campaign: "Open Day 2028", source: "Stand A" });
  // In the fallback list but not in the Link Tracker: TaskFlow says no, so no tag.
  assert.equal(await approvedCampaign({ campaign: "UCT Posters 2027", source: "UCT Poster 3" }), null);
});

test("TaskFlow refuses access: falls back to the list", async () => {
  fakeTaskFlow(() => ({ error: { message: "Access Denied" } }));
  assert.deepEqual(await approvedCampaign({ campaign: "UCT Posters 2027", source: "UCT Poster 4" }), { campaign: "UCT Posters 2027", source: "UCT Poster 4" });
  assert.equal(await approvedCampaign({ campaign: "Something Else", source: "X" }), null);
});

test("apply: browser cannot set source or tags; approved campaign is added", async () => {
  delete process.env.TF_LOOKUP_URL; delete process.env.TF_LOOKUP_PASSWORD;
  process.env.TASKFLOW_TEST_MODE = "1"; process.env.TASKFLOW_WEBHOOK_URL = "https://tf.test/hook";
  const { default: apply } = await import("../netlify/functions/apply.js");
  const send = async (campaign) => {
    const body = { data: { "x_student-email": "test@example.com", "x_consent_timestamp": "2026-11-18",
      "x_source": "junk", "x_tag_one": "junk", "x_tag_three": "junk", "x_tag_four": "junk", "x_tag_five": "junk" }, campaign };
    const r = await apply(new Request("https://manati.co.za/api/apply", { method: "POST", body: JSON.stringify(body), headers: { "x-nf-client-connection-ip": "10.0.0." + Math.floor(Math.random() * 250) } }));
    return (await r.json()).wouldSend;
  };
  const none = await send(undefined);
  assert.equal(none["x_source"], "manati.co.za web bot");
  assert.equal(none["x_tag_one"], "From Manati Bot");
  assert.equal(none["x_tag_three"], null);
  assert.equal(none["x_tag_four"], null);
  assert.equal(none["x_tag_five"], null);
  const edited = await send({ campaign: "UCT Posters 2027", source: "Anything I like" });
  assert.equal(edited["x_tag_three"], null);
  assert.equal(edited["x_tag_four"], "UCT Posters 2027");
  const good = await send({ campaign: "UCT Posters 2027", source: "UCT Poster 1" });
  assert.equal(good["x_tag_three"], null);
  assert.equal(good["x_tag_four"], "UCT Posters 2027 - UCT Poster 1");
  const junk = await send({ campaign: "Junk Campaign", source: "UCT Poster 1" });
  assert.equal(junk["x_tag_three"], null);
  assert.equal(junk["x_tag_four"], null);
});
