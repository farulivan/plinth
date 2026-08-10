import { getSession, listUserWorkspaces } from "@plinth/auth";
import { contentHash } from "@plinth/db";
import { Sections } from "@plinth/renderer";
// The template's design system — same stylesheet the published site builds
// with. Route-scoped: only the preview segment loads it.
import "@plinth/template-norven/styles.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { HOME_PATH } from "@plinth/schema";
import { z } from "zod";
import { guardedComponents } from "@/components/preview/guarded-components";
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

  // The requested page, in the same `/`-wrapped shape a page path carries, so
  // the segments the editor puts in the URL round-trip to the stored value.
  // Disabled pages stay previewable: parking one is how an author works on it,
  // and a preview that refused to show it would remove the only way to see it.
  const requested = path && path.length > 0 ? `/${path.join("/")}/` : HOME_PATH;
  const page = preview.document.pages.find((candidate) => candidate.path === requested);
  if (!page) notFound();

  const { site } = preview.document;
  const { Nav, Footer } = template.chrome;

  return (
    <>
      <PreviewClient draftId={id.data} initialHash={contentHash(preview.document)} />
      <Nav siteName={site.name} items={site.nav} currentPath={page.path} />
      <main id="main">
        <Sections sections={page.sections} components={guardedComponents(template)} />
      </main>
      <Footer siteName={site.name} note={site.footerNote} social={site.social} />
    </>
  );
}
