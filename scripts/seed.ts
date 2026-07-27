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

// The owner account. SEED_USER_EMAIL overrides the dev default so a production
// seed can make the real operator the owner — magic-link login then matches
// this pre-seeded user (and its workspace membership) by email.
const SEED_USER = {
  email: process.env.SEED_USER_EMAIL ?? "dev@plinth.local",
  name: process.env.SEED_USER_NAME ?? "Dev User",
};
const SEED_WORKSPACE = { slug: "norven", name: "Norven", templateId: "template-norven" };

/** Media-free sections only — photoHero and featuredProjects need media
 * rows, which this base seed can't create (the images go through the Sharp
 * pipeline); `pnpm seed:norven` layers the full landing page with photos on
 * top. Parsed through the template manifest so the seed can never produce a
 * draft the editor and publish path wouldn't accept. */
const sampleDocument = norvenDocument.parse({
  sections: [
    {
      type: "statement",
      fields: {
        eyebrow: "The practice",
        body: "Norven is an architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
      },
    },
    {
      type: "stats",
      fields: {
        items: [
          { value: "118", label: "Built" },
          { value: "26", label: "In studio" },
          { value: "42", label: "Awards & citations" },
          { value: "17", label: "Years continuous practice" },
        ],
      },
    },
    {
      type: "testimonial",
      fields: {
        attribution: "Client, Salt House",
        context: "Tjøme · 2023",
        quote:
          "They drew our house the way you would a portrait of someone you had known for fifty years. Nothing was decorative, nothing was lazy. We have lived in it for three winters now and have not found a single thing we would change.",
        name: "Margrét Sól",
      },
    },
    {
      type: "contact",
      fields: {
        eyebrow: "Bring us a site",
        heading: "Bring us a site,\na story,\na single hour of light.",
        email: "studio@norven.example",
        phone: "+47 22 00 00 00",
        studios: [
          { city: "Oslo", address: "Akersgata 12, 0158" },
          { city: "Lisbon", address: "Rua das Janelas Verdes 9" },
          { city: "Kyoto", address: "Higashiyama, Sanjō 3-15" },
        ],
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
