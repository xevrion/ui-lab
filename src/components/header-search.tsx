"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { LabEntry } from "@/lab/registry";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

type Item = Pick<
  LabEntry,
  "slug" | "name" | "description" | "keywords" | "category" | "isNew"
> & { label: string };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Dispatch this on window to open search from anywhere on the site.
export const OPEN_SEARCH = "lab:open-search";
const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const isClient = () => true;

// The list is only fetched once someone reaches for search (hovering the
// button is enough), so no page carries it until then.
let itemsPromise: Promise<Item[]> | undefined;
function loadItems() {
  itemsPromise ??= import("@/lab/registry").then(({ lab, categories }) =>
    lab.map((e) => ({
      slug: e.slug,
      name: e.name,
      description: e.description,
      keywords: e.keywords,
      category: e.category,
      isNew: e.isNew,
      label: categories.find((c) => c.id === e.category)?.label ?? "",
    })),
  );
  return itemsPromise;
}

// Every word must appear somewhere; names that start with the query rank
// first, then names containing it, then matches in the description.
function search(items: Item[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items.filter((i) => i.isNew).slice(-8).reverse();
  const words = q.split(/\s+/);
  return items
    .map((item) => {
      const name = item.name.toLowerCase();
      const hay = `${name} ${item.description} ${item.keywords ?? ""} ${item.label}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const rank = name.startsWith(q)
        ? 0
        : name.split(" ").some((w) => w.startsWith(words[0]))
          ? 1
          : name.includes(q)
            ? 2
            : 3;
      return { item, rank };
    })
    .filter((r) => r !== null)
    .sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name))
    .slice(0, 50)
    .map((r) => r.item);
}

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  // The server can't know the platform, so it says Ctrl until hydrated.
  const mac = useSyncExternalStore(noop, isMac, () => false);
  const trigger = useRef<HTMLButtonElement>(null);

  // ⌘K / Ctrl K from any page toggles it, the shortcut people already try.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      // A demo on the page (the command palette) already took it.
      if (e.defaultPrevented) return;
      e.preventDefault();
      void loadItems();
      setOpen((o) => !o);
    };
    // Other parts of the site (the 404 page) can open it too.
    const onAsk = () => {
      void loadItems();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH, onAsk);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH, onAsk);
    };
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadItems()}
        onFocus={() => void loadItems()}
        aria-label="Search the lab"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="group/search flex h-9 items-center gap-2 rounded-full text-[13px] text-muted outline-hidden transition-[scale,color,background-color,box-shadow] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] max-sm:w-9 max-sm:justify-center max-sm:hover:bg-surface sm:bg-surface sm:pr-1.5 sm:pl-3 sm:shadow-[inset_0_0_0_1px_var(--border)] sm:hover:bg-background"
      >
        <SearchIcon />
        <span className="hidden pr-6 sm:inline">Search</span>
        <kbd className="hidden h-6 items-center rounded-full bg-background px-2 font-sans text-[11px] font-medium text-muted shadow-[inset_0_0_0_1px_var(--border)] sm:flex">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <SearchDialog
        open={open}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
      />
    </>
  );
}

function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const client = useSyncExternalStore(noop, isClient, () => false);
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const id = useId();
  const [items, setItems] = useState<Item[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadItems().then((all) => live && setItems(all));
    // The page behind stays put while the dialog is up.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      live = false;
      root.style.overflow = before;
    };
  }, [open]);

  const results = items ? search(items, query) : [];
  const current = Math.min(active, Math.max(0, results.length - 1));

  // The highlighted row stays in view as the arrows walk the list.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  const go = (slug: string) => {
    close();
    router.push(`/lab/${slug}`);
  };

  const t = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT };

  if (!client) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[min(14vh,120px)] sm:px-6">
          <motion.div
            aria-hidden
            onClick={close}
            className="absolute inset-0 bg-foreground/15 dark:bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={t}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search the lab"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={t}
            className="relative flex max-h-[min(560px,72dvh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-background shadow-[0_0_0_1px_var(--border),0_24px_60px_-12px_oklch(0_0_0/0.35)]"
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
              <span className="text-muted">
                <SearchIcon />
              </span>
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={
                  results.length ? `${id}-${current}` : undefined
                }
                aria-autocomplete="list"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const step = e.key === "ArrowDown" ? 1 : -1;
                    const n = results.length;
                    if (n) setActive((current + step + n) % n);
                  } else if (e.key === "Enter" && results[current]) {
                    e.preventDefault();
                    go(results[current].slug);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                  } else if (e.key === "Tab") {
                    // Only the field takes focus; the rows follow the arrows.
                    e.preventDefault();
                  }
                }}
                placeholder="Search the lab"
                spellCheck={false}
                autoComplete="off"
                // 16px on phones: iOS zooms into any smaller input it focuses.
                className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-muted sm:text-[15px] [&::-webkit-search-cancel-button]:appearance-none"
              />
              <kbd className="hidden h-6 items-center rounded-full px-2 font-sans text-[11px] font-medium text-muted shadow-[inset_0_0_0_1px_var(--border)] sm:flex">
                Esc
              </kbd>
            </div>

            {/* Sized by its results, up to the panel's cap, so a short
                list never leaves an empty slab below it. */}
            <div className="min-h-0 shrink overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
              {!query.trim() && results.length > 0 && (
                <p className="px-3 pt-1 pb-2 text-[12px] font-medium text-muted">
                  Newest
                </p>
              )}
              <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Results">
                {results.map((item, i) => (
                  <li
                    key={item.slug}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={i === current}
                    data-index={i}
                  >
                    <Link
                      href={`/lab/${item.slug}`}
                      tabIndex={-1}
                      onClick={(e) => {
                        // Plain clicks close the dialog; modified clicks
                        // (new tab) leave it open.
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        close();
                      }}
                      // Hover picks a row only when the pointer really moves,
                      // so scrolling the list under a still cursor doesn't.
                      onPointerMove={() => i !== current && setActive(i)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 outline-hidden transition-[background-color] duration-100",
                        i === current && "bg-surface",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-foreground">
                          {item.name}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {item.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {items && query.trim() && results.length === 0 && (
                <p className="px-3 py-10 text-center text-[14px] text-muted">
                  Nothing matches &ldquo;{query.trim()}&rdquo;
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </svg>
  );
}
