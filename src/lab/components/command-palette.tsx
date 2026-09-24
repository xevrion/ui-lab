"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Opened constantly, so the entrance is barely there: fast enough never to
// feel like waiting, just enough that the panel arrives rather than blinks.
const OPEN = { duration: 0.15, ease: EASE_OUT };
// Closing is quicker still; nobody watches a palette leave.
const CLOSE = { duration: 0.1, ease: EASE_OUT };

export type Command = {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  shortcut?: string[];
};

type Match = { command: Command; ranges: [number, number][] };

// Contiguous substring first, so "set" highlights "Settings" as one run
// instead of scattered letters; subsequence is the fallback ("gtst").
function match(label: string, query: string): [number, number][] | null {
  if (!query) return [];
  const hay = label.toLowerCase();
  const needle = query.toLowerCase();
  const at = hay.indexOf(needle);
  if (at !== -1) return [[at, at + needle.length]];
  const ranges: [number, number][] = [];
  let from = 0;
  for (const char of needle) {
    const i = hay.indexOf(char, from);
    if (i === -1) return null;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else ranges.push([i, i + 1]);
    from = i + 1;
  }
  return ranges;
}

const subscribeNoop = () => () => {};
function useIsMac() {
  // Server renders "Ctrl"; the client corrects it without a hydration mismatch.
  return useSyncExternalStore(
    subscribeNoop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

// The portal needs document.body, which only exists on the client.
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * Opened many times a day, so every animation stays tiny: a 150ms entrance,
 * a 100ms exit, and the active item moves instantly with the keys. Anything
 * longer would be paid on every use.
 */
export function CommandPalette({
  commands,
  onRun,
  placeholder = "Type a command or search",
  className,
}: {
  commands: Command[];
  onRun?: (command: Command) => void;
  placeholder?: string;
  className?: string;
}) {
  const isMac = useIsMac();
  const isClient = useIsClient();
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Last pointer position, so a list scrolling under a still cursor (which
  // browsers can report as hover) never steals the active item from the keys.
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const results = useMemo(() => {
    const matches: Match[] = [];
    for (const command of commands) {
      const ranges = match(command.label, query.trim());
      if (ranges) matches.push({ command, ranges });
    }
    const groups = [...new Set(matches.map((m) => m.command.group))];
    return groups.map((group) => ({
      group,
      items: matches.filter((m) => m.command.group === group),
    }));
  }, [commands, query]);

  // Flattened in rendered order, so arrow keys and indices always agree even
  // when commands arrive with their groups interleaved.
  const flat = useMemo(() => results.flatMap((g) => g.items), [results]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeItem = flat[activeIndex];
  const optionId = useCallback(
    (command: Command) => `${id}-option-${command.id}`,
    [id],
  );

  const show = useCallback(() => {
    setQuery("");
    setActive(0);
    pointer.current = null;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const run = (command: Command) => {
    close();
    onRun?.(command);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey || e.repeat) return;
      // Inert copies, like the index preview, stay quiet.
      if (triggerRef.current?.closest("[inert]")) return;
      // Browsers bind Ctrl+K to address bar search. Marking it handled also
      // tells the site's own search to stand aside on this page.
      e.preventDefault();
      if (open) close();
      else show();
    };
    // Capture, so it runs before the site's search, which listens later.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, close, show]);

  useEffect(() => {
    if (!open || !activeItem) return;
    // Smooth, so stepping past the edge glides the list along rather than
    // jumping it. "nearest" means it only scrolls when the item is out of view.
    document.getElementById(optionId(activeItem.command))?.scrollIntoView({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [open, activeItem, optionId, reduceMotion]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const count = flat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!count) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeItem) run(activeItem.command);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // The input is the dialog's only tab stop; keep focus inside.
      e.preventDefault();
    }
  };

  const onOptionPointerMove = (e: React.PointerEvent, index: number) => {
    if (e.pointerType === "touch") return;
    const last = pointer.current;
    if (last && last.x === e.clientX && last.y === e.clientY) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (index !== activeIndex) setActive(index);
  };

  let index = -1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        onClick={show}
        className={cn(
          "flex h-9 w-60 touch-manipulation items-center gap-2 rounded-lg bg-surface pr-1.5 pl-3 text-sm text-muted shadow-raised outline-hidden transition-[scale,color] duration-150 ease-out select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color]",
          className,
        )}
      >
        <SearchIcon />
        <span className="flex-1 text-left">Search commands</span>
        <Kbd keys={[isMac ? "⌘" : "Ctrl", "K"]} />
      </button>

      {isClient &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="fixed inset-0 z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: OPEN }}
                exit={{ opacity: 0, transition: CLOSE }}
              >
                {/* Token-only dim: a grey wash in light, near black in dark. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-foreground/10 dark:bg-background/70"
                  onClick={close}
                />
                <motion.div
                  // Grows from its top edge, where the eye already is at the input.
                  initial={reduceMotion ? false : { scale: 0.98 }}
                  animate={{ scale: 1, transition: OPEN }}
                  exit={
                    reduceMotion
                      ? undefined
                      : { scale: 0.98, transition: CLOSE }
                  }
                  role="dialog"
                  aria-modal="true"
                  aria-label="Command palette"
                  // Clicks anywhere in the panel keep focus in the input, so
                  // typing and arrow keys carry on after a stray click.
                  onMouseDown={(e) => {
                    if (!(e.target instanceof HTMLInputElement))
                      e.preventDefault();
                  }}
                  // Pinned 20vh from the top rather than vertically centered, so
                  // the input stays put while filtering resizes the list below.
                  className="absolute top-[20vh] left-1/2 flex w-[400px] max-w-[calc(100vw-32px)] origin-top -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-background shadow-raised"
                >
                  <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4 text-muted">
                    <SearchIcon />
                    <input
                      autoFocus
                      type="text"
                      role="combobox"
                      aria-expanded="true"
                      aria-controls={`${id}-listbox`}
                      aria-autocomplete="list"
                      aria-activedescendant={
                        activeItem ? optionId(activeItem.command) : undefined
                      }
                      aria-label="Search commands"
                      placeholder={placeholder}
                      spellCheck={false}
                      autoComplete="off"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                      }}
                      onKeyDown={onInputKeyDown}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted"
                    />
                  </div>

                  {/* 4px padding + 8px item radius = the panel's 12px radius. */}
                  <div
                    id={`${id}-listbox`}
                    role="listbox"
                    aria-label="Commands"
                    className={cn(
                      "max-h-[min(320px,50vh)] scroll-py-1 overflow-y-auto overscroll-contain p-1",
                      !flat.length && "hidden",
                    )}
                    onPointerLeave={() => {
                      pointer.current = null;
                    }}
                  >
                    {results.map(({ group, items }) => (
                      <div
                        key={group}
                        role="group"
                        aria-labelledby={`${id}-group-${group}`}
                      >
                        <div
                          id={`${id}-group-${group}`}
                          className="px-3 pt-2 pb-1 text-xs font-medium text-muted select-none"
                        >
                          {group}
                        </div>
                        {items.map(({ command, ranges }) => {
                          index += 1;
                          const i = index;
                          const selected = i === activeIndex;
                          return (
                            <div
                              key={command.id}
                              id={optionId(command)}
                              role="option"
                              aria-selected={selected}
                              onPointerMove={(e) => onOptionPointerMove(e, i)}
                              onClick={() => run(command)}
                              className={cn(
                                "flex h-9 cursor-default items-center gap-2.5 rounded-lg px-3 text-sm select-none",
                                selected && "bg-surface",
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "flex shrink-0",
                                  selected ? "text-foreground" : "text-muted",
                                )}
                              >
                                {command.icon}
                              </span>
                              <Highlight
                                label={command.label}
                                ranges={ranges}
                              />
                              {command.shortcut && (
                                <Kbd keys={command.shortcut} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {!flat.length && (
                    <p
                      role="status"
                      className="px-4 py-8 text-center text-sm text-muted"
                    >
                      No results
                    </p>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function Highlight({
  label,
  ranges,
}: {
  label: string;
  ranges: [number, number][];
}) {
  if (!ranges.length)
    return <span className="flex-1 truncate text-foreground">{label}</span>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(label.slice(cursor, start));
    parts.push(
      <span key={start} className="text-foreground">
        {label.slice(start, end)}
      </span>,
    );
    cursor = end;
  }
  parts.push(label.slice(cursor));
  return <span className="flex-1 truncate text-muted">{parts}</span>;
}

function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      {keys.map((key, i) => (
        <kbd
          key={i}
          className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-background px-1 font-sans text-[11px] leading-none text-muted"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function LineIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      // 1.5 matches the regular-weight labels beside it.
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function SearchIcon() {
  return (
    <LineIcon>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </LineIcon>
  );
}

const DEMO_COMMANDS: Command[] = [
  {
    id: "home",
    group: "Navigation",
    label: "Go to Home",
    shortcut: ["G", "H"],
    icon: (
      <LineIcon>
        <path d="M2.75 7.25 8 2.75l5.25 4.5v6h-3.5v-3.5h-3.5v3.5h-3.5z" />
      </LineIcon>
    ),
  },
  {
    id: "inbox",
    group: "Navigation",
    label: "Open Inbox",
    shortcut: ["G", "I"],
    icon: (
      <LineIcon>
        <path d="M2.75 9.25 4.5 3.25h7l1.75 6v3.5H2.75zM2.75 9.25h3l.75 1.5h3l.75-1.5h3" />
      </LineIcon>
    ),
  },
  {
    id: "settings",
    group: "Navigation",
    label: "Go to Settings",
    shortcut: ["G", "S"],
    icon: (
      <LineIcon>
        <path d="M2.75 4.75h6.5M12.25 4.75h1M2.75 11.25h1M6.75 11.25h6.5" />
        <circle cx="10.75" cy="4.75" r="1.5" />
        <circle cx="5.25" cy="11.25" r="1.5" />
      </LineIcon>
    ),
  },
  {
    id: "docs",
    group: "Navigation",
    label: "Search documentation",
    icon: (
      <LineIcon>
        <path d="M4.25 2.75h5l2.5 2.5v8h-7.5zM9.25 2.75v2.5h2.5M6.25 8.25h3.5M6.25 10.75h2" />
      </LineIcon>
    ),
  },
  {
    id: "new-file",
    group: "Actions",
    label: "New file",
    shortcut: ["⌘", "N"],
    icon: (
      <LineIcon>
        <path d="M8 3.25v9.5M3.25 8h9.5" />
      </LineIcon>
    ),
  },
  {
    id: "copy-link",
    group: "Actions",
    label: "Copy link",
    icon: (
      <LineIcon>
        <path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.75.75M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.75-.75" />
      </LineIcon>
    ),
  },
  {
    id: "theme",
    group: "Actions",
    label: "Toggle theme",
    shortcut: ["⇧", "T"],
    icon: (
      <LineIcon>
        <circle cx="8" cy="8" r="5.25" />
        <path d="M8 2.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />
      </LineIcon>
    ),
  },
  {
    id: "logout",
    group: "Actions",
    label: "Log out",
    icon: (
      <LineIcon>
        <path d="M6.75 2.75h-3v10.5h3M10.25 5.25 13 8l-2.75 2.75M13 8H6.25" />
      </LineIcon>
    ),
  },
];

export default function CommandPaletteDemo() {
  const [ran, setRan] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-3">
      <CommandPalette
        commands={DEMO_COMMANDS}
        onRun={(command) => setRan(command.label)}
      />
      {/* Height reserved up front, so the confirmation appearing never
          shifts the trigger in the centered demo. */}
      <p className="h-5 text-sm text-muted" aria-live="polite">
        {ran && (
          <>
            Ran: <span className="text-foreground">{ran}</span>
          </>
        )}
      </p>
    </div>
  );
}
