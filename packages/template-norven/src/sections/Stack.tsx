import type { SectionComponentProps } from "@plinth/renderer";
import { stackSection } from "../manifest";
import { lines } from "./lines";

/**
 * The decisions table, ported from colophon.astro.
 *
 * A real `<table>`, unlike Recognition's list: these three columns have
 * headers and a reader compares down them, which is what a table is for and
 * what a screen reader needs in order to say "Hosting, column two".
 */
export function Stack({ section }: SectionComponentProps) {
  const { fields } = stackSection.parse(section);
  return (
    <section className="bg-bone-2 py-24 lg:py-32" data-section="stack">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <p className="eyebrow mb-8" data-reveal>
          {fields.eyebrow}
        </p>
        <h2
          className="font-display text-ink mb-12 leading-[1.05]"
          style={{ fontSize: "var(--text-display-3)" }}
          data-reveal
        >
          {lines(fields.heading)}
        </h2>
        <div className="overflow-x-auto" data-reveal>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-line-2 border-b">
                <th className="eyebrow py-4 pr-6 font-normal">Layer</th>
                <th className="eyebrow py-4 pr-6 font-normal">Choice</th>
                <th className="eyebrow py-4 font-normal">Why</th>
              </tr>
            </thead>
            <tbody className="divide-line-2 divide-y">
              {fields.rows.map((row) => (
                <tr key={row.layer}>
                  <th
                    scope="row"
                    className="text-ink-3 py-5 pr-6 align-top font-mono text-xs font-normal tracking-[0.14em] whitespace-nowrap uppercase"
                  >
                    {row.layer}
                  </th>
                  <td className="font-display text-ink py-5 pr-6 align-top text-lg">
                    {row.choice}
                  </td>
                  <td className="text-ink-3 py-5 align-top text-sm leading-relaxed">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
