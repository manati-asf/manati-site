// Read-only TaskFlow access (the nati-lookup user), shared by functions that
// only need to check something in TaskFlow. Env: TF_LOOKUP_URL, TF_LOOKUP_DB,
// TF_LOOKUP_USER, TF_LOOKUP_PASSWORD.
let session = null;

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
export const tfConfigured = () => !!(process.env.TF_LOOKUP_URL && process.env.TF_LOOKUP_PASSWORD);

// True when this mobile (SA, 27xxxxxxxxx) or email already belongs to an OPEN
// Applications lead (any source: Nati, Student Hero, EI website...). A drop-off
// must never be sent for such a person: TaskFlow would update their real lead.
export async function hasOpenApplication(phone27, email) {
  const or = [];
  if (phone27) {
    const n9 = String(phone27).slice(-9);
    const spaced = n9.slice(0, 2) + " " + n9.slice(2, 5) + " " + n9.slice(5);
    for (const f of ["x_related_sponsor1_phone", "x_related_student_phone"]) { or.push([f, "ilike", n9], [f, "ilike", spaced]); }
  }
  if (email) for (const f of ["x_related_sponsor1_email", "x_related_student_email"]) or.push([f, "=ilike", String(email).trim()]);
  if (!or.length) return false;
  const domain = [["team_id", "=", 1], ["type", "=", "opportunity"], ["stage_id.x_is_final_stage", "=", false]];
  for (let i = 1; i < or.length; i++) domain.push("|");
  domain.push(...or);
  const u = await uid();
  const n = await rpc("object", "execute_kw", [process.env.TF_LOOKUP_DB, u, process.env.TF_LOOKUP_PASSWORD, "crm.lead", "search_count", [domain]]);
  return n > 0;
}
