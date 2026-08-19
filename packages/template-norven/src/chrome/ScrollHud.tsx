/**
 * A hairline reading-progress bar across the top of every page.
 *
 * Rendered from `Nav` rather than added to the chrome contract, which would
 * have meant widening `ChromeMap` and editing all three surfaces that
 * destructure it — including the dashboard preview. It is `position: fixed`,
 * so where it sits in the DOM is immaterial, and putting it beside the header
 * keeps the pairing that ADR-0015 asks for: a surface takes the whole frame or
 * none of it.
 *
 * Decorative, so `aria-hidden` — the progress it reports is already available
 * to anyone using a scrollbar or a screen reader's position announcements, and
 * a second, less precise channel is noise.
 *
 * The width starts at 0 and is written by the motion runtime. Under reduced
 * motion the runtime never binds it, which leaves a static hairline rule —
 * still the correct rendering of the design, just not an animated one.
 */
export function ScrollHud() {
  return (
    <div className="bg-line-2 fixed top-0 right-0 left-0 z-50 h-px" aria-hidden="true">
      <div className="bg-brass h-full w-0 origin-left" data-scroll-progress style={{ width: 0 }} />
    </div>
  );
}
