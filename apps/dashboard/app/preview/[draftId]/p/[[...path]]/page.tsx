import { getSession, listUserWorkspaces } from "@plinth/auth";
import { contentHash } from "@plinth/db";
import { Sections } from "@plinth/renderer";
// The template's design system — same stylesheet the published site builds
// with. Route-scoped: only the preview segment loads it.
import "@plinth/template-norven/styles.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  HOME_PATH,
  livingEntries,
  resolveEntryPath,
  withNeighbors,
  type EntryInstance,
  type LooseContentDocumentV2,
  type ResolvedEntry,
} from "@plinth/schema";
import { z } from "zod";
import { guardedComponents, renderGuardedEntry } from "@/components/preview/guarded-components";
import { PreviewClient } from "@/components/preview/preview-client";
import { templateFor } from "@/lib/templates";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getDraftForPreview } from "@/server/services/drafts";

// A preview is per-request state; nothing here can prerender.
export const dynamic = "force-dynamic";

/** Never index a preview, wherever its URL leaks (ADR-0007). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * SSR draft preview (ADR-0007): the same renderer the published site will
 * use, fed the loose draft document straight from Postgres. Auth mirrors the
 * editor page — session required, workspace from the session — and the draft
 * read rides RLS, so a draft id from another workspace simply 404s.
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ draftId: string; path?: string[] }>;
}) {
  const { draftId, path } = await params;
  const id = z.uuid().safeParse(draftId);
  if (!id.success) notFound();

  const session = await getSession({ auth, headers: await headers() });
  if (!session) redirect("/login");
  const workspaceId =
    session.activeWorkspaceId ?? (await listUserWorkspaces(db, session.user.id))[0]?.id ?? null;
  if (!workspaceId) notFound();

  const preview = await getDraftForPreview(db, workspaceId, id.data);
  if (!preview) notFound();

  const template = templateFor(preview.templateId);
  if (!template) {
    return (
      <p className="p-8 text-sm text-neutral-500">
        This workspace uses the unknown template “{preview.templateId}” — register it in
        lib/templates.ts.
      </p>
    );
  }

  // The requested route, in the same `/`-wrapped shape a page path carries, so
  // the segments the editor puts in the URL round-trip to the stored value.
  // Disabled pages and parked entries stay previewable: parking one is how an
  // author works on it, and a preview that refused to show it would remove the
  // only way to see it.
  const requested = path && path.length > 0 ? `/${path.join("/")}/` : HOME_PATH;
  const page = preview.document.pages.find((candidate) => candidate.path === requested);

  // Entries are resolved from the whole list, not just the enabled ones, but
  // their NEIGHBOURS come from the living ones — so prev/next in the preview
  // points where it will point once published, rather than at a page the
  // build would skip.
  const entryMatch = page ? null : findEntry(preview.document.collections, requested);

  const { site } = preview.document;

  // A path this draft does not carry — not a dead end, and deliberately not
  // `notFound()`.
  //
  // The common cause is a race, not a mistake: adding a page or an entry
  // points the iframe at its route before the autosave has reached Postgres,
  // and this renders from Postgres. `notFound()` throws past the SSE client
  // below, so the preview would have no subscription, nothing would reload it
  // when the save landed, and it would sit on "page not found" until someone
  // reloaded by hand. Mounting the client here is what makes the wait
  // self-correcting.
  if (!page && !entryMatch) {
    return (
      <>
        <PreviewClient draftId={id.data} initialHash={contentHash(preview.document)} />
        <p className="p-8 text-sm text-neutral-500">
          Nothing at this path yet — it appears here as soon as the change saves.
        </p>
      </>
    );
  }

  const { Nav, Footer } = template.chrome;

  return (
    <>
      <PreviewClient draftId={id.data} initialHash={contentHash(preview.document)} />
      <Nav siteName={site.name} items={site.nav} currentPath={requested} cta={site.cta} />
      <main id="main">
        {page ? (
          <Sections
            sections={page.sections}
            components={guardedComponents(template)}
            collections={resolvedCollections(preview.document)}
            site={site}
          />
        ) : entryMatch ? (
          <>
            {renderGuardedEntry(template, entryMatch.collection, {
              entry: entryMatch.entry,
              prev: entryMatch.prev,
              next: entryMatch.next,
            })}
            {/* The published page closes on these, so the preview must too —
                a preview missing the last thing on the page is a preview that
                lies about where the page ends (ADR-0007). */}
            <Sections
              sections={preview.document.collections[entryMatch.collection]?.closingSections ?? []}
              components={guardedComponents(template)}
              collections={resolvedCollections(preview.document)}
              site={site}
            />
          </>
        ) : null}
      </main>
      <Footer
        siteName={site.name}
        note={site.footerNote}
        social={site.social}
        links={site.footerLinks}
        locations={site.locations}
        contactEmail={site.contactEmail}
        cta={site.cta}
        ctaBlurb={site.ctaBlurb}
        noteLink={site.footerNoteLink}
        credit={site.footerCredit}
      />
    </>
  );
}

/** The entry a path names, with the neighbours it will have once published. */
function findEntry(
  collections: LooseContentDocumentV2["collections"],
  requested: string,
): {
  collection: string;
  entry: EntryInstance;
  prev: ResolvedEntry | null;
  next: ResolvedEntry | null;
} | null {
  for (const [collection, value] of Object.entries(collections)) {
    const entry = value.entries.find(
      (candidate) => resolveEntryPath(value.pathTemplate, candidate.slug) === requested,
    );
    if (!entry) continue;
    const chain = withNeighbors(livingEntries(value as never));
    const position = chain.find((item) => item.entry.id === entry.id);
    return {
      collection,
      entry: entry as EntryInstance,
      prev: position?.prev ?? null,
      next: position?.next ?? null,
    };
  }
  return null;
}

/** The same resolution the builder does, so an index section in the preview
 * lists exactly what the published one will. */
function resolvedCollections(document: LooseContentDocumentV2) {
  return Object.fromEntries(
    Object.entries(document.collections).map(([name, value]) => [
      name,
      livingEntries(value as never),
    ]),
  );
}
