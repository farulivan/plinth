import type { Link } from "@plinth/schema/content";

interface NavProps {
  siteName: string;
  items: Link[];
  /** The page being rendered, so the current entry can say so. */
  currentPath: string;
}

/**
 * Site header. Ported from norven's Nav.astro, minus the mobile menu — the
 * focus trap and scroll lock that made it worth having are DOM-lifecycle code
 * that has to survive view transitions, and it arrives with the routes that
 * make a menu necessary. Until then the links wrap.
 *
 * `aria-current="page"` rather than a class alone: the visual treatment is a
 * border, which conveys nothing to a screen reader.
 */
export function Nav({ siteName, items, currentPath }: NavProps) {
  return (
    <header className="border-line-2 bg-bone/85 sticky top-0 z-40 border-b backdrop-blur">
      <nav aria-label="Primary" className="flex flex-wrap items-baseline gap-x-8 gap-y-2 px-6 py-4">
        <a href="/" className="font-display text-ink text-xl tracking-tight">
          {siteName}
        </a>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {items.map((item) => {
            const current = item.href === currentPath;
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={
                    current
                      ? "border-ink text-ink border-b font-mono text-xs tracking-widest uppercase"
                      : "text-ink-3 hover:text-ink font-mono text-xs tracking-widest uppercase"
                  }
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
