"use client";

import {
  Children,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/cn";

type Entry = {
  name: string;
  description: string;
  keywords?: string;
  category: string;
};

type Category = { id: string; label: string };

// replaceState fires no event of its own, so picking a filter announces it.
const FILTER_EVENT = "lab-filter";

function subscribeFilter(onChange: () => void) {
  window.addEventListener(FILTER_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(FILTER_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

// Filters the server-rendered cards it's given rather than rendering its own,
// so the index keeps its static HTML and search only decides what to show.
// Results change instantly: filtering is constant, and animating dozens of
// live previews in and out on every keystroke would only slow it down.
export function LabSearch({
  entries,
  categories,
  children,
}: {
  entries: Entry[];
  categories: readonly Category[];
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cards = Children.toArray(children);

  // The filter lives in the URL, so a filtered view can be shared and
  // survives going into a component and back. The server always renders
  // "all"; the URL takes over once the page is hydrated.
  const fromUrl = useSyncExternalStore(
    subscribeFilter,
    () => new URLSearchParams(location.search).get("c") ?? "all",
    () => "all",
  );
  const category = categories.some((c) => c.id === fromUrl) ? fromUrl : "all";

  const pick = (id: string) => {
    const url = new URL(location.href);
    if (id === "all") url.searchParams.delete("c");
    else url.searchParams.set("c", id);
    history.replaceState(history.state, "", url);
    window.dispatchEvent(new Event(FILTER_EVENT));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Every word has to appear somewhere, in any order, so "drag card" finds
  // the swipe deck without the exact phrase.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.map(({ name, description, keywords = "" }) => {
    const haystack = `${name} ${description} ${keywords}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  const visible = matches.map(
    (m, i) => m && (category === "all" || entries[i].category === category),
  );
  const count = visible.filter(Boolean).length;
  // Counts follow the search, so each chip says what you'd get.
  const counts = new Map<string, number>();
  entries.forEach((e, i) => {
    if (matches[i]) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  });
  const all = matches.filter(Boolean).length;
  const filtered = words.length > 0 || category !== "all";

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p
          className="shrink-0 text-sm text-muted tabular-nums"
          aria-live="polite"
        >
          {filtered
            ? `${count} of ${entries.length}`
            : `${entries.length} experiments`}
        </p>
        {/* Its own form: the index also holds password demos outside any
            form, and Chrome pairs every loose field on a page with them and
            fills this box with the saved login. */}
        <form
          role="search"
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
          className="relative w-full max-w-64"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.25 10.25 3 3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (query) setQuery("");
              else e.currentTarget.blur();
            }}
            placeholder="Search the lab"
            aria-label="Search the lab"
            aria-keyshortcuts="/"
            spellCheck={false}
            autoComplete="off"
            // 16px on phones: iOS Safari zooms the page into any smaller
            // input it focuses.
            className="h-9 w-full rounded-full bg-surface pr-3 pl-9 text-base text-foreground sm:pr-9 sm:text-sm shadow-raised outline-hidden placeholder:text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-search-cancel-button]:appearance-none"
          />
          {/* Hidden once typing starts, so it never sits under the text, and
              on phones, which have no key to press. */}
          {!query && (
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 sm:flex min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border px-1 font-mono text-[11px] text-muted"
            >
              /
            </kbd>
          )}
        </form>
      </div>

      {/* Scrolls sideways on a phone instead of wrapping into a tall block;
          the edges fade so the cut-off chip reads as "more this way". */}
      <div
        role="group"
        aria-label="Filter by category"
        className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
      >
        {[{ id: "all", label: "All" }, ...categories].map((c) => {
          const n = c.id === "all" ? all : (counts.get(c.id) ?? 0);
          const on = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(c.id)}
              className={cn(
                "flex h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap outline-hidden transition-[scale,background-color,color,opacity] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]",
                on
                  ? "bg-foreground text-background"
                  : "bg-surface text-foreground hover:bg-foreground/10",
                // A category the search has emptied stays, but quietly.
                n === 0 && !on && "opacity-45",
              )}
            >
              {c.label}
              <span
                className={cn(
                  "tabular-nums",
                  on ? "text-background/60" : "text-muted",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* grid-cols-1 rather than no template: its minmax(0, 1fr) caps the
          column at the screen, where an implicit column grows to fit the
          widest demo and scrolls the whole page sideways on phones. */}
      {/* Three across only when a card is at least as wide as the 316px
          the previews are scaled for; the sidebar makes the page width a
          poor guide, so the grid asks its own container. */}
      <div className="@container mt-4">
        <ul className="grid grid-cols-1 gap-3 @min-[600px]:grid-cols-2 @min-[1000px]:grid-cols-3">
          {cards.filter((_, i) => visible[i])}
        </ul>
      </div>

      {count === 0 && (
        <p className="py-16 text-center text-sm text-muted">
          {words.length ? (
            <>Nothing matches &ldquo;{query.trim()}&rdquo;</>
          ) : (
            "Nothing here yet"
          )}
          {category !== "all" && (
            <>
              {" "}in{" "}
              {categories.find((c) => c.id === category)?.label}.{" "}
              <button
                type="button"
                onClick={() => pick("all")}
                className="rounded-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-2 outline-hidden hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
              >
                Search everything
              </button>
            </>
          )}
          {category === "all" && "."}
        </p>
      )}
    </>
  );
}
