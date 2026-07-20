import { MediaRef } from "@plinth/renderer";
import type { MediaRef as MediaRefValue } from "@plinth/schema/content";

/** Deterministic warm gradient behind a loading photo — seed (slot index) →
 * a linear-gradient from the bone/brass/ink tokens. Ported verbatim. */
const STOPS: ReadonlyArray<readonly [string, string]> = [
  ["var(--color-bone-2)", "var(--color-bone-3)"],
  ["var(--color-bone-3)", "var(--color-brass)"],
  ["var(--color-ink-3)", "var(--color-ink)"],
  ["var(--color-brass-2)", "var(--color-ink-2)"],
  ["var(--color-bone-2)", "var(--color-brass)"],
];

function placeholderGradient(seed = 0): string {
  const i = ((seed % STOPS.length) + STOPS.length) % STOPS.length;
  const [from, to] = STOPS[i]!;
  const angle = 115 + (i % 4) * 25;
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/**
 * The photographic frame, ported from norven's Frame.astro: aspect-ratio (or
 * fill) crop, gradient underlay while the photo loads, optional parallax
 * drift (bound by the motion runtime via data-parallax), and the responsive
 * <picture> from @plinth/renderer.
 */
export function Frame({
  media,
  className,
  ratio = "4/3",
  seed = 0,
  parallax = false,
  fill = false,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  priority = false,
}: {
  media: MediaRefValue;
  className?: string;
  ratio?: string;
  seed?: number;
  parallax?: boolean;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <figure className={["m-0", fill ? "absolute inset-0" : "", className ?? ""].join(" ").trim()}>
      <div
        className={["bg-bone-2 relative overflow-hidden", fill ? "h-full w-full" : ""]
          .join(" ")
          .trim()}
        style={fill ? undefined : { aspectRatio: ratio }}
      >
        <div
          className={["absolute inset-0", parallax ? "-top-10% h-[120%]" : ""].join(" ").trim()}
          data-parallax={parallax ? "8" : undefined}
          style={{ background: placeholderGradient(seed) }}
        >
          <MediaRef
            media={media}
            sizes={sizes}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            className="image-fade block h-full w-full object-cover"
          />
        </div>
      </div>
    </figure>
  );
}
