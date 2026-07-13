import type { ComponentMap, SectionComponentProps } from "@plinth/renderer";
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
    const GuardedSection = ({ section }: SectionComponentProps) => {
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
      return <SectionComponent section={section} />;
    };
    map[spec.type] = GuardedSection;
  }
  return map;
}
