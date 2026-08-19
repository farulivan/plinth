import type { Link, SiteSettings } from "@plinth/schema/content";
import { Emblem } from "./Logo";

interface FooterProps {
  siteName: string;
  note?: string | undefined;
  social: Link[];
  links?: Link[] | undefined;
  locations?: SiteSettings["locations"] | undefined;
  contactEmail?: string | undefined;
  cta?: Link | undefined;
  ctaBlurb?: string | undefined;
}

/**
 * Site footer, ported from norven's Footer.astro.
 *
 * Four columns, and every one of them empties cleanly. A tenant that has
 * filled in nothing but a name still gets a footer that looks deliberate
 * rather than broken — which matters because this is the one component on the
 * site that cannot be parked the way a section can, and the seed for a new
 * workspace has none of this yet.
 *
 * The year is computed at build time, which is what the standalone site did. A
 * tenant who never republishes shows the year they last published, and that is
 * more honest than a client-side clock insisting a site is current when its
 * content is not.
 */
export function Footer({
  siteName,
  note,
  social,
  links = [],
  locations = [],
  contactEmail,
  cta,
  ctaBlurb,
}: FooterProps) {
  const columns =
    (locations.length > 0 ? 1 : 0) +
    (links.length > 0 ? 1 : 0) +
    (contactEmail || social.length > 0 ? 1 : 0) +
    (cta ? 1 : 0);

  return (
    <footer className="bg-bone text-ink border-line-2 border-t">
      <div className="mx-auto max-w-[1400px] px-6 py-20 lg:px-10 lg:py-28">
        {columns > 0 ? (
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
            {locations.length > 0 ? (
              <div>
                <p className="eyebrow mb-6">Studios</p>
                <ul className="space-y-5">
                  {locations.map((studio) => (
                    <li key={`${studio.city}-${studio.address}`} className="font-sans text-sm">
                      <p className="text-ink mb-1 font-medium">{studio.city}</p>
                      <p className="text-ink-3 leading-relaxed">
                        {studio.address}
                        <br />
                        {studio.country}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {links.length > 0 ? (
              <div>
                <p className="eyebrow mb-6">Work</p>
                <ul className="space-y-3 font-sans text-sm">
                  {links.map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className="text-ink-3 hover:text-ink transition-colors">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {contactEmail || social.length > 0 ? (
              <div>
                <p className="eyebrow mb-6">Reach</p>
                <ul className="space-y-3 font-sans text-sm">
                  {contactEmail ? (
                    <li>
                      <a
                        href={`mailto:${contactEmail}`}
                        className="text-ink-3 hover:text-ink transition-colors"
                      >
                        {contactEmail}
                      </a>
                    </li>
                  ) : null}
                  {social.map((item) => (
                    <li key={item.href}>
                      {/* External by definition, so it opens away from the site
                          — and `noopener` because a tab opened with `target`
                          otherwise gets a handle back to this one. */}
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-3 hover:text-ink transition-colors"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cta ? (
              <div>
                {/* The column heading is the template's vocabulary, like the
                    three beside it — the editable half is the button's own
                    label, and using it twice read as a stutter. */}
                <p className="eyebrow mb-6">Brief</p>
                {ctaBlurb ? (
                  <p className="text-ink-3 mb-6 font-sans text-sm leading-relaxed">{ctaBlurb}</p>
                ) : null}
                <a
                  href={cta.href}
                  className="border-ink text-ink hover:bg-ink hover:text-bone inline-block border px-5 py-3 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors"
                >
                  {cta.label}
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={columns > 0 ? "border-line-2 mt-16 border-t pt-8" : ""}>
          <Emblem className="text-ink-3 mb-6 h-8 w-auto" />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-ink-3 font-mono text-[11px] tracking-[0.14em]">
              © {new Date().getFullYear()} {siteName}
              {note ? ` · ${note}` : null}
            </p>
            {locations.length > 0 ? (
              <p className="text-ink-3 font-mono text-[11px] tracking-[0.14em]">
                {locations.map((studio) => studio.city).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
