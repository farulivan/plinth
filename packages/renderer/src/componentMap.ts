import type { ComponentType } from "react";
import type { ResolvedEntry, SectionInstance, WithNeighbors } from "@plinth/schema/content";

/**
 * Every collection's living entries, keyed by collection name, each with its
 * path already resolved.
 *
 * Passed to sections rather than fetched by them: the renderer has no idea
 * what a path template is, and a section that reached for one would be reading
 * document structure from inside a leaf. Resolving at the boundary keeps the
 * index section's job to "render these links".
 */
export type ResolvedCollections = Record<string, ResolvedEntry[]>;

/**
 * Props every section component receives. The renderer is template-agnostic,
 * so the section's `fields` arrive unvalidated (`unknown`); a template's
 * component narrows them with its own manifest schema before rendering.
 */
export interface SectionComponentProps {
  section: SectionInstance;
  /**
   * Optional, and optional in both directions: a section that lists a
   * collection's entries reads it, every other section ignores it, and a
   * surface with no collections to offer omits it. Additive rather than a new
   * component kind, because an index IS a section — it sits in a page's
   * section list, is reorderable, and carries its own heading.
   */
  collections?: ResolvedCollections;
}

/** A component that renders a single document section. */
export type SectionComponent = ComponentType<SectionComponentProps>;

/**
 * Maps a section `type` to the component that renders it. A template provides
 * exactly one map; the renderer dispatches each section through it. Unknown
 * types render nothing, so a document authored against a newer manifest stays
 * forward-compatible (ADR-0001).
 */
export type ComponentMap = Record<string, SectionComponent>;

/**
 * Props a collection detail component receives: the entry itself plus its
 * place in the sequence.
 *
 * An entry has `fields`, not `sections` — one shape repeated, not an arbitrary
 * composition — so a collection is rendered by one component the template
 * owns, rather than dispatched per item the way sections are. Neighbours
 * arrive fully resolved so the component can label a link without knowing how
 * paths are built; both are null for a collection of one (ADR-0015).
 */
export interface EntryComponentProps {
  entry: WithNeighbors["entry"];
  prev: ResolvedEntry | null;
  next: ResolvedEntry | null;
}

export type EntryComponent = ComponentType<EntryComponentProps>;

/**
 * What a template provides per collection: the detail component, and a way to
 * describe an entry in one line.
 *
 * `summarize` exists because `<head>` is not the component's to write. A
 * detail page still needs a title and a description, and the only honest
 * source is the entry's own fields — which only the template can read. Without
 * it every project page would fall back to the site name, and an author would
 * have to retype the title into per-entry SEO to get a distinct `<title>`.
 *
 * It must not throw. Entries are savable half-written (ADR-0007), and this is
 * called for neighbours as well as for the page being rendered — a complete
 * project must not fail because the one after it is unfinished.
 */
export interface CollectionRenderer {
  Detail: EntryComponent;
  summarize: (entry: EntryComponentProps["entry"]) => { title: string; description: string };
}

/** Maps a collection name to how a template renders and describes it. */
export type CollectionRendererMap = Record<string, CollectionRenderer>;
