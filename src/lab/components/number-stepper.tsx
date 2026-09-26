"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Short enough that a held button at full speed still reads as rolling
// rather than a blur of overlapping digits.
const ROLL = { duration: 0.18, ease: EASE_OUT };
const SLIDE = { type: "spring", visualDuration: 0.2, bounce: 0 } as const;
// Holding waits this long before repeating, so a click never double-steps.
const HOLD_DELAY = 400;
// Repeats start at this interval and shrink by ACCELERATION each step,
// down to FASTEST, so a long hold covers big ranges without overshooting
// small ones.
const FIRST_REPEAT = 150;
const ACCELERATION = 0.85;
const FASTEST = 40;

type Direction = 1 | -1;

// Updated during render from the previous value, so the roll direction is
// known on the same frame as the new digits.
function useDirection(value: number) {
  const [previous, setPrevious] = useState(value);
  const [direction, setDirection] = useState<Direction>(1);
  if (value !== previous) {
    setPrevious(value);
    setDirection(value > previous ? 1 : -1);
  }
  return direction;
}

export function RollingNumber({
  value,
  format = String,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const direction = useDirection(value);
  const chars = [...format(value)];
  return (
    <span aria-hidden className={cn("relative inline-flex tabular-nums", className)}>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        {chars.map((char, i) => {
          // Keyed by place from the right, so 9 to 10 keeps the ones column
          // and only adds a tens column.
          const place = chars.length - i;
          const digit = /\d/.test(char);
          return (
            <Place key={digit ? `d${place}` : `s${place}${char}`} digit={digit}>
              {digit ? <Digit char={char} direction={direction} /> : char}
            </Place>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

function Place({
  digit,
  children,
}: {
  digit: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      layout={reduceMotion ? false : "position"}
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, filter: "blur(0px)", transition: { duration: 0.1 } }}
      transition={{ ...ROLL, layout: SLIDE }}
      className={cn("inline-grid", digit && "overflow-hidden")}
    >
      {children}
    </motion.span>
  );
}

function Digit({ char, direction }: { char: string; direction: Direction }) {
  const reduceMotion = useReducedMotion();
  // Increasing rolls up: the new digit rises from below as the old one
  // leaves through the top. Decreasing mirrors it.
  const offset = (d: Direction) => (reduceMotion ? "0%" : `${d * 100}%`);
  return (
    <AnimatePresence initial={false} custom={direction}>
      <motion.span
        key={char}
        custom={direction}
        variants={{
          enter: (d: Direction) => ({ y: offset(d), opacity: 0 }),
          center: { y: "0%", opacity: 1 },
          exit: (d: Direction) => ({ y: offset(-d as Direction), opacity: 0 }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={ROLL}
        // Every digit shares one cell, so the outgoing one never shifts layout.
        className="col-start-1 row-start-1"
      >
        {char}
      </motion.span>
    </AnimatePresence>
  );
}

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  // Non-null only once the user types, so the rolling number stays in
  // charge until then.
  const [draft, setDraft] = useState<string | null>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const bumpAnimation = useRef<Animation>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Held-button repeats fire faster than React re-renders can be counted
  // on, so the latest value is tracked here too.
  const latest = useRef({ value, onChange, min, max });

  useLayoutEffect(() => {
    latest.current = { value, onChange, min, max };
  });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      bumpAnimation.current?.cancel();
    },
    [],
  );

  const bump = (direction: Direction) => {
    const el = valueRef.current;
    if (!el || reduceMotion) return;
    bumpAnimation.current?.cancel();
    // A 3px nudge toward the wall it hit: felt more than seen.
    bumpAnimation.current = el.animate(
      { translate: ["0", `${direction * 3}px`, "0"] },
      { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  };

  const setTo = (target: number, direction: Direction) => {
    const now = latest.current;
    const next = Math.min(Math.max(target, now.min), now.max);
    // Asked for more than the limit allows, so it hit the wall.
    if (next !== target) bump(direction);
    if (next === now.value) return false;
    latest.current = { ...now, value: next };
    now.onChange(next);
    return true;
  };

  const stepBy = (delta: number) =>
    setTo(latest.current.value + delta, delta > 0 ? 1 : -1);

  const stop = () => clearTimeout(timer.current);

  const hold = (delta: number) => {
    stop();
    if (!stepBy(delta)) return;
    let interval = FIRST_REPEAT;
    const repeat = () => {
      if (!stepBy(delta)) return;
      interval = Math.max(FASTEST, interval * ACCELERATION);
      timer.current = setTimeout(repeat, interval);
    };
    timer.current = setTimeout(repeat, HOLD_DELAY);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isNaN(parsed)) return;
    setTo(parsed, parsed > value ? 1 : -1);
  };

  const button = (delta: number, atLimit: boolean, name: string, path: string) => (
    <button
      type="button"
      aria-label={`${name} ${label.toLowerCase()}`}
      aria-controls={id}
      // Stays focusable at the limit, so keyboard focus never drops to the
      // page; a press there bumps the value instead.
      aria-disabled={atLimit}
      tabIndex={-1}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Keeps focus where it was, so holding never steals it.
        e.preventDefault();
        hold(delta);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      // Pointer presses are handled above; this catches assistive tech.
      onClick={(e) => {
        if (e.detail === 0) stepBy(delta);
      }}
      className={cn(
        "flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground outline-hidden select-none",
        "transition-[scale,opacity,background-color] duration-150 ease-out hover:bg-foreground/[0.06] active:scale-[0.96] motion-reduce:transition-[opacity,background-color]",
        atLimit && "opacity-35 hover:bg-transparent",
      )}
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
        <path d={path} />
      </svg>
    </button>
  );

  const editing = draft !== null;

  return (
    // 22px radius around 4px padding keeps the 36px buttons concentric.
    <div
      className={cn(
        "inline-flex h-11 items-center rounded-full bg-surface p-1 shadow-raised outline-offset-2 outline-foreground has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-solid",
        className,
      )}
    >
      {button(-step, value <= min, "Decrease", "M3.5 8h9")}
      <span ref={valueRef} className="relative grid w-12 place-items-center">
        <input
          id={id}
          role="spinbutton"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            const delta: Record<string, number> = {
              ArrowUp: step,
              ArrowDown: -step,
              PageUp: step * 10,
              PageDown: -step * 10,
            };
            if (e.key in delta) {
              e.preventDefault();
              setDraft(null);
              stepBy(delta[e.key]);
            } else if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              setDraft(null);
              setTo(e.key === "Home" ? min : max, e.key === "Home" ? -1 : 1);
            } else if (e.key === "Enter") {
              commitDraft();
            } else if (e.key === "Escape") {
              setDraft(null);
            }
          }}
          // The text stays invisible until typing starts; the rolling copy
          // above sits exactly on it.
          className={cn(
            "col-start-1 row-start-1 w-full bg-transparent text-center text-[15px] font-medium tabular-nums caret-foreground outline-hidden max-sm:text-[16px]",
            editing ? "text-foreground" : "text-transparent",
          )}
        />
        {/* Hidden instantly once typing starts, never faded. */}
        {!editing && (
          <RollingNumber
            value={value}
            className="pointer-events-none col-start-1 row-start-1 text-[15px] max-sm:text-[16px] font-medium text-foreground"
          />
        )}
      </span>
      {button(step, value >= max, "Increase", "M3.5 8h9M8 3.5v9")}
    </div>
  );
}

const ITEMS = [
  { name: "Linen shirt", detail: "Oat, M", price: 48 },
  { name: "Canvas tote", detail: "Natural", price: 24 },
  { name: "Wool socks", detail: "Charcoal, 2 pack", price: 12.5 },
];

const money = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function NumberStepperDemo() {
  const [quantities, setQuantities] = useState([1, 2, 3]);
  const total = ITEMS.reduce((sum, item, i) => sum + item.price * quantities[i], 0);

  return (
    <div className="flex w-[min(420px,100%)] flex-col rounded-[20px] bg-surface p-2 shadow-raised">
      <ul className="flex flex-col">
        {ITEMS.map((item, i) => (
          <li
            key={item.name}
            className="flex items-center gap-3 px-3 py-2.5 not-last:border-b not-last:border-border"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-medium text-foreground">
                {item.name}
              </span>
              <span className="truncate text-sm text-muted">
                {item.detail} · {money(item.price)}
              </span>
            </div>
            <NumberStepper
              label={`${item.name} quantity`}
              value={quantities[i]}
              min={1}
              max={20}
              onChange={(next) =>
                setQuantities((q) => q.map((n, j) => (j === i ? next : n)))
              }
              className="bg-background"
            />
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between rounded-xl bg-background px-3 py-3 shadow-raised">
        <span className="text-sm text-muted">Total</span>
        <span className="text-lg font-semibold text-foreground">
          <span className="sr-only">{money(total)}</span>
          <RollingNumber value={total} format={money} />
        </span>
      </div>
    </div>
  );
}
