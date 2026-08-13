import type { ComponentMap, EntryComponentProps, SectionComponentProps } from "@plinth/renderer";
import type { ReactNode } from "react";
import type { TemplateSpec } from "@/lib/templates";

/**
 * Preview-only wrapper around a template's components. Drafts hold half-typed
 * fields (saves are loose, ADR-0007), but template components strict-parse
 * their section and would throw on incomplete content. Each section validates
 * independently here, so one unfinished section becomes an inline placeholder
 * instead of blanking the whole preview — a per-section refinement of
 * ADR-0007's all-or-nothing wording (ADR-0012).
 */
export function guardedComponents(template: TemplateSpec): ComponentMap {
  const map: ComponentMap = {};
  for (const spec of template.sections) {
    const SectionComponent = template.components[spec.type];
    if (!SectionComponent) continue;
    const GuardedSection = ({ section, collections, site }: SectionComponentProps) => {
      if (!spec.schema.safeParse(section).success) {
        return (
          <section
            data-section-invalid={spec.type}
            className="m-4 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
          >
            {spec.label} has empty or invalid fields — it shows here once they’re filled in, and
            publish will require them.
          </section>
        );
      }
      return <SectionComponent section={section} collections={collections} site={site} />;
    };
    map[spec.type] = GuardedSection;
  }
  return map;
}

/**
 * The same guard for a collection's detail component. It matters more here
 * than for a section: an entry is created empty and parked, so the very first
 * thing an author sees after "Add project" is a component being asked to
 * render nothing. Throwing would blank the preview at the exact moment they
 * started work on it.
 *
 * Returns elements rather than a component. A collection has exactly one
 * detail component, so there is nothing to dispatch — and building a component
 * inside a render is the pattern that breaks memoisation and identity across
 * renders, which the lint rule is right to refuse.
 */
export function renderGuardedEntry(
  template: TemplateSpec,
  collection: string,
  props: EntryComponentProps,
): ReactNode {
  const spec = template.collections.find((candidate) => candidate.name === collection);
  const renderer = template.collectionRenderers[collection];
  if (!spec || !renderer) return null;

  if (!spec.fieldsSchema.safeParse(props.entry.fields).success) {
    return (
      <section
        data-entry-invalid={collection}
        className="m-4 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500"
      >
        This entry has empty or invalid fields — it shows here once they’re filled in, and publish
        will require them.
      </section>
    );
  }

  const Detail = renderer.Detail;
  return <Detail entry={props.entry} prev={props.prev} next={props.next} />;
}
