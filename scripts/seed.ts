/**
 * Local seed: Norven as workspace #0, one dev user, one sample draft.
 *
 * Run via `node scripts/seed.ts` (Node ≥22.18 strips erasable TS natively —
 * keep this file enum/namespace-free so it stays runnable without a loader).
 *
 * Currently a stub: the real inserts land once `packages/db` exists
 * (scaffold/package-db branch). The shape below is the contract.
 */

type SeedPlan = {
  workspace: { slug: string; name: string; template: string };
  user: { email: string; role: "owner" };
  draft: { kind: "sample"; note: string };
};

const plan: SeedPlan = {
  workspace: { slug: "norven", name: "Norven", template: "template-norven" },
  user: { email: "dev@plinth.local", role: "owner" },
  draft: { kind: "sample", note: "minimal draft so the editor opens non-empty" },
};

async function main(): Promise<void> {
  const dbScaffolded = false; // flips when @plinth/db lands (package-db branch)

  if (!dbScaffolded) {
    console.log("[seed] packages/db not scaffolded yet — nothing to insert.");
    console.log("[seed] will create:", JSON.stringify(plan, null, 2));
    return;
  }
}

main().catch((err: unknown) => {
  console.error("[seed] failed:", err);
  process.exitCode = 1;
});
