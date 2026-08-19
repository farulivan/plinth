/**
 * Norven's content, as CMS content.
 *
 * One module, two callers: `buildExampleContent` writes it to the committed
 * fixture the tenant gates audit, and `seedNorven` writes it to a real draft.
 * They differ only in where their media comes from — the fixture invents ids
 * because it is never loaded into Postgres, the seed uses the ones the upload
 * pipeline returned — so media arrives as functions and everything else is
 * shared. With five pages and a collection, duplicating this between the two
 * scripts would have been eight hundred lines that could disagree.
 *
 * Roughly a third of the copy below was never in a Norven collection or data
 * file: the studio's philosophy blocks, the colophon's decision table, the
 * eyebrows passed as page props. It lived in `.astro` markup, where an author
 * could not reach it. Moving it here is most of what "porting the site" means.
 */

/** A media reference the caller knows how to build, given alt text. */
export type MakeRef = (alt: string) => Record<string, unknown>;

export interface NorvenMedia {
  hero: MakeRef;
  saltHouse: MakeRef;
  obsidian: MakeRef;
  terraWorks: MakeRef;
  holmChapel: MakeRef;
  nordStrata: MakeRef;
  /**
   * Gallery photographs per project slug, in order. Optional per project on
   * purpose: the committed fixture carries one project's set so the quality
   * gates have a gallery to audit, while a real seed ingests all of them.
   * A project whose photographs are absent renders without a gallery rather
   * than with empty frames.
   */
  gallery?: Partial<Record<string, MakeRef[]>>;
}

/** Stable ids, so regenerating the fixture produces byte-identical output and
 * `contentHash` does not churn on a no-op rebuild. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const STUDIOS = [
  { city: "Oslo", address: "Akersgata 12, 0158", country: "Norway" },
  { city: "Lisbon", address: "Rua das Janelas Verdes 9", country: "Portugal" },
  { city: "Kyoto", address: "Higashiyama, Sanjō 3-15", country: "Japan" },
];

export interface ContentOptions {
  /** Web3Forms access key. Absent leaves the contact form parked — see below. */
  contactFormKey?: string;
}

export function norvenContent(
  media: NorvenMedia,
  options: ContentOptions = {},
): Record<string, unknown> {
  const contactFormKey = options.contactFormKey ?? "";
  return {
    site: {
      name: "Norven",
      description:
        "An architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
      nav: [
        { label: "Work", href: "/projects/" },
        { label: "Studio", href: "/studio/" },
        { label: "Contact", href: "/contact/" },
        { label: "Colophon", href: "/colophon/" },
      ],
      social: [
        { label: "Instagram · norven.studio", href: "https://instagram.com/norven.studio" },
        { label: "LinkedIn · norven", href: "https://www.linkedin.com/company/norven" },
      ],
      footerLinks: [
        { label: "Selected projects", href: "/projects/" },
        { label: "Studio", href: "/studio/" },
        { label: "Practice areas", href: "/#practice" },
        { label: "Process", href: "/#process" },
      ],
      cta: { label: "Submit a brief", href: "/contact/" },
      ctaBlurb: "Bring us a site, a story, a single hour of light.",
      // The studio's in-fiction address, not the author's. The colophon is
      // where a reader is told who actually receives what they send.
      contactEmail: "studio@norven.example",
      contactPhone: "+47 22 00 00 00",
      founded: 2009,
      locations: [
        { city: "Oslo", address: "Akersgata 12, 0158", country: "Norway" },
        { city: "Lisbon", address: "Rua das Janelas Verdes 9", country: "Portugal" },
        { city: "Kyoto", address: "Higashiyama, Sanjō 3-15", country: "Japan" },
      ],
      footerNote: "Established MMIX · Norven is a fictional studio",
      footerNoteLink: { label: "See the colophon", href: "/colophon/" },
      footerCredit: "Built in Astro",
      ...(contactFormKey ? { contactFormKey } : {}),
      // Every page falls back to this for Open Graph. Without it a shared
      // link renders as a bare title card — which the standalone site did not
      // do, and which the cutover parity check is what surfaced.
      ogImage: media.hero("Norven — architecture of consequence"),
    },
    pages: [home(media), projectsIndex(), studio(), contact(contactFormKey), colophon()],
    collections: { projects: { pathTemplate: "/projects/{slug}/", entries: projects(media) } },
  };
}

/* -------------------------------------------------------------------------- */

function home(media: NorvenMedia): Record<string, unknown> {
  return {
    id: id(0),
    path: "/",
    navLabel: "Home",
    seo: {
      title: "Norven — Architecture of consequence.",
      description:
        "An architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
    },
    sections: [
      {
        type: "photoHero",
        fields: {
          eyebrow: "Norven · Est. 2009",
          title: "Architecture\nof consequence.",
          subtitle:
            "Norven is an architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
          photo: media.hero("Norven — architecture of consequence"),
        },
      },
      {
        type: "statement",
        fields: {
          eyebrow: "The practice",
          body: "Norven is an architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
        },
      },
      {
        type: "featuredProjects",
        fields: {
          heading: "Selected work",
          items: [
            {
              title: "Salt House",
              href: "/projects/salt-house/",
              meta: "Residence · 2023 · Built",
              location: "Tjøme, Norway · 280 m²",
              brief:
                "A coastal residence cut into a granite shelf above the Skagerrak. Three volumes stepped down the slope, a single oak stair binding them.",
              image: media.saltHouse("Salt House — coastal residence above the Skagerrak"),
            },
            {
              title: "Obsidian Pavilion",
              href: "/projects/obsidian-pavilion/",
              meta: "Cultural · 2024 · Built",
              location: "Þingvellir, Iceland · 640 m²",
              brief:
                "A reading room and lava-field interpretive structure at the seam between the North American and Eurasian plates. Vertical, narrow, deliberately weightless.",
              image: media.obsidian("Obsidian Pavilion — interpretive structure at Þingvellir"),
            },
            {
              title: "Terra Works",
              href: "/projects/terra-works/",
              meta: "Commercial · 2025 · Built",
              location: "Marvila, Lisbon · 4,200 m²",
              brief:
                "Adaptive reuse of a 1937 ceramics warehouse into studio offices for nine creative tenants. Original shell retained; programme built as freestanding timber inserts.",
              image: media.terraWorks("Terra Works — adaptive reuse of a ceramics warehouse"),
            },
            {
              title: "Holm Chapel",
              href: "/projects/holm-chapel/",
              meta: "Civic · 2022 · Built",
              location: "Higashiyama, Kyoto · 180 m²",
              brief:
                "A non-denominational chapel for a small university campus. One room, one bench, one light cut down through three storeys of rammed earth.",
              image: media.holmChapel("Holm Chapel — rammed-earth chapel in Kyoto"),
            },
            {
              title: "Nord-Strata Tower",
              meta: "Cultural · 2026 · In Studio",
              location: "Reykjavík · 6,800 m²",
              brief:
                "A vertical archive and exhibition tower for the Nordic Council. Sixteen plates stacked around a central daylight void, sequenced by epoch.",
              image: media.nordStrata(
                "Nord-Strata Tower — vertical archive for the Nordic Council",
              ),
            },
          ],
        },
      },
      {
        type: "stats",
        fields: {
          items: [
            { value: "118", label: "Built" },
            { value: "26", label: "In studio" },
            { value: "42", label: "Awards & citations" },
            { value: "17", label: "Years continuous practice" },
          ],
        },
      },
      {
        type: "testimonial",
        fields: {
          attribution: "Client, Salt House",
          context: "Tjøme · 2023",
          quote:
            "They drew our house the way you would a portrait of someone you had known for fifty years. Nothing was decorative, nothing was lazy. We have lived in it for three winters now and have not found a single thing we would change.",
          name: "Margrét Sól",
        },
      },
      contactSpread(),
    ],
  };
}

/** The closing contact spread, shared by the three pages that end with it.
 * A function rather than a constant because a section instance is mutable
 * content — two pages holding the same object would alias each other. */
function contactSpread(): Record<string, unknown> {
  return {
    type: "contact",
    fields: {
      eyebrow: "Bring us a site",
      heading: "Bring us a site,\na story,\na single hour of light.",
      studios: STUDIOS.map(({ city, address }) => ({ city, address })),
    },
  };
}

function projectsIndex(): Record<string, unknown> {
  return {
    id: id(1),
    path: "/projects/",
    navLabel: "Projects",
    seo: {
      title: "Selected work — Norven",
      description:
        "A selection of residences, cultural buildings, and landscapes built and in studio by Norven.",
    },
    sections: [
      {
        type: "pageHero",
        fields: {
          eyebrow: "Index · 05 / 118 built",
          title: "Selected\nwork.",
          subtitle:
            "Five projects below stand for the wider practice. Each entry includes a brief, the full project narrative, and key dimensions. The studio has built one hundred eighteen buildings since founding; another twenty-six are in current development.",
        },
      },
      {
        type: "projectIndex",
        fields: { heading: "Selected projects", collection: "projects" },
      },
      contactSpread(),
    ],
  };
}

function studio(): Record<string, unknown> {
  return {
    id: id(2),
    path: "/studio/",
    navLabel: "Studio",
    seo: {
      title: "Studio — Norven",
      description:
        "A small architecture practice across Oslo, Lisbon, and Kyoto. Founded 2009 by Anders Lien.",
    },
    sections: [
      {
        type: "pageHero",
        fields: {
          eyebrow: "Studio",
          title: "A small practice.\nThree latitudes.",
          subtitle:
            "Founded in Oslo in 2009 and shaped by the careful, decade-long addition of partners in Lisbon and Kyoto. Norven has built one hundred eighteen buildings, with a team that has never exceeded thirty-six. The same architect who walks your site at the brief is present on the day the keys are handed over.",
        },
      },
      {
        type: "principles",
        fields: {
          eyebrow: "Philosophy",
          items: [
            {
              heading: "Listen before drawing.",
              body: "The first eight weeks of every project are spent on the ground. We measure, photograph, and visit at dawn and dusk. We meet the people who will use the building. We do not draw anything in this phase — drawing is an act of commitment, and we want commitment to follow understanding, not precede it.",
            },
            {
              heading: "Continuity through the build.",
              body: "The architect who first walked your site is on site again the week we pour foundations, the week we hang doors, and the week the building is handed over. We do not pass projects between teams. Our fee structure reflects this: we work on fewer projects, more slowly, with more presence.",
            },
            {
              heading: "Three studios as one practice.",
              body: "Oslo, Lisbon, Kyoto. The studios share a single method but draw on three sets of climatic intuitions. Norwegian rigour about insulation and rain; Portuguese understanding of shade and stone; Japanese discipline about joinery and silence. Every project benefits from at least two of the three.",
            },
          ],
        },
      },
      {
        type: "practice",
        fields: {
          eyebrow: "Practice",
          heading: "Four arms\nof a single discipline.",
          intro:
            "We do not separate architecture, interiors, and landscape into distinct contracts. One team, one fee, one set of drawings — the only honest way to make a building hold together.",
          items: [
            {
              title: "Architecture & Planning",
              description:
                "From single residences to civic-scale buildings. Schematic design through construction administration, with the same team carried from first sketch to final inspection.",
              icon: "compass",
            },
            {
              title: "Interior Architecture",
              description:
                "Joinery, lighting, and material assemblies designed at 1:1. We work in long-life timbers, cast stone, brass, and waxed plaster. No proprietary systems unless we cannot avoid them.",
              icon: "rule",
            },
            {
              title: "Landscape & Terrain",
              description:
                "Site work as a primary medium. Drainage, planting succession, ground modelling, and the patient negotiation between building footprint and existing topography.",
              icon: "leaf",
            },
            {
              title: "Research & Publication",
              description:
                "An ongoing studio practice of writing and built-history research. Three monographs published since 2016; quarterly studio notes available on request.",
              icon: "book",
            },
          ],
        },
      },
      {
        type: "process",
        fields: {
          eyebrow: "Process",
          heading: "Slow at the start,\nunhurried throughout.",
          items: [
            {
              code: "01",
              title: "Listen",
              duration: "4–8 weeks",
              description:
                "On site, in your daily routine, in the archive. We do not draw in this phase. We measure, photograph, and write.",
            },
            {
              code: "02",
              title: "Sketch",
              duration: "6–10 weeks",
              description:
                "First massing and section studies. Up to four alternates presented; one carried forward by joint decision. Quantity-surveyed early so cost is a parameter, not a surprise.",
            },
            {
              code: "03",
              title: "Draw",
              duration: "20–36 weeks",
              description:
                "Construction documentation, permit submissions, tender preparation. Every joint detailed at 1:5 minimum. Contractor selected by closed tender with three vetted firms.",
            },
            {
              code: "04",
              title: "Build",
              duration: "52–130 weeks",
              description:
                "Weekly site presence by the project architect through completion. A twelve-month post-occupancy review is included as standard.",
            },
          ],
        },
      },
      {
        type: "people",
        fields: {
          eyebrow: "Principals",
          items: [
            {
              name: "Anders Lien",
              role: "Founding Partner",
              base: "Oslo",
              bio: "Trained at AHO and the ETH Zürich. Founded the practice in 2009 after seven years at Snøhetta. Carries every Norven project from first site visit to handover.",
            },
            {
              name: "Pedro Carvalho",
              role: "Partner, Practice Director",
              base: "Lisbon",
              bio: "Joined in 2014, partner since 2018. Leads the Iberian and southern-European practice. Background in adaptive reuse with Aires Mateus, FAUP graduate 2008.",
            },
            {
              name: "Yuki Sato",
              role: "Partner, Research & Publication",
              base: "Kyoto",
              bio: "Joined in 2017, partner since 2022. Runs the Kyoto studio and the studio's three published monographs. Doctorate in tectonic theory from Kyoto University.",
            },
          ],
        },
      },
      {
        type: "recognition",
        fields: {
          eyebrow: "Recognition",
          items: [
            {
              year: "2024",
              title: "Mies van der Rohe Award",
              detail: "Nominee · Obsidian Pavilion",
            },
            {
              year: "2023",
              title: "Iceland Architecture Prize",
              detail: "Winner · Obsidian Pavilion",
            },
            { year: "2023", title: "AR House Awards", detail: "Cover feature · Salt House" },
            { year: "2022", title: "Wallpaper* Design Awards", detail: "Finalist · Holm Chapel" },
            { year: "2020", title: "DETAIL Prize", detail: "Honourable mention · Holm Chapel" },
            {
              year: "2018",
              title: "Slow Architectures 2009–2018",
              detail: "Monograph · Lars Müller Publishers",
            },
          ],
        },
      },
      {
        type: "locations",
        fields: {
          eyebrow: "Studios",
          items: STUDIOS.map((studio) => ({ ...studio, hours: "Mon–Fri · By appointment" })),
        },
      },
      contactSpread(),
    ],
  };
}

/**
 * `enabled` on the form follows the key, and the publish gate is why.
 *
 * A form with no delivery key is refused at publish, because submissions
 * would be lost silently. Seeding one unconditionally would therefore hand
 * an operator a draft that cannot be published and no obvious reason —
 * so with no key the section is parked, the rest of the page still ships,
 * and enabling it is a deliberate step after the key is set.
 */
function contact(contactFormKey: string): Record<string, unknown> {
  return {
    id: id(3),
    path: "/contact/",
    navLabel: "Contact",
    seo: {
      title: "Contact — Norven",
      description:
        "Bring us a site, a story, a single hour of light. Studios in Oslo, Lisbon, and Kyoto.",
    },
    sections: [
      {
        type: "pageHero",
        fields: {
          eyebrow: "Brief",
          title: "Bring us\na site.",
          subtitle:
            "We accept three to five new commissions per year and read every brief carefully. Expect a personal response within fourteen days, usually sooner. Briefs from outside our usual region are welcome — distance is not a barrier; lack of intent is.",
        },
      },
      {
        type: "contactForm",
        enabled: contactFormKey !== "",
        fields: {
          eyebrow: "Enquiries",
          heading: "Send a brief.",
          note: "Portfolio note — I built Norven as a fictional studio for this portfolio. Submissions reach me (Farul Ivan), not a real architecture firm.",
          fallbackEmail: "studio@norven.example",
          projectTypes: [
            { label: "Residence" },
            { label: "Cultural" },
            { label: "Commercial" },
            { label: "Civic" },
            { label: "Landscape" },
            { label: "Research / publication" },
          ],
          submitLabel: "Send brief →",
          successMessage: "Thank you — your brief has arrived. We reply within fourteen days.",
        },
      },
      {
        type: "locations",
        fields: {
          eyebrow: "Studios",
          items: STUDIOS.map((studio) => ({ ...studio, hours: "Mon–Fri · By appointment" })),
        },
      },
    ],
  };
}

/**
 * The colophon, rewritten rather than ported.
 *
 * Norven's original described a standalone Astro site building to S3 behind
 * Cloudflare. None of that is true any more, and a page whose entire subject
 * is "how this was built" cannot describe a stack that no longer exists. It
 * also cannot simply describe the new one as though it had always been that
 * way — a reader who saw the old page, or who follows the archived repository,
 * needs the transition explained rather than quietly overwritten. So the
 * lineage is the spine of the page: what it was, what it is, and why it moved.
 */
function colophon(): Record<string, unknown> {
  return {
    id: id(4),
    path: "/colophon/",
    navLabel: "Colophon",
    seo: {
      title: "Colophon — Norven",
      description:
        "How Norven is built: a fictional studio, and the CMS that now publishes it. Stack, decisions, and the move from a standalone site to Plinth.",
    },
    sections: [
      {
        type: "pageHero",
        fields: {
          eyebrow: "About this build",
          title: "Colophon.",
          subtitle:
            "This is not a real architecture firm. Norven is a portfolio project: the studio, its offices, its built work, and its people are invented. The build itself is the artefact — and the build has changed since this page was first written.",
        },
      },
      {
        type: "prose",
        fields: {
          blocks: [
            {
              eyebrow: "The fiction",
              heading: "Norven is a studio that doesn't exist.",
              tone: "bone",
              body: [
                "The studio, its three offices in Oslo, Lisbon, and Kyoto, the one hundred eighteen built projects, the team, the testimonials, the awards — all invented, end to end. The fiction exists to give the architecture serious enough subject matter that the craft of the build is visible against it.",
                "The contact details rendered as the studio’s — studio@norven.example, a Norwegian dialling code — are deliberate non-deliverable placeholders, so nobody is misled into writing to a real-looking address. The enquiry form posts to a real endpoint; submissions reach the author, not a fictional studio inbox.",
              ],
            },
            {
              eyebrow: "What changed",
              heading: "This site used to be its own repository.",
              tone: "bone2",
              body: [
                "Until recently Norven was a standalone Astro site. Its content lived in the repository as markdown and TypeScript data files, a commit triggered a build, and the output went to an S3 bucket behind Cloudflare. Editing a project meant opening an editor, changing a file, and pushing. That worked, and for a site with one author it was the right shape.",
                "It is now published by Plinth — a small multi-tenant CMS built for exactly this purpose. The content lives in Postgres instead of in files. Editing happens in a browser. Publishing takes an immutable snapshot of the document, runs the same Astro build against it, and uploads the result to Cloudflare R2; an edge worker then points the hostname at the new version by swapping a single pointer.",
                "The reason for the move is narrow and worth stating plainly: adding a sixth project should not require a deploy. Under the old shape, every content change was a code change, which meant every content change carried a build’s risk and a developer’s availability. Under the new one, the content and the code have separate release cycles — and the site can be handed to somebody who does not write code at all.",
                "What did not change is the output. The same renderer draws the same sections, the pages are still fully static HTML with no client-side framework, and the performance and accessibility budgets the old site held itself to are enforced against the new one on every pull request.",
              ],
            },
            {
              eyebrow: "About the author",
              heading: "Built by Farul Ivan.",
              tone: "bone",
              body: [
                "If you are hiring, collaborating, or curious about a technical choice on this site, the enquiry form reaches me. So does farulivan@gmail.com.",
                "Every significant decision in both the old build and the new one is written down as an architecture decision record, with the alternatives that were rejected and the reason. Those records, rather than this page, are the honest account.",
              ],
            },
          ],
        },
      },
      {
        type: "stack",
        fields: {
          eyebrow: "The stack",
          heading: "What runs this, and why.",
          rows: [
            {
              layer: "Content",
              choice: "Postgres, row-level security per tenant",
              note: "One versioned JSON document per site. Isolation is enforced by the database rather than by query authors, so a missed WHERE clause cannot cross tenants.",
            },
            {
              layer: "Editor",
              choice: "Next.js, forms derived from the schema",
              note: "The manifest schema IS the form definition — a field cannot exist in the editor without existing in validation, so the two can never drift.",
            },
            {
              layer: "Renderer",
              choice: "React components, server-rendered only",
              note: "One renderer draws both the live preview and the published page, so the preview cannot lie. No client directives, so no framework reaches the browser.",
            },
            {
              layer: "Build",
              choice: "Astro, against an immutable snapshot",
              note: "Publishing freezes the document first and builds from the frozen copy. A rollback is a pointer swap to a snapshot that already built, not a rebuild that might not.",
            },
            {
              layer: "Media",
              choice: "Sharp at upload, content-addressed in R2",
              note: "AVIF, WebP and JPEG at seven widths, processed once at upload rather than on every publish. Paths are content hashes, so the cache header never lies.",
            },
            {
              layer: "Hosting",
              choice: "Cloudflare R2 and Workers",
              note: "Zero egress fees and the CDN in the same account. The worker resolves a hostname to a version and serves the objects; there is no origin server to keep alive.",
            },
            {
              layer: "Jobs",
              choice: "Inngest, durable steps",
              note: "Build, promote, and edge sync are separate retryable steps. A failure after the build does not re-run the build.",
            },
            {
              layer: "Forms",
              choice: "Web3Forms, not a native endpoint",
              note: "Submissions are the one class of visitor data the platform would otherwise store and be responsible for deleting. Sending them straight to an inbox keeps them out of it.",
            },
            {
              layer: "Quality",
              choice: "Lighthouse and axe, per pull request",
              note: "Performance, accessibility, SEO and a JavaScript budget are asserted against a real build with real photographs, not a stub.",
            },
            {
              layer: "Previous",
              choice: "Standalone Astro, S3 + Cloudflare",
              note: "What this row describes is what the whole table used to say. The old repository is archived and its decision records are preserved there.",
            },
          ],
        },
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Gallery captions and alt text, in the order the photographs are ingested.
 * Separate from the refs because a caption is content and a ref is a pointer
 * at bytes — and because the fixture supplies fewer refs than there are
 * captions, so the two lists are zipped rather than assumed equal.
 */
const GALLERY: Record<string, { alt: string; caption: string }[]> = {
  "salt-house": [
    {
      alt: "Salt House — exterior, approach from the fishermen's path",
      caption: "Exterior · approach",
    },
    { alt: "Salt House — primary interior volume, oak stair", caption: "Interior · main volume" },
    { alt: "Salt House — cedar rainscreen and copper roof detail", caption: "Detail · materials" },
    { alt: "Salt House — site above the Skagerrak, Tjøme", caption: "Site · context" },
  ],
  "obsidian-pavilion": [
    {
      alt: "Obsidian Pavilion — exterior, cast-basalt stack at Þingvellir",
      caption: "Exterior · approach",
    },
    {
      alt: "Obsidian Pavilion — interior shaft, ash reading bench",
      caption: "Interior · main volume",
    },
    {
      alt: "Obsidian Pavilion — light slot detail, winter solstice angle",
      caption: "Detail · materials",
    },
    { alt: "Obsidian Pavilion — site at the Almannagjá fault, Iceland", caption: "Site · context" },
  ],
  "terra-works": [
    {
      alt: "Terra Works — exterior, south facade of the 1937 ceramic warehouse, Marvila",
      caption: "Exterior · approach",
    },
    {
      alt: "Terra Works — interior CLT armature, exposed oiled glulam beams",
      caption: "Interior · main volume",
    },
    {
      alt: "Terra Works — air gap between timber insert and historic brick wall",
      caption: "Detail · materials",
    },
    {
      alt: "Terra Works — courtyard shallow pool and covered ground-floor corridor",
      caption: "Site · context",
    },
  ],
  "holm-chapel": [
    {
      alt: "Holm Chapel — exterior, rammed earth mass at Higashiyama",
      caption: "Exterior · approach",
    },
    {
      alt: "Holm Chapel — interior, zelkova bench under the oculus light cut",
      caption: "Interior · main volume",
    },
    {
      alt: "Holm Chapel — rammed earth striations, 38 horizontal lifts in detail",
      caption: "Detail · materials",
    },
    { alt: "Holm Chapel — site within the university campus, Kyoto", caption: "Site · context" },
  ],
  "nord-strata-tower": [
    {
      alt: "Nord-Strata Tower — exterior render, sixteen cantilevered plates, Reykjavík",
      caption: "Exterior · approach",
    },
    {
      alt: "Nord-Strata Tower — interior central daylight void, exhibition floor",
      caption: "Interior · main volume",
    },
    {
      alt: "Nord-Strata Tower — chamfered concrete plate edge and laitance aggregate detail",
      caption: "Detail · materials",
    },
    { alt: "Nord-Strata Tower — site model, Reykjavík harbour context", caption: "Site · context" },
  ],
};

/** Zip a project's photograph refs with its captions. */
function galleryFor(media: NorvenMedia, slug: string): Record<string, unknown>[] {
  const refs = media.gallery?.[slug] ?? [];
  const meta = GALLERY[slug] ?? [];
  return refs.flatMap((ref, index) => {
    const item = meta[index];
    return item ? [{ image: ref(item.alt), caption: item.caption }] : [];
  });
}

function projects(media: NorvenMedia): Record<string, unknown>[] {
  const entry = (
    n: number,
    slug: string,
    cover: MakeRef,
    fields: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id: id(100 + n),
    slug,
    enabled: true,
    seo: { noindex: false },
    fields: {
      ...fields,
      cover: cover(`${String(fields["title"])} — ${String(fields["brief"])}`.slice(0, 300)),
    },
  });

  return [
    entry(1, "salt-house", media.saltHouse, {
      title: "Salt House",
      year: 2023,
      kind: "Residence",
      status: "Built",
      location: "Tjøme, Norway",
      area: "280 m²",
      brief:
        "A coastal residence cut into a granite shelf above the Skagerrak. Three volumes stepped down the slope, a single oak stair binding them.",
      body: [
        "The site is a granite shelf 14 metres above the Skagerrak, exposed to prevailing south-west wind and the salt spray that follows it. A fishermen’s path cuts diagonally across the rock, bending around a jutting boss at mid-slope. The building does not interrupt the path. It settles below it, into three cuts in the shelf, each volume occupying the natural terrace the rock already offered.",
        "Section drives everything. The uppermost volume holds the living and kitchen spaces at the elevation of the path; below it, a sleeping block cantilevered 1.2 metres over the granite; below that, a single hearth room at the water’s edge. An oak stair threads through all three, its treads left rough-sawn and untreated. Salt-air drying screens of stainless mesh span between the sleeping block and the rock face, framing a utility recess sheltered from the prevailing direction.",
        "The plinth is board-marked concrete struck directly from rough-sawn shuttering, the grain of the timber pressed into the surface. Above it, a cedar rainscreen of 90 mm vertical boards, already greying at the south corners. The roof is copper standing-seam: red-brown now, expected to reach a near-black patina in twelve winters, reading against the granite shelf as a continuous dark surface when seen from the approach by water.",
      ],
      gallery: galleryFor(media, "salt-house"),
      testimonial: {
        quote:
          "We asked for a house that would earn its place on the rock, and they gave us one that seems to have always been there. Every season it looks more itself.",
        author: "Margrét Sól",
        role: "Owner, Salt House",
      },
    }),
    entry(2, "obsidian-pavilion", media.obsidian, {
      title: "Obsidian Pavilion",
      year: 2024,
      kind: "Cultural",
      status: "Built",
      location: "Þingvellir, Iceland",
      area: "640 m²",
      brief:
        "A reading room and lava-field interpretive structure at the seam between the North American and Eurasian plates. Vertical, narrow, deliberately weightless.",
      body: [
        "Þingvellir is a rift valley: two tectonic plates separating at 2.5 cm per year, the ground literally tearing in slow time. The Icelandic Heritage Council commissioned a structure that would register this condition without explaining it, placed at the edge of the Almannagjá fault. Silence is the primary material at the site; wind from the north comes across open water and arrives unchanged. The brief asked for a reading room and an orientation space, nothing more.",
        "Twelve cast-basalt slabs stack vertically around a narrow central shaft. Each slab rotates 3° on plan relative to the one below, so the stack accumulates a total rotation of 33° between plinth and crown. This rotation generates a vertical compression effect: the interior reads as progressively taller toward the top, adding a perceived half-metre of height beyond the structural 5.4 m. Slabs four and eight are cast in a lighter aggregate, marking the two moments where the rift fault lines cross the building’s footprint.",
        "Inside, a single reading bench in waxed ash runs the length of the north wall at 380 mm height. A light slot 220 mm wide and 4.1 m tall cuts the north face at 14° from vertical, calculated to admit direct sunlight to the bench surface between 11:12 and 11:54 on the winter solstice. The Heritage Council brief excluded artificial lighting in perpetuity. After dusk the structure is closed.",
      ],
      gallery: galleryFor(media, "obsidian-pavilion"),
    }),
    entry(3, "terra-works", media.terraWorks, {
      title: "Terra Works",
      year: 2025,
      kind: "Commercial",
      status: "Built",
      location: "Marvila, Lisbon",
      area: "4,200 m²",
      brief:
        "Adaptive reuse of a 1937 ceramics warehouse into studio offices for nine creative tenants. Original shell retained; programme built as freestanding timber inserts.",
      body: [
        "The warehouse was built in 1937 for a tile manufacturer and stood dormant for 24 years following the factory’s closure in 2001. The Lisbon city authority placed a preservation order on the brick shell; the client required 4,200 m² of leasable creative studios without suspended ceilings, without the warehouse’s proportions being domesticated. The brief also asked that the intervention be structurally reversible: the building should be returnable to its original condition within a defined number of decades.",
        "A cross-laminated timber armature was designed as a freestanding structure inserted 3 metres clear of the original brick walls on all four sides. The timber frame carries its own loads independently; no fixings penetrate the historic masonry at a structural level. Floor plates are 200 mm CLT on glulam beams, the underside left exposed and oiled. Nine studio units are arranged across three levels, each with 4.8-metre clear internal height. The armature can be disassembled in sequence without damaging the shell.",
        "The air gap between timber insert and brick wall reads at ground level as a covered public corridor, open on the south face and shaded by the original wall mass on the north. Rainwater from the warehouse roof is collected in two 40,000-litre tanks beneath the courtyard and feeds a shallow pool at the centre of the ground-floor plan. The pool is owned collectively by all nine tenants; access is governed by a shared maintenance agreement written into the lease.",
      ],
      gallery: galleryFor(media, "terra-works"),
    }),
    entry(4, "holm-chapel", media.holmChapel, {
      title: "Holm Chapel",
      year: 2022,
      kind: "Civic",
      status: "Built",
      location: "Higashiyama, Kyoto",
      area: "180 m²",
      brief:
        "A non-denominational chapel for a small university campus. One room, one bench, one light cut down through three storeys of rammed earth.",
      body: [
        "The commission came from the chaplaincy of a private university after a five-year selection process. The brief stipulated non-denominational use, a maximum footprint of 12 × 15 metres, and no objects, fixtures, or iconography that would resolve the room toward a specific tradition. The building was to be one room. The client’s words were: a place to sit and not be asked anything.",
        "The walls are rammed earth built in 38 horizontal lifts. The soil came from the previous structure on the site, a concrete caretaker’s pavilion demolished to make way for the chapel: its aggregate is now in the walls as visible striations, one lift every 180 mm. Wall thickness is 650 mm throughout, reducing to 400 mm at the single window aperture on the west face. Construction took eleven months, the earthwork completed before the roof structure was placed.",
        "A single oculus 220 mm wide and 4 m long is cut vertically through the roof plane, offset 1.8 m from the north wall. Its orientation is fixed to admit direct sunlight to the bench surface for sixteen minutes each day, between 11:32 and 11:48, year-round. Outside those minutes the room receives only reflected and diffused light. One bench of unjointed zelkova timber, 9 m long, 420 mm wide. Nothing else is built in.",
      ],
      gallery: galleryFor(media, "holm-chapel"),
    }),
    entry(5, "nord-strata-tower", media.nordStrata, {
      title: "Nord-Strata Tower",
      year: 2026,
      kind: "Cultural",
      status: "In Studio",
      location: "Reykjavík",
      area: "6,800 m²",
      brief:
        "A vertical archive and exhibition tower for the Nordic Council. Sixteen plates stacked around a central daylight void, sequenced by epoch.",
      body: [
        "The Nordic Council commissioned a vertical archive for material culture spanning the ninth century to the present, one storey per century, accessed via a continuous external ramp that winds the full height of the building. Each floor is a single room exhibiting a curated selection of objects, textiles, tools, and documents from one hundred years of Nordic life. The programme requires 6,800 m² of conditioned floor area, a conservation storage sub-level, and a public observation room at the crown.",
        "The structure is a board-marked concrete core 9.6 metres in diameter with sixteen pre-stressed concrete plates cantilevering 2.4 metres beyond the core perimeter on all sides. Each plate is 380 mm thick and cast with a chamfered lower edge to minimise its visual weight from below. The cantilever on all four faces creates a perimeter gap at floor level; glazing set into this gap draws reflected daylight from the central void down to the colonnade at ground. Plates three, seven, eleven, and fifteen are cast with a pale laitance aggregate drawn from a coastal basalt quarry in the Westfjords, marking the century boundaries between the medieval, early modern, industrial, and contemporary epochs.",
        "Planning consent is under review with the Reykjavík city authority. The project is at detailed design stage pending consent; structural tender has been prepared and will be issued upon approval. Site preparation is scheduled for early 2027, with targeted practical completion in the third quarter of 2029.",
      ],
      gallery: galleryFor(media, "nord-strata-tower"),
    }),
  ];
}
