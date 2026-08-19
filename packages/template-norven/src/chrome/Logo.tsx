/**
 * The studio's brand marks, inlined rather than fetched.
 *
 * Static template assets, alongside the favicons: a logo is the thing about a
 * site that changes least, and putting it through the media pipeline would
 * buy editability nobody wants at the cost of an upload on every new tenant.
 *
 * Inlined rather than served from `public/` for two reasons — both use
 * `currentColor`, so they take the colour of whatever they sit inside and need
 * no variant per context, and a header mark fetched as a separate file is a
 * request on the critical path for something in the first viewport.
 *
 * Both are `aria-hidden`. The standalone site labelled them and then had to
 * hide them anyway, because an `<svg role="img">` inside a link contributes a
 * second name and the two disagreed — the accessible name said one thing and
 * the drawn letters another, which is precisely what
 * `label-content-name-mismatch` reports. Decorative here, and the link that
 * wraps them supplies the name.
 */
export function Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" aria-hidden="true" focusable="false" className={className}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M54 42V178" strokeWidth="8.5" />
        <path d="M146 42V178" strokeWidth="8.5" />
        <path d="M54 42L146 178" strokeWidth="4.2" />
        <path d="M54 42L94 166Q100 180 106 166L146 42" strokeWidth="4.2" />
      </g>
    </svg>
  );
}

/**
 * The wordmark draws its letters as SVG text in the display face, so it scales
 * as artwork rather than reflowing as copy — and matches the header of the
 * site this template reproduces, where the mark is set rather than typed.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 130" aria-hidden="true" focusable="false" className={className}>
      <text
        x="280"
        y="98"
        textAnchor="middle"
        fontSize="120"
        fontFamily="var(--font-display)"
        fill="currentColor"
      >
        NORVEN
      </text>
    </svg>
  );
}
