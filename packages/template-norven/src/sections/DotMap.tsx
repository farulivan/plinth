import type { SectionComponentProps } from "@plinth/renderer";
import { dotMapSection } from "../manifest";

/**
 * The studios plotted on a dotted world map.
 *
 * The continents are not traced. Six hundred candidate points are stepped
 * across the viewBox by two coprime strides and kept where a pair of coarse
 * rectangles says "roughly land" — which is deliberate. The map is a gesture
 * at three latitudes rather than a cartographic claim, and a real silhouette
 * would be kilobytes of path data asserting a precision the design does not
 * want. The strides are fixed, so the field is identical on every build.
 *
 * Drawn rather than fetched: an SVG built from arithmetic costs no request and
 * no image variant, and it takes its colours from the template's tokens, so it
 * follows the palette without a second asset to keep in step.
 */
export function DotMap({ section }: SectionComponentProps) {
  const { fields } = dotMapSection.parse(section);

  const field = Array.from({ length: 600 }, (_, i) => ({
    x: (i * 17) % 200,
    y: (i * 11) % 100,
  })).filter(({ x, y }) => y > 18 && y < 70 && ((x > 80 && x < 175) || (x > 5 && x < 60)));

  return (
    <section className="bg-bone-2 py-20 lg:py-28" data-section="dotMap">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <p className="eyebrow mb-10 text-center" data-reveal>
          {fields.eyebrow}
        </p>
        {/* Labelled, not hidden: the marks carry the city names, so this is
            content rather than decoration — but the names are also in the
            markup as text, so nothing is only available to sighted readers. */}
        <svg
          viewBox="0 0 200 100"
          className="mx-auto block h-auto w-full max-w-3xl"
          aria-label={fields.label}
          role="img"
        >
          {field.map(({ x, y }, index) => (
            <circle key={index} cx={x} cy={y} r="0.3" fill="var(--color-ink-3)" opacity="0.4" />
          ))}
          {fields.items.map((studio) => (
            <g key={studio.city}>
              <circle cx={studio.x} cy={studio.y} r="3" fill="var(--color-brass)" />
              <circle
                cx={studio.x}
                cy={studio.y}
                r="6"
                fill="none"
                stroke="var(--color-brass)"
                strokeWidth="0.4"
                opacity="0.5"
              />
              <text
                x={studio.x}
                y={studio.y - 8}
                textAnchor="middle"
                fontSize="3.5"
                fontFamily="monospace"
                fill="var(--color-ink)"
              >
                {studio.city.toUpperCase()}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
