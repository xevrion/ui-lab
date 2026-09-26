import Link from "next/link";
import { siGithub } from "simple-icons";
import { JsonLd } from "@/components/json-ld";
import { LabCard, LabPreview } from "@/components/lab-card";
import { Arrow } from "@/components/arrow";
import { LabSearch } from "@/components/lab-search";
import { Underline } from "@/components/underline";
import { NewMark } from "@/components/new-mark";
import { ScrollMemory } from "@/components/scroll-memory";
import { SiteHeader } from "@/components/site-header";
import { SourceLink } from "@/components/source-link";
import { categories, lab } from "@/lab/registry";
import { absoluteUrl, labPath, site } from "@/lib/site";

// The newest batch leads, so returning visitors see it without scrolling
// past everything they've seen before, and the text effects trail at the
// end: their previews are words on a card, so the livelier ones go first.
// Search matches cards by position, so its entries come from this same list.
const rank = (e: (typeof lab)[number]) =>
  (e.category === "text" ? 2 : 0) + (e.isNew ? 0 : 1);
const shown = [...lab].sort((a, b) => rank(a) - rank(b));
// The registry appends, so the last flagged entry is the newest.
const latest = lab.findLast((e) => e.isNew) ?? lab[lab.length - 1];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      name: site.name,
      url: absoluteUrl("/"),
      description: site.description,
      inLanguage: "en",
      author: { "@id": `${site.url}/#person` },
      publisher: { "@id": `${site.url}/#person` },
    },
    {
      "@type": "Person",
      "@id": `${site.url}/#person`,
      name: site.author.name,
      alternateName: site.author.handle,
      url: site.author.url,
      sameAs: site.author.sameAs,
    },
    {
      "@type": "CollectionPage",
      "@id": `${site.url}/#collection`,
      name: `${site.name}: small interaction experiments by ${site.author.handle}`,
      url: absoluteUrl("/"),
      description: site.description,
      isPartOf: { "@id": `${site.url}/#website` },
      author: { "@id": `${site.url}/#person` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: lab.map(({ slug, name, description }, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name,
          url: absoluteUrl(labPath(slug)),
          description,
        })),
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader />
      <ScrollMemory />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-16 pb-16 sm:px-6 sm:pt-20">
        {/* Says plainly what the page is, for people and for the search and
            answer engines that quote it. It sits on the same dotted stage
            the demos do, fading out before the grid starts. */}
        <section className="relative isolate mb-16 flex flex-col items-center text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[440px] bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_11%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_50%_55%_at_50%_40%,black,transparent)]"
          />
          {/* Points at the latest thing, so the top of the page changes
              whenever something new lands. */}
          <Link
            href={labPath(latest.slug)}
            className="group/latest flex h-8 items-center gap-2 rounded-full bg-background pr-3 pl-1 text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--border)] outline-hidden transition-[color,scale] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
          >
            <span className="flex h-6 items-center rounded-full bg-foreground px-2 text-[12px] font-medium text-background">
              New
            </span>
            <span className="font-medium text-foreground">{latest.name}</span>
            <Arrow
              direction="right"
              className="size-3 transition-[translate] duration-150 ease-out group-hover/latest:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
          <h1 className="mt-6 max-w-2xl text-[34px] leading-[1.1] font-semibold tracking-tight text-balance sm:text-[46px]">
            Things I made because I liked how they{" "}
            <span className="relative inline-block">
              felt
              <Underline />
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-pretty text-muted">
            Not a library, just a lab. Small interaction experiments I built
            in React while learning motion and detail, each with a live demo
            and its source.
          </p>
          <div className="mt-8 flex items-center gap-2">
            <a
              href="#lab"
              className="flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
            >
              Browse the lab
            </a>
            <a
              href={site.repo}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
                <path d={siGithub.path} />
              </svg>
              Source
            </a>
          </div>
        </section>
        <div id="lab" className="scroll-mt-20" />
        <LabSearch
          categories={categories}
          entries={shown.map(({ name, description, keywords, category }) => ({
            name,
            description,
            keywords,
            category,
          }))}
        >
          {shown.map(({ slug, name, description, previewScale, previewCrop, isNew }, index) => {
            return (
              <LabCard
                key={slug}
                // Named groups, because demos use plain group-hover for their
                // own hover states; an unnamed group here would trigger all of
                // them whenever the card is hovered.
                className="group/card group/preview relative rounded-[20px] bg-background p-2 shadow-raised transition-[background-color] duration-150 ease-out hover:bg-surface"
              >
                  <LabPreview
                    slug={slug}
                    // Two rows at the widest grid, with stable placeholders below.
                    eager={index < 6}
                    scale={previewScale}
                    crop={previewCrop}
                  />
                  <div className="px-2 pt-3 pb-1">
                    {/* Right padding leaves room for the source link. */}
                    <p className="pr-20 text-sm font-medium">
                      {/* The title is the card's link, stretched over the
                          whole card by its ::after. Wrapping the card in the
                          link instead would nest any link inside a demo in
                          another link, which is invalid HTML and breaks
                          hydration. */}
                      <Link
                        href={`/lab/${slug}`}
                        className="outline-hidden after:absolute after:inset-0 after:rounded-[20px] focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-offset-2 focus-visible:after:outline-foreground"
                      >
                        {name}
                      </Link>
                      {/* The space keeps "new" a separate word for screen
                          readers and search snippets. */}{" "}
                      {isNew && <NewMark className="ml-1" />}
                    </p>
                    <p className="mt-0.5 text-sm text-pretty text-muted">
                      {description}
                    </p>
                  </div>
                {/* Above the stretched card link, so it stays its own target.
                    It sits on the title line, below the preview, so no demo
                    can ever run into it: 8px padding + 224px preview + 12px
                    gap puts the title 244px down, and 242 centers the 24px
                    link on its 20px line. */}
                <SourceLink
                  slug={slug}
                  name={name}
                  className="absolute top-[242px] right-3 z-10 px-1.5 py-1 text-xs group-hover/card:text-foreground"
                />
              </LabCard>
            );
          })}
        </LabSearch>
      </main>
    </>
  );
}
