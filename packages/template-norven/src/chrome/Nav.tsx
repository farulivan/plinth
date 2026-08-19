import type { Link } from "@plinth/schema/content";
import { Emblem, Wordmark } from "./Logo";
import { ScrollHud } from "./ScrollHud";

interface NavProps {
  siteName: string;
  items: Link[];
  /** The page being rendered, so the current entry can say so. */
  currentPath: string;
  /** The standing call to action, if the site has one. */
  cta?: Link | undefined;
}

/**
 * Whether a nav entry covers the page being rendered.
 *
 * Prefix matching, not equality: `/projects/` is the entry, `/projects/salt-house/`
 * is a page it owns, and exact comparison left every project detail page with
 * nothing marked at all — the reader loses their place in the site exactly
 * where the site is deepest.
 *
 * Both sides are normalised to a trailing slash first. Without it `/projects`
 * would also claim `/projects-archive/`, since one is genuinely a string
 * prefix of the other.
 */
function covers(href: string, path: string): boolean {
  const entry = href.endsWith("/") ? href : `${href}/`;
  const here = path.endsWith("/") ? path : `${path}/`;
  // Home owns only itself; every path is a prefix match against "/".
  return entry === "/" ? here === "/" : here.startsWith(entry);
}

/**
 * Site header, ported from norven's Nav.astro.
 *
 * `aria-current="page"` rather than a class alone: the visual treatment is a
 * border, which conveys nothing to a screen reader.
 *
 * The mobile overlay is rendered on every page and simply hidden by CSS at
 * `md` and up, rather than being conditional on viewport — there is no
 * viewport at render time, and a server-rendered site cannot ask.
 */
export function Nav({ siteName, items, currentPath, cta }: NavProps) {
  return (
    <>
      <ScrollHud />
      <header className="border-line-2 bg-bone/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 lg:px-10">
          <a
            href="/"
            aria-label={`${siteName} — home`}
            className="text-ink inline-flex items-center"
          >
            <Emblem className="block h-8 w-auto md:hidden" />
            <Wordmark className="hidden h-6 w-auto md:block lg:hidden" />
            <span className="hidden lg:inline-flex lg:items-center lg:gap-3">
              <Emblem className="h-8 w-auto" />
              <Wordmark className="h-6 w-auto" />
            </span>
          </a>

          <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-10">
            <ul className="flex items-center gap-x-8">
              {items.map((item) => {
                const current = covers(item.href, currentPath);
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={
                        current
                          ? "border-ink text-ink border-b pb-1 font-mono text-[11px] tracking-[0.18em] uppercase"
                          : "text-ink-3 hover:text-ink font-mono text-[11px] tracking-[0.18em] uppercase transition-colors"
                      }
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {cta ? (
            <a
              href={cta.href}
              className="border-ink text-ink hover:bg-ink hover:text-bone hidden border px-4 py-2 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors md:inline-block"
            >
              {cta.label}
            </a>
          ) : null}

          {/* Holds the slot the fixed toggle sits over, so the mark does not
              centre itself into the space the button occupies. */}
          <span className="block h-10 w-10 md:hidden" aria-hidden="true" />
        </div>
      </header>

      {/* Fixed rather than inside the header, so it stays reachable above the
          overlay it opens — a toggle that the menu covers cannot close it. */}
      <button
        type="button"
        id="nav-toggle"
        aria-expanded="false"
        aria-controls="nav-menu"
        aria-label="Open menu"
        className={[
          "text-ink fixed top-3 right-4 z-80 flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-1.5 md:hidden",
          "aria-expanded:[&>span:nth-child(1)]:translate-y-[7px] aria-expanded:[&>span:nth-child(1)]:rotate-45",
          "aria-expanded:[&>span:nth-child(2)]:opacity-0",
          "aria-expanded:[&>span:nth-child(3)]:translate-y-[-7px] aria-expanded:[&>span:nth-child(3)]:-rotate-45",
        ].join(" ")}
      >
        <span className="bg-ink h-px w-6 transition-all duration-300" />
        <span className="bg-ink h-px w-6 transition-all duration-300" />
        <span className="bg-ink h-px w-6 transition-all duration-300" />
      </button>

      <div
        id="nav-menu"
        className="bg-bone invisible fixed inset-0 z-70 flex flex-col items-center justify-center gap-10 opacity-0 transition-opacity duration-300 data-open:visible data-open:opacity-100 md:hidden"
      >
        {items.map((item) => {
          const current = covers(item.href, currentPath);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "font-display text-ink text-5xl"
                  : "font-display text-ink-3 hover:text-ink text-5xl transition-colors"
              }
            >
              {item.label}
            </a>
          );
        })}
        {cta ? (
          <a
            href={cta.href}
            className="border-ink text-ink mt-8 border px-6 py-3 font-mono text-xs tracking-[0.18em] uppercase"
          >
            {cta.label}
          </a>
        ) : null}
      </div>
    </>
  );
}
