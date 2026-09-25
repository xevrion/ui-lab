"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Slot = number | "start-gap" | "end-gap";

// Always seven slots once there are more than seven pages, so the control
// keeps one width and the arrows never move while you page through.
function slots(page: number, total: number): Slot[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "end-gap", total];
  if (page >= total - 3)
    return [
      1,
      "start-gap",
      ...Array.from({ length: 5 }, (_, i) => total - 4 + i),
    ];
  return [1, "start-gap", page - 1, page, page + 1, "end-gap", total];
}

// A gap counts as the middle of the pages it hides, so every slot has a
// number to compare and knows which way to roll.
function valueAt(layout: Slot[], i: number): number {
  const slot = layout[i];
  if (typeof slot === "number") return slot;
  return ((layout[i - 1] as number) + (layout[i + 1] as number)) / 2;
}

const sameLayout = (a: Slot[], b: Slot[]) =>
  a.length === b.length && a.every((slot, i) => slot === b[i]);

// Slots are fixed places; only their labels change, rolling like an
// odometer wheel. Critically damped, so a label never overshoots its slot.
const ROLL = { type: "spring", duration: 0.35, bounce: 0 } as const;
const GLIDE = { type: "spring", duration: 0.3, bounce: 0 } as const;
// How far a label travels as it rolls: past the 20px line box, so the
// incoming and outgoing numbers never sit on top of each other.
const ROLL_DISTANCE = 14;
// A finger has already lifted, so there is nothing under it to protect;
// this only lets the tap's own feedback land before the numbers roll.
const TOUCH_SETTLE_MS = 450;

const slotBox = "relative flex h-9 min-w-0 flex-1 items-center justify-center sm:size-10 sm:flex-none";

const control =
  "relative flex h-9 w-full min-w-0 touch-manipulation items-center justify-center rounded-full text-sm font-medium tabular-nums outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground sm:size-10 motion-reduce:transition-[color,background-color]";

export function Pagination({
  page,
  total,
  onPageChange,
  label = "Pagination",
  className,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Set by arrow keys, so focus follows the page only when the keyboard moved it.
  const focusCurrent = useRef(false);
  // The row as it stood when a number was clicked. It holds while the
  // pointer is still over the control, so the number you just clicked stays
  // under it (and the one beside it stays where you were aiming). Leaving
  // the control recentres the window, the way a browser's tab strip waits
  // for the mouse to leave before it closes up the gaps.
  const [frozen, setFrozen] = useState<Slot[] | null>(null);
  const standard = slots(page, total);
  const visible = frozen && frozen.includes(page) ? frozen : standard;

  // Each slot rolls up when its number grows and down when it shrinks.
  // Worked out while rendering, from the layout that was on screen before.
  const [shown, setShown] = useState<{ layout: Slot[]; dirs: number[] }>({
    layout: visible,
    dirs: [],
  });
  if (!sameLayout(shown.layout, visible)) {
    setShown({
      layout: visible,
      dirs: visible.map((_, i) =>
        i < shown.layout.length
          ? Math.sign(valueAt(visible, i) - valueAt(shown.layout, i))
          : 0,
      ),
    });
  }

  useEffect(() => () => clearTimeout(settle.current), []);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), total);
    if (clamped !== page) onPageChange(clamped);
  };

  const recenter = () => {
    clearTimeout(settle.current);
    setFrozen(null);
  };

  useEffect(() => {
    if (!focusCurrent.current) return;
    focusCurrent.current = false;
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.focus();
  }, [page]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = {
      ArrowLeft: page - 1,
      ArrowRight: page + 1,
      Home: 1,
      End: total,
    }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    focusCurrent.current = true;
    recenter();
    go(target);
  };

  const atStart = page <= 1;
  const atEnd = page >= total;

  return (
    <MotionConfig reducedMotion="user">
      <nav
        aria-label={label}
        className={cn("flex justify-center", className)}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") recenter();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            recenter();
        }}
      >
        <ul
          ref={listRef}
          onKeyDown={onKeyDown}
          className="relative flex w-full max-w-[340px] items-center gap-0.5 sm:w-auto sm:max-w-none sm:gap-1"
        >
          <li className="min-w-0 flex-1 sm:flex-none">
            {/* aria-disabled rather than disabled, so a focused arrow keeps
                focus when it reaches the end instead of dropping it to the page. */}
            <button
              type="button"
              aria-label="Previous page"
              aria-disabled={atStart}
              onClick={() => {
                recenter();
                go(page - 1);
              }}
              className={cn(
                control,
                atStart
                  ? "cursor-not-allowed text-muted opacity-40"
                  : "text-foreground hover:bg-surface active:scale-[0.96]",
              )}
            >
              <Chevron direction="left" />
            </button>
          </li>

          {/* Keyed by position, not page: the seven places never move or
              remount, only the numbers printed on them change. */}
          {visible.map((slot, index) => {
            const current = slot === page;
            const dir = shown.dirs[index] ?? 0;
            return (
              <li key={index} className={slotBox}>
                {typeof slot === "number" ? (
                  <button
                    type="button"
                    aria-label={`Page ${slot}`}
                    aria-current={current ? "page" : undefined}
                    onClick={(e) => {
                      setFrozen(visible);
                      go(slot);
                      // Touch has no hover to wait out, so it recentres
                      // on its own once the tap has registered.
                      if (
                        e.nativeEvent instanceof PointerEvent &&
                        e.nativeEvent.pointerType === "touch"
                      ) {
                        clearTimeout(settle.current);
                        settle.current = setTimeout(
                          () => setFrozen(null),
                          TOUCH_SETTLE_MS,
                        );
                      }
                    }}
                    className={cn(
                      control,
                      "peer absolute inset-0",
                      !current &&
                        "hover:bg-surface active:scale-[0.96] motion-reduce:active:scale-100",
                    )}
                  />
                ) : null}
                {current && (
                  <motion.span
                    layoutId={`${id}-pill`}
                    transition={GLIDE}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full bg-foreground"
                  />
                )}
                <Wheel
                  value={slot}
                  dir={dir}
                  className={cn(
                    "transition-[color,scale] duration-150 ease-out peer-active:scale-[0.96]",
                    current
                      ? "text-background"
                      : typeof slot === "number"
                        ? "text-muted peer-hover:text-foreground"
                        : "text-muted",
                  )}
                />
              </li>
            );
          })}

          <li className="min-w-0 flex-1 sm:flex-none">
            <button
              type="button"
              aria-label="Next page"
              aria-disabled={atEnd}
              onClick={() => {
                recenter();
                go(page + 1);
              }}
              className={cn(
                control,
                atEnd
                  ? "cursor-not-allowed text-muted opacity-40"
                  : "text-foreground hover:bg-surface active:scale-[0.96]",
              )}
            >
              <Chevron direction="right" />
            </button>
          </li>
        </ul>
      </nav>
    </MotionConfig>
  );
}

// One place on the odometer. The old label rolls out one way while the new
// one rolls in from the other, blurred at the edges of travel so the two
// read as one wheel turning rather than two numbers swapping.
function Wheel({
  value,
  dir,
  className,
}: {
  value: Slot;
  dir: number;
  className?: string;
}) {
  const label = typeof value === "number" ? String(value) : "…";
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none relative grid h-5 place-items-center text-sm font-medium tabular-nums select-none",
        className,
      )}
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={label}
          custom={dir}
          variants={{
            in: (d: number) => ({
              opacity: 0,
              y: d * ROLL_DISTANCE,
              filter: "blur(3px)",
            }),
            rest: { opacity: 1, y: 0, filter: "blur(0px)", transition: ROLL },
            // Leaves quicker than the new label arrives, so the eye lands on
            // the incoming number.
            out: (d: number) => ({
              opacity: 0,
              y: -d * ROLL_DISTANCE,
              filter: "blur(3px)",
              transition: { duration: 0.2, ease: EASE_OUT },
            }),
          }}
          initial="in"
          animate="rest"
          exit="out"
          className="col-start-1 row-start-1"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      // 1.5 matches the medium-weight numbers beside it.
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d={
          direction === "left"
            ? "M10 3.5 5.5 8l4.5 4.5"
            : "m6 3.5 4.5 4.5L6 12.5"
        }
      />
    </svg>
  );
}

const PER_PAGE = 5;
const TOTAL_ITEMS = 100;
const CUSTOMERS = [
  "Acme Studio",
  "Birchwood Labs",
  "Cobalt & Co",
  "Driftline",
  "Evergreen Health",
  "Fieldnote",
  "Granite Works",
  "Harbor Supply",
  "Ironbark",
  "Juniper Books",
  "Kestrel Air",
];

function invoice(n: number) {
  // Deterministic pseudo-random amounts, so the server and client agree.
  const cents = ((n * 7919) % 90000) + 4000;
  return {
    id: `INV-${1000 + n}`,
    customer: CUSTOMERS[(n * 7) % CUSTOMERS.length],
    amount: `$${(cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
    })}`,
  };
}

export default function PaginationDemo() {
  const reduceMotion = useReducedMotion();
  const pages = TOTAL_ITEMS / PER_PAGE;
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState(1);

  const first = (page - 1) * PER_PAGE + 1;
  const last = Math.min(page * PER_PAGE, TOTAL_ITEMS);
  // Pages slide a hair in the direction of travel; reduced motion keeps
  // only the fade.
  const shift = reduceMotion ? 0 : 8;

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-[min(480px,100%)]">
        <div className="rounded-2xl bg-background p-2 shadow-raised">
          <p
            aria-live="polite"
            className="px-3 pt-1.5 pb-2 text-sm text-muted tabular-nums"
          >
            Showing {first}-{last} of {TOTAL_ITEMS}
          </p>
          {/* Every page stacks in one grid cell, so the outgoing rows fade
              out in place while the new ones fade in over them. */}
          <div className="grid">
            <AnimatePresence initial={false} custom={direction}>
              <motion.ul
                key={page}
                custom={direction}
                variants={{
                  enter: (d: number) => ({
                    opacity: 0,
                    x: d * shift,
                    filter: reduceMotion ? "blur(0px)" : "blur(4px)",
                  }),
                  center: {
                    opacity: 1,
                    x: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.2, ease: EASE_OUT },
                  },
                  // Half the travel and quicker, so the old page gets out of
                  // the way rather than competing with the new one.
                  exit: (d: number) => ({
                    opacity: 0,
                    x: (-d * shift) / 2,
                    transition: { duration: 0.12, ease: EASE_OUT },
                  }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                className="col-start-1 row-start-1"
              >
                {Array.from({ length: last - first + 1 }, (_, i) => {
                  const item = invoice(first + i);
                  return (
                    <li
                      key={item.id}
                      className="flex h-12 items-center gap-3 rounded-xl px-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                        {item.customer}
                      </span>
                      <span className="font-mono text-xs text-muted">
                        {item.id}
                      </span>
                      <span className="w-20 text-right text-[15px] text-foreground tabular-nums">
                        {item.amount}
                      </span>
                    </li>
                  );
                })}
              </motion.ul>
            </AnimatePresence>
          </div>
        </div>

        <Pagination
          page={page}
          total={pages}
          onPageChange={(next) => {
            setDirection(next > page ? 1 : -1);
            setPage(next);
          }}
          label="Invoices pages"
          className="mt-4"
        />
      </div>
    </MotionConfig>
  );
}
