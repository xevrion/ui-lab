import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import Link from "next/link";
import { Arrow } from "@/components/arrow";
import { NewMark } from "@/components/new-mark";
import { SiteHeader } from "@/components/site-header";
import { LabDemo } from "@/lab/demos";
import { neighbours } from "@/lab/order";
import { categories, getEntry, lab, sourceUrl } from "@/lab/registry";
import { cn } from "@/lib/cn";
import {
  absoluteUrl,
  entryDescription,
  entryKeywords,
  labPath,
  site,
} from "@/lib/site";

export function generateStaticParams() {
  return lab.map(({ slug }) => ({ slug }));
}

// Every slug is known at build, so any other one is a plain 404 at the
// routing level, served like any unknown link, never rendered on demand.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/lab/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) return {};
  const description = entryDescription(entry);
  const path = labPath(slug);
  // openGraph and twitter replace the layout's objects wholesale, so the
  // shared fields are repeated here. The images come from the colocated
  // opengraph-image and twitter-image files.
  return {
    title: entry.name,
    description,
    keywords: entryKeywords(entry),
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      siteName: site.name,
      locale: site.locale,
      url: path,
      title: `${entry.name} · ${site.name}`,
      description,
      authors: [site.author.url],
    },
    twitter: {
      card: "summary_large_image",
      creator: site.author.twitter,
      title: `${entry.name} · ${site.name}`,
      description,
    },
  };
}

export default async function LabPage({ params }: PageProps<"/lab/[slug]">) {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const url = absoluteUrl(labPath(entry.slug));
  const { previous, next } = neighbours(entry.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareSourceCode",
        "@id": `${url}#code`,
        name: entry.name,
        description: entryDescription(entry),
        url,
        codeRepository: site.repo,
        // The component's own file on GitHub.
        sameAs: sourceUrl(entry.slug),
        programmingLanguage: { "@type": "ComputerLanguage", name: "TypeScript" },
        runtimePlatform: "React",
        keywords: entry.keywords,
        image: `${url}/opengraph-image`,
        author: { "@id": `${site.url}/#person` },
        isPartOf: { "@id": `${site.url}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Lab", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: entry.name, item: url },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        name: site.name,
        url: absoluteUrl("/"),
      },
      {
        "@type": "Person",
        "@id": `${site.url}/#person`,
        name: site.author.name,
        alternateName: site.author.handle,
        url: site.author.url,
        sameAs: site.author.sameAs,
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <SiteHeader title={entry.name} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
        {/* The stage: a quiet dotted canvas the demo sits on, so every piece
            is shown the same way, like work pinned to a board. Clipped
            sideways so thrown or dragged demos can't widen the page; `clip`
            rather than `hidden`, which would make it a scroll box. */}
        <div
          className={cn(
            "flex min-h-[min(620px,68dvh)] justify-center overflow-x-clip rounded-3xl border border-border bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_9%,transparent)_1px,transparent_1px)] [background-size:18px_18px] p-4 sm:p-8",
            entry.anchor === "top" ? "items-start pt-16" : "items-center",
          )}
        >
          <LabDemo slug={entry.slug} />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {entry.name}
              </h1>
              {entry.isNew && <NewMark />}
            </div>
            <p className="mt-2 max-w-xl text-[15px] text-pretty text-muted">
              {entry.description}
            </p>
            <Link
              href={`/?c=${entry.category}`}
              className="mt-3 inline-flex h-7 items-center rounded-full bg-surface px-3 text-xs font-medium text-muted outline-hidden transition-[color,background-color] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
            >
              {categories.find((c) => c.id === entry.category)?.label}
            </Link>
          </div>
          <a
            href={sourceUrl(entry.slug)}
            target="_blank"
            rel="noreferrer"
            aria-label={`${entry.name} source on GitHub`}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full bg-foreground px-4 text-sm font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5" />
            </svg>
            View source
          </a>
        </div>

        {/* Walks the lab in the sidebar's order, so you can browse without
            going back to the index. */}
        <nav aria-label="More from the lab" className="grid grid-cols-2 gap-3">
          {[
            { entry: previous, label: "Previous", align: "items-start" },
            { entry: next, label: "Next", align: "items-end text-right" },
          ].map(({ entry: e, label, align }) =>
            e ? (
              <Link
                key={label}
                href={labPath(e.slug)}
                className={cn(
                  "group/pager flex flex-col gap-1 rounded-2xl border border-border p-4 outline-hidden transition-[background-color,scale] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.99]",
                  align,
                )}
              >
                <span className="flex items-center gap-1 text-xs text-muted">
                  {/* Leans the way it goes on hover. */}
                  {label === "Previous" && (
                    <Arrow
                      direction="left"
                      className="size-3 transition-[translate] duration-150 ease-out group-hover/pager:-translate-x-0.5 motion-reduce:transition-none"
                    />
                  )}
                  {label}
                  {label === "Next" && (
                    <Arrow
                      direction="right"
                      className="size-3 transition-[translate] duration-150 ease-out group-hover/pager:translate-x-0.5 motion-reduce:transition-none"
                    />
                  )}
                </span>
                <span className="truncate text-sm font-medium">{e.name}</span>
              </Link>
            ) : (
              <span key={label} />
            ),
          )}
        </nav>
      </main>
    </>
  );
}
