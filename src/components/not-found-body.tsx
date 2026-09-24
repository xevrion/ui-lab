"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { lab } from "@/lab/registry";
import { Arrow } from "./arrow";
import { OPEN_SEARCH } from "./header-search";

const noop = () => () => {};
const noopPath = () => location.pathname;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Pairs of letters shared between two words, as a share of all pairs:
// forgiving of typos, swapped letters and missing hyphens.
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pairs = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      out.set(p, (out.get(p) ?? 0) + 1);
    }
    return out;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let shared = 0;
  for (const [p, n] of pa) shared += Math.min(n, pb.get(p) ?? 0);
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

// The experiments closest to what was typed, or the newest if nothing is.
function suggestions(path: string) {
  const last = norm(path.split("/").filter(Boolean).pop() ?? "");
  const ranked = lab
    .map((e) => {
      const score = Math.max(
        similarity(last, norm(e.slug)),
        similarity(last, norm(e.name)),
        last.length > 3 && norm(e.slug).includes(last) ? 0.8 : 0,
      );
      return { e, score };
    })
    // High enough that a shared common word ("page") isn't a match.
    .filter((r) => r.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.e);
  if (ranked.length) return { close: true, items: ranked };
  return {
    close: false,
    items: lab.filter((e) => e.isNew).slice(-3).reverse(),
  };
}

export function NotFoundBody() {
  // One 404 page is built ahead of time and served for every broken link,
  // so the link itself is only known once it's in the browser.
  const path = useSyncExternalStore(noop, noopPath, () => null);
  const { close, items } = suggestions(path ?? "");

  return (
    <section className="relative isolate flex flex-col items-center text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[440px] bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_11%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_50%_55%_at_50%_40%,black,transparent)]"
      />
      <p className="text-[13px] font-medium tracking-wide text-muted tabular-nums">
        404
      </p>

      {/* The link you followed, crossed out once by the red pen. */}
      <p className="relative mt-5 max-w-full">
        <span className="block max-w-[min(32rem,calc(100vw-2rem))] truncate rounded-full bg-surface px-4 py-1.5 font-mono text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--border)]">
          {/* A space holds the pill's height before the path arrives. */}
          {path ?? "\u00a0"}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="pointer-events-none absolute top-1/2 left-2 h-3 w-[calc(100%-1rem)] -translate-y-1/2 overflow-visible text-marker"
          fill="none"
        >
          <style>{`
            @keyframes nf-strike { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
            .nf-strike { stroke-dasharray: 1; animation: nf-strike 600ms cubic-bezier(0.65,0,0.35,1) 400ms both }
            @media (prefers-reduced-motion: reduce) { .nf-strike { animation: none } }
          `}</style>
          <path
            className="nf-strike"
            pathLength={1}
            d="M1 6.5C25 4 60 3.5 99 4.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </p>

      <h1 className="mt-6 text-[32px] leading-[1.1] font-semibold tracking-tight text-balance sm:text-[44px]">
        This one isn&rsquo;t in the lab
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-pretty text-muted">
        {close
          ? "The link might have a typo, or it moved. These look like what you were after."
          : "Maybe it moved, or it's still an idea on paper. Here's what's new instead."}
      </p>

      <ul className="mt-10 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
        {items.map((e) => (
          <li key={e.slug}>
            <Link
              href={`/lab/${e.slug}`}
              className="group/sug flex h-full flex-col rounded-2xl bg-background p-4 shadow-raised outline-hidden transition-[background-color,scale] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.98]"
            >
              <span className="flex items-center justify-between gap-2 text-[14px] font-medium text-foreground">
                {e.name}
                <Arrow
                  direction="right"
                  className="size-3 shrink-0 text-muted transition-[translate,color] duration-150 ease-out group-hover/sug:translate-x-0.5 group-hover/sug:text-foreground motion-reduce:transition-none"
                />
              </span>
              <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">
                {e.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex items-center gap-2">
        <Link
          href="/"
          className="flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
        >
          Back to the lab
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))}
          className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.25 10.25 3 3" />
          </svg>
          Search
        </button>
      </div>
    </section>
  );
}
