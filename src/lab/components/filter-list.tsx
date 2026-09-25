"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type FilterItem = { name: string; category: string };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const PILL = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Survivors slide up over 250ms while leavers are gone in 150ms, so the gap
// is never left standing empty.
const SLIDE = { duration: 0.25, ease: EASE_OUT };
const LEAVE = { duration: 0.15, ease: EASE_OUT };
const ENTER = { duration: 0.2, ease: EASE_OUT };
// Waits for the leaving rows to clear before the empty state fades in over
// them.
const EMPTY_IN = { duration: 0.2, ease: EASE_OUT, delay: 0.1 };
// A count read out mid-word is noise; wait for a pause in typing.
const ANNOUNCE_DELAY = 600;

const INSTANT = { duration: 0 };

export function FilterList({
  items,
  categories,
  label = "Search",
  placeholder = "Search",
  className,
}: {
  items: FilterItem[];
  categories: string[];
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      item.name.toLowerCase().includes(needle),
  );

  const [announced, setAnnounced] = useState("");
  const count = visible.length;
  // Nothing to report until the user has actually filtered.
  const touched = query !== "" || category !== "All" || announced !== "";
  useEffect(() => {
    if (!touched) return;
    const timer = setTimeout(
      () => setAnnounced(count === 1 ? "1 result" : `${count} results`),
      ANNOUNCE_DELAY,
    );
    return () => clearTimeout(timer);
  }, [count, touched]);

  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="pointer-events-none absolute top-[15px] left-3.5 size-[18px] text-muted"
        >
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3 3" />
        </svg>
        <label htmlFor={`${id}-q`} className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id={`${id}-q`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          aria-controls={`${id}-list`}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || query === "") return;
            e.preventDefault();
            setQuery("");
          }}
          className="h-12 w-full rounded-[14px] border border-border bg-background pr-12 pl-11 text-[15px] text-foreground outline-hidden placeholder:text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        {/* 10px radius inside the 14px field with 4px of inset: concentric.
            Kept mounted so it swaps with the icon recipe both ways. */}
        <button
          type="button"
          aria-label="Clear search"
          tabIndex={query === "" ? -1 : undefined}
          aria-hidden={query === "" || undefined}
          onClick={clear}
          className={cn(
            "absolute top-1 right-1 flex size-10 touch-manipulation items-center justify-center rounded-[10px] text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]",
            query === "" && "pointer-events-none",
          )}
        >
          <motion.svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            aria-hidden
            className="size-[18px]"
            initial={false}
            animate={
              query !== ""
                ? { scale: 1, opacity: 1, filter: "blur(0px)" }
                : reduceMotion
                  ? { scale: 1, opacity: 0, filter: "blur(0px)" }
                  : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
            }
            transition={ICON_SWAP}
          >
            <path d="m4.75 4.75 6.5 6.5M11.25 4.75l-6.5 6.5" />
          </motion.svg>
        </button>
      </div>

      <div
        role="group"
        aria-label="Category"
        className="flex gap-1 rounded-full bg-surface p-1"
      >
        {["All", ...categories].map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c)}
              className={cn(
                "relative h-8 flex-1 touch-manipulation rounded-full text-sm font-medium outline-hidden transition-[scale,color] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color]",
                active ? "text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${id}-pill`}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-background shadow-raised"
                  transition={reduceMotion ? INSTANT : PILL}
                />
              )}
              <span className="relative">{c}</span>
            </button>
          );
        })}
      </div>

      {/* Fixed height with its own scroll, so filtering never moves anything
          on the page around it. layoutScroll lets Motion measure rows
          correctly after the list has been scrolled. */}
      <motion.div
        layoutScroll
        tabIndex={0}
        role="region"
        aria-label="Filter results"
        className="relative h-72 overflow-y-auto overscroll-contain rounded-2xl border border-border p-1.5 [scrollbar-width:thin] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      >
        <ul id={`${id}-list`} aria-label="Results" className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((item) => (
              <motion.li
                key={item.name}
                // Rows never change size, only place, so "position" skips
                // the scale correction that would stretch the text.
                layout="position"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={
                  reduceMotion
                    ? { opacity: 0, transition: LEAVE }
                    : { opacity: 0, scale: 0.98, transition: LEAVE }
                }
                transition={
                  reduceMotion
                    ? { ...ENTER, layout: INSTANT }
                    : { ...ENTER, layout: SLIDE }
                }
                className="flex h-11 items-center justify-between gap-4 rounded-[10px] px-3.5"
              >
                <span className="truncate text-[15px] text-foreground">
                  <Highlight text={item.name} needle={needle} />
                </span>
                <span className="shrink-0 text-[13px] text-muted">
                  {item.category}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <AnimatePresence initial={false}>
          {visible.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
                transition: EMPTY_IN,
              }}
              exit={{ opacity: 0, transition: INSTANT }}
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center text-[15px] text-muted"
            >
              <span className="text-foreground">No matches</span>
              <span className="text-[13px]">Try another word or category.</span>
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      <span className="sr-only" aria-live="polite">
        {announced}
      </span>
    </div>
  );
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-foreground/10 text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}

const COMPONENTS: FilterItem[] = [
  { name: "Hold to delete", category: "Motion" },
  { name: "Elastic slider", category: "Input" },
  { name: "Swipe deck", category: "Motion" },
  { name: "Segmented control", category: "Input" },
  { name: "Stacked drawer", category: "Layout" },
  { name: "Odometer", category: "Motion" },
  { name: "OTP input", category: "Input" },
  { name: "Snap carousel", category: "Layout" },
  { name: "Toast stack", category: "Motion" },
  { name: "Kanban board", category: "Layout" },
  { name: "Copy button", category: "Input" },
];

export default function FilterListDemo() {
  return (
    <FilterList
      items={COMPONENTS}
      categories={["Motion", "Input", "Layout"]}
      label="Search components"
      placeholder="Search components"
      className="w-[400px] max-w-full"
    />
  );
}
