import type { EntryComponentProps } from "@plinth/renderer";

/**
 * One project in a line: what the page head titles itself, and what a
 * prev/next link is labelled with. One function for both so a link and the
 * page it points at can never disagree about a project's name.
 *
 * Read leniently, never parsed. It runs for a page's neighbours as well as for
 * the page being rendered, and entries are savable half-written (ADR-0007) —
 * throwing would mean a finished project fails to build because the next one
 * in the list is still being typed.
 *
 * Its own module rather than living beside the map that uses it: the detail
 * component needs it too, and importing the map from the component the map
 * points at is a cycle.
 */
export function summarizeProject(entry: EntryComponentProps["entry"]): {
  title: string;
  description: string;
} {
  const fields = entry.fields as { title?: unknown; brief?: unknown };
  return {
    title: typeof fields.title === "string" && fields.title ? fields.title : "Project",
    description: typeof fields.brief === "string" ? fields.brief : "",
  };
}
