"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// Matches the h-10 height, so the collapsed state is a true circle.
const COLLAPSED = 40;
// Width animates rather than a layout transform on purpose: Motion's layout
// animation scales the box and has to counter-scale border-radius every
// frame, while a real width keeps rounded-full exact at every step. The
// field only grows into space the wrapper already reserves, so nothing
// around it reflows.
const EXPAND = { type: "spring", visualDuration: 0.28, bounce: 0 } as const;
// Closing is the system tidying up, so it gets out of the way faster.
const COLLAPSE = { type: "spring", visualDuration: 0.2, bounce: 0 } as const;
const INSTANT = { duration: 0 } as const;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Held back until the width has mostly settled, so the text never appears
// squeezed inside a half-open pill.
const PLACEHOLDER_IN = { duration: 0.15, delay: 0.16, ease: EASE_OUT };
const PLACEHOLDER_OUT = { duration: 0.08, ease: EASE_OUT };

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function ExpandingSearch({
  label = "Search",
  placeholder = "Search",
  width = 280,
  shortcut = "/",
  onSearch,
  onOpenChange,
  className,
}: {
  label?: string;
  placeholder?: string;
  width?: number;
  shortcut?: string | null;
  onSearch?: (query: string) => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Opening a search is occasional rather than constant, so the shortcut
  // morphs just like a click does; the animation shows where the field came
  // from.
  const change = (next: boolean) => {
    // The target has to be visible before focus can move to it. Focusing in
    // the same event also lets mobile browsers raise the keyboard.
    flushSync(() => {
      setOpen(next);
      if (!next) setQuery("");
    });
    onOpenChange?.(next);
  };

  const expand = () => {
    change(true);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== shortcut || open || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      // Inert copies, like the index preview, stay quiet.
      if (rootRef.current?.closest("[inert]")) return;
      e.preventDefault();
      expand();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const widthTransition = reduceMotion ? INSTANT : open ? EXPAND : COLLAPSE;
  const hiddenIcon = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };

  return (
    <div className={cn("flex justify-end", className)} style={{ width }}>
      <motion.form
        ref={rootRef}
        role="search"
        initial={false}
        animate={{ width: open ? width : COLLAPSED }}
        transition={widthTransition}
        onSubmit={(e) => {
          e.preventDefault();
          onSearch?.(query);
        }}
        onBlur={(e) => {
          if (!open || query !== "") return;
          if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
          change(false);
        }}
        className={cn(
          "relative h-10 shrink-0 overflow-hidden rounded-full bg-surface text-foreground shadow-raised transition-[scale] duration-150 ease-out motion-reduce:transition-none",
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foreground",
          "[&:has(>[data-trigger]:active)]:scale-[0.96]",
        )}
      >
        {/* Pinned to the left edge, so it rides the growing edge across
            instead of needing an animation of its own. */}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-3 left-3 size-4 transition-[color] duration-150 ease-out",
            open && "text-muted",
          )}
        >
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3 3" />
        </svg>

        <button
          ref={triggerRef}
          type="button"
          data-trigger
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          aria-keyshortcuts={shortcut ?? undefined}
          onClick={expand}
          className={cn(
            "absolute inset-0 rounded-full outline-hidden",
            open && "invisible",
          )}
        />

        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        {/* Full width from the start, so typed text never reflows while the
            pill is still opening around it. */}
        <input
          ref={inputRef}
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            change(false);
            triggerRef.current?.focus();
          }}
          style={{ width }}
          className={cn(
            "absolute inset-y-0 left-0 bg-transparent pr-10 pl-9 text-sm outline-hidden [&::-webkit-search-cancel-button]:appearance-none max-sm:text-[16px]",
            !open && "invisible",
          )}
        />
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: open && query === "" ? 1 : 0 }}
          // Typing hides it instantly, like a native placeholder, so the first
          // letter never lands underneath it. Only opening and closing fade.
          transition={
            query !== ""
              ? INSTANT
              : open
                ? PLACEHOLDER_IN
                : PLACEHOLDER_OUT
          }
          className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-sm max-sm:text-[16px] whitespace-nowrap text-muted"
        >
          {placeholder}
        </motion.span>

        <AnimatePresence initial={false}>
          {open && query !== "" && (
            <motion.button
              key="clear"
              type="button"
              aria-label="Clear search"
              initial={hiddenIcon}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              exit={hiddenIcon}
              transition={ICON_SWAP}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full text-muted outline-hidden transition-[color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                aria-hidden
                className="size-3.5"
              >
                <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.form>
    </div>
  );
}

export default function ExpandingSearchDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center">
        {/* Sits under the pill and fades as it opens, so the header keeps
            its size and nothing moves. */}
        <span
          aria-hidden={open}
          className={cn(
            "pointer-events-none absolute left-1 text-sm font-medium text-foreground transition-[opacity] duration-150 ease-out",
            open && "opacity-0",
          )}
        >
          Projects
        </span>
        <ExpandingSearch placeholder="Search projects" onOpenChange={setOpen} />
      </div>
      <p className="text-xs text-muted">
        Press{" "}
        <kbd className="rounded border border-border px-1 font-mono">/</kbd> to
        search
      </p>
    </div>
  );
}
