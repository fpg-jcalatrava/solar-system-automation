import { requireIdentity } from "../../../cursor/identity.js";
import { loadDashboard } from "../../../lib/dashboard.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  const data = await loadDashboard();
  return Response.json(data, {
    headers: { "cache-control": "private, no-store" },
  });
}
