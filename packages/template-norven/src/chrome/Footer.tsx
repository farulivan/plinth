import type { Link } from "@plinth/schema/content";

interface FooterProps {
  siteName: string;
  note?: string | undefined;
  social: Link[];
}

/**
 * Site footer. The year is computed at build time, which is the same thing
 * norven did — a tenant who never republishes will show the year they last
 * published, and that is more honest than a client-side clock claiming a site
 * is current when its content is not.
 */
export function Footer({ siteName, note, social }: FooterProps) {
  return (
    <footer className="border-line-2 text-ink-3 mt-24 border-t px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <p className="font-display text-ink text-lg">{siteName}</p>
        {social.length > 0 ? (
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {social.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="hover:text-ink font-mono text-xs tracking-widest uppercase"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {note ? <p className="mt-6 max-w-prose text-sm">{note}</p> : null}
      <p className="mt-6 font-mono text-xs tracking-widest uppercase">
        © {new Date().getFullYear()} {siteName}
      </p>
    </footer>
  );
}
