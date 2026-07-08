/**
 * Local seed: Norven as workspace #0, one dev user with an owner membership,
 * and a sample draft that validates against the real Norven template schema —
 * so the editor opens non-empty and magic-link login lands on a workspace.
 *
 * Run via `pnpm seed` (tsx, not plain node: workspace packages ship TS source
 * with extensionless relative imports, which node's type stripping cannot
 * resolve). Idempotent — every insert is keyed on its natural unique
 * constraint, so re-runs are no-ops. `DATABASE_URL` overrides the compose-dev
 * default; scripts/local-prod.sh points it at the local-prod stack.
 */
import { createDb, withWorkspace } from "@plinth/db";
import { contentDrafts, users, workspaceMemberships, workspaces } from "@plinth/db/schema";
import { norvenDocument } from "@plinth/template-norven";
import { eq } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth";

const SEED_USER = { email: "dev@plinth.local", name: "Dev User" };
const SEED_WORKSPACE = { slug: "norven", name: "Norven", templateId: "template-norven" };

/** Media-free sections only — hero and projects require media rows, which
 * don't exist until the media pipeline lands (ADR-0006). Parsed through the
 * template manifest so the seed can never produce a draft the editor and
 * publish path wouldn't accept. */
const sampleDocument = norvenDocument.parse({
  sections: [
    {
      type: "intro",
      fields: {
        heading: "Architecture for places that already exist",
        body: "Norven is a fictional architecture studio. This draft was created by the local seed so the editor opens non-empty — replace every field with real content, or publish it as-is to see the pipeline move.",
      },
    },
    {
      type: "frame",
      fields: {
        heading: "Start a conversation",
        body: "The studio takes on a small number of projects each year. Tell us about the site, the constraints, and the ambition.",
        cta: { label: "Get in touch", href: "/contact" },
      },
    },
  ],
});

async function main(): Promise<void> {
  const { db, pool } = createDb({ connectionString, max: 3 });
  try {
    const [insertedUser] = await db
      .insert(users)
      .values({ ...SEED_USER, emailVerified: true })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    const user =
      insertedUser ??
      (await db.select({ id: users.id }).from(users).where(eq(users.email, SEED_USER.email)))[0];
    if (!user) throw new Error(`user ${SEED_USER.email} neither inserted nor found`);

    const [insertedWorkspace] = await db
      .insert(workspaces)
      .values(SEED_WORKSPACE)
      .onConflictDoNothing({ target: workspaces.slug })
      .returning({ id: workspaces.id });
    const workspace =
      insertedWorkspace ??
      (
        await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.slug, SEED_WORKSPACE.slug))
      )[0];
    if (!workspace) throw new Error(`workspace ${SEED_WORKSPACE.slug} neither inserted nor found`);

    await db
      .insert(workspaceMemberships)
      .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
      .onConflictDoNothing();

    // content_drafts is RLS-scoped — the insert goes through the same
    // withWorkspace seam every runtime query uses (ADR-0002).
    await withWorkspace(db, workspace.id, (tx) =>
      tx
        .insert(contentDrafts)
        .values({ workspaceId: workspace.id, document: sampleDocument })
        .onConflictDoNothing({ target: contentDrafts.workspaceId }),
    );

    console.log(`[seed] workspace "${SEED_WORKSPACE.slug}" ready (${workspace.id})`);
    console.log(`[seed] sign in as ${SEED_USER.email} — the magic link prints to stdout`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[seed] failed:", err);
  process.exitCode = 1;
});
