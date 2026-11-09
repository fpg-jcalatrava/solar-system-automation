import { headers } from "next/headers";
import { getIdentity } from "../cursor/identity.js";
import { loadDashboard } from "../lib/dashboard.js";
import { Board } from "./board.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  const identity = await getIdentity(await headers());
  if (!identity.verified) {
    return (
      <main className="shell">
        <section className="gate">
          <p className="eyebrow">Plant watch</p>
          <h1>Sign in to read the plants</h1>
          <p>This board is for a signed-in viewer.</p>
        </section>
      </main>
    );
  }
  const data = await loadDashboard();
  const viewer = identity.name?.trim() || "Signed in";
  return <Board initial={data} viewer={viewer} />;
}
