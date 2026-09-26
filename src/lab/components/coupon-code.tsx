"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type LineItem = {
  name: string;
  detail: string;
  price: number;
  // The product's own color, shown as a swatch. It is data, not theme.
  swatch?: string;
  // A small product drawing laid over the swatch, in its color.
  thumb?: ReactNode;
};

export type PromoCode = {
  code: string;
  kind: "percent" | "shipping";
  // Percent off the subtotal, for "percent" codes.
  percent?: number;
  // Shown under the field once applied.
  blurb: string;
  // A code that used to work gets a date, so the message can say when.
  expired?: string;
  // What to try instead, appended to the expired message.
  instead?: string;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// The rubber stamp lands with a little thud: a quick overshoot sells the
// weight of it without reading as a toy.
const STAMP = { type: "spring", visualDuration: 0.3, bounce: 0.35 } as const;
const LEAVE = { duration: 0.15, ease: EASE_OUT } as const;
// Rows below the new one have to make room, which only height can do.
const ROW = { duration: 0.26, ease: EASE_OUT } as const;
// A real lookup is a network trip. A short pending beat keeps the answer
// from feeling canned, and is long enough to see the spinner.
const CHECK_MS = 450;

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value,
  );
}

// One column of 0 to 9 per digit, keyed from the right so the ones stay
// the ones when the number gets shorter. Moving the column is what makes the
// value roll: down for a smaller digit, up for a bigger one.
function Roll({ text }: { text: string }) {
  const chars = [...text];
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {chars.map((char, i) => {
        const place = chars.length - i;
        if (!/\d/.test(char)) {
          return (
            <span key={`s${place}`} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={`d${place}`}
            // Fades the neighbours peeking in above and below mid-roll; at
            // rest the digit sits inside the clear middle.
            className="relative inline-block h-[1lh] overflow-hidden [mask-image:linear-gradient(transparent,black_20%,black_80%,transparent)]"
          >
            <span
              // Values glide rather than snap, and the eye has to follow every
              // column, so this runs longer than a UI transition.
              className="flex flex-col transition-[translate] duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{ translate: `0 ${-Number(char) * 10}%` }}
            >
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className="h-[1lh]">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// The old value stays readable under a line that draws across it, so you
// can see exactly what the code changed.
function Struck({
  from,
  to,
  struck,
}: {
  from: string;
  to: string;
  struck: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="flex items-baseline justify-end gap-2">
      <motion.span
        layout="position"
        transition={{ type: "spring", visualDuration: 0.26, bounce: 0 }}
        className={cn(
          "relative tabular-nums transition-[color] duration-200 ease-out",
          struck ? "text-muted" : "text-foreground",
        )}
      >
        {from}
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 -right-0.5 -left-0.5 h-[1.5px] origin-left bg-current transition-[scale] ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none",
            // Drawn after the stamp lands; erased first on the way back.
            struck
              ? "scale-x-100 delay-150 duration-300"
              : "scale-x-0 duration-200",
          )}
        />
      </motion.span>
      <AnimatePresence mode="popLayout" initial={false}>
        {struck && (
          <motion.span
            key="to"
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, x: 4, filter: "blur(4px)" }
            }
            animate={{
              opacity: 1,
              x: 0,
              filter: "blur(0px)",
              transition: { duration: 0.25, ease: EASE_OUT, delay: 0.3 },
            }}
            exit={{ opacity: 0, filter: "blur(2px)", transition: LEAVE }}
            className="font-medium tabular-nums text-foreground"
          >
            {to}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 animate-spin motion-reduce:animate-none"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CouponCode({
  items,
  shipping,
  codes,
  currency = "USD",
  onApply,
  className,
}: {
  items: LineItem[];
  shipping: number;
  codes: PromoCode[];
  currency?: string;
  onApply?: (code: PromoCode | null) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState<PromoCode | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const shake = useRef<Animation | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  // Focus follows the swap between field and tag, once the new one exists.
  const focusNext = useRef<"input" | "remove" | null>(null);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
      shake.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (focusNext.current === "remove") removeRef.current?.focus();
    if (focusNext.current === "input") inputRef.current?.focus();
    focusNext.current = null;
  }, [applied]);

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const discountFor = (code: PromoCode) =>
    code.kind === "percent"
      ? Math.round(subtotal * (code.percent ?? 0)) / 100
      : shipping;
  const saved = applied ? discountFor(applied) : 0;
  const total = subtotal + shipping - saved;
  const shown = (value: number) => money(value, currency);

  const reject = (message: string) => {
    setError(message);
    setAnnouncement(message);
    const el = fieldRef.current;
    if (!el) return;
    shake.current?.cancel();
    // A decaying 5px shake says "no" without the field lurching away.
    shake.current = reduceMotion
      ? null
      : el.animate(
          { translate: ["0", "-5px", "5px", "-3px", "2px", "0"] },
          { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
  };

  const apply = () => {
    if (checking) return;
    const code = draft.trim().toUpperCase();
    if (!code) {
      reject("Enter a code first.");
      inputRef.current?.focus();
      return;
    }
    setChecking(true);
    setError("");
    timer.current = window.setTimeout(() => {
      setChecking(false);
      const match = codes.find((c) => c.code === code);
      if (!match) {
        reject(
          `There is no code called ${code}. Check the email it came in for the exact spelling.`,
        );
        return;
      }
      if (match.expired) {
        reject(
          `${match.code} expired on ${match.expired}.${match.instead ? ` ${match.instead}` : ""}`,
        );
        return;
      }
      focusNext.current = "remove";
      setApplied(match);
      // The thud: as the stamp lands (the spring reaches its low point near
      // 110ms) the whole card gives by a pixel and a half, then recovers.
      if (!reduceMotion) {
        shake.current?.cancel();
        shake.current =
          cardRef.current?.animate(
            { translate: ["0 0", "0 1.5px", "0 0"] },
            {
              duration: 200,
              delay: 110,
              easing: "cubic-bezier(0.23, 1, 0.32, 1)",
            },
          ) ?? null;
      }
      onApply?.(match);
      const off = discountFor(match);
      setAnnouncement(
        `${match.code} applied. You save ${shown(off)}. New total ${shown(subtotal + shipping - off)}.`,
      );
    }, CHECK_MS);
  };

  const remove = () => {
    if (!applied) return;
    focusNext.current = "input";
    setAnnouncement(
      `${applied.code} removed. Total ${shown(subtotal + shipping)}.`,
    );
    setApplied(null);
    setDraft("");
    onApply?.(null);
  };

  return (
    <section
      ref={cardRef}
      aria-labelledby={`${id}-title`}
      className={cn(
        "w-[min(420px,100%)] rounded-[20px] bg-background p-5 shadow-raised",
        className,
      )}
    >
      <div className="flex items-baseline justify-between">
        <h2
          id={`${id}-title`}
          className="text-[15px] font-semibold text-foreground"
        >
          Order summary
        </h2>
        <span className="text-[13px] text-muted">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.name} className="flex items-center gap-3">
            <span
              aria-hidden
              // The same faint outline images get, so a pale swatch still
              // has an edge on a white card.
              className={cn(
                "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]",
                item.thumb && "bg-surface",
              )}
              style={
                item.thumb
                  ? { color: item.swatch }
                  : { background: item.swatch }
              }
            >
              {item.thumb}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {item.name}
              </span>
              <span className="truncate text-[13px] text-muted">
                {item.detail}
              </span>
            </span>
            <span className="text-sm tabular-nums text-foreground">
              {shown(item.price)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-border pt-4">
        <label
          htmlFor={`${id}-code`}
          className="text-[13px] font-medium text-foreground"
        >
          Promo code
        </label>
        {/* Field and tag share one 40px slot, so nothing below them moves
            when one becomes the other. */}
        <div className="relative mt-2 h-10">
          <AnimatePresence initial={false}>
            {applied ? (
              <motion.div
                key="tag"
                className="absolute inset-0 flex items-center justify-between pl-1"
                exit={{ opacity: 0, filter: "blur(2px)", transition: LEAVE }}
              >
                <motion.span
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 1.35, rotate: -9 }
                  }
                  animate={{ opacity: 1, scale: 1, rotate: -2 }}
                  transition={STAMP}
                  // A rubber stamp: a double rule in ink, the code in spaced
                  // capitals, set down slightly crooked.
                  className="flex h-8 items-center gap-1.5 rounded-md px-3 font-mono text-[13px] font-semibold tracking-[0.14em] text-foreground shadow-[inset_0_0_0_1.5px_var(--color-foreground),inset_0_0_0_3.5px_var(--color-background),inset_0_0_0_4.5px_var(--color-foreground)]"
                  // Ink never takes evenly: two offset grids of pinholes
                  // knock small gaps out of the rules and letters.
                  style={{
                    maskImage:
                      "radial-gradient(circle at 30% 40%, transparent 0.7px, black 1.2px), radial-gradient(circle at 70% 60%, transparent 0.5px, black 1px)",
                    maskSize: "9px 7px, 13px 11px",
                    maskComposite: "intersect",
                  }}
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                  {applied.code}
                </motion.span>
                <button
                  ref={removeRef}
                  type="button"
                  onClick={remove}
                  aria-label={`Remove code ${applied.code}`}
                  className="h-9 rounded-lg px-3 text-[13px] text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
                >
                  Remove
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="field"
                ref={fieldRef}
                className="absolute inset-0 flex gap-2"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)", transition: LEAVE }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                <input
                  ref={inputRef}
                  id={`${id}-code`}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (error) setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      apply();
                    }
                  }}
                  placeholder="Enter code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  enterKeyHint="done"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-note`}
                  className={cn(
                    "h-10 min-w-0 flex-1 rounded-[10px] bg-surface px-3 font-mono text-sm tracking-[0.06em] text-foreground uppercase outline-hidden transition-[box-shadow] duration-150 ease-out placeholder:font-sans placeholder:tracking-normal placeholder:text-muted placeholder:normal-case focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground max-sm:text-[16px]",
                    error && "shadow-[inset_0_0_0_1px_var(--color-danger)]",
                  )}
                />
                <button
                  type="button"
                  onClick={apply}
                  aria-busy={checking || undefined}
                  className="relative flex h-10 w-[76px] shrink-0 items-center justify-center rounded-[10px] bg-foreground text-sm font-medium text-background outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
                >
                  <span
                    className={cn(
                      "transition-[opacity,filter] duration-150 ease-out",
                      checking ? "opacity-0 blur-[2px]" : "opacity-100",
                    )}
                  >
                    Apply
                  </span>
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center justify-center transition-[opacity] duration-150 ease-out",
                      checking ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <Spinner />
                  </span>
                  <span className="sr-only">
                    {checking ? "Checking code" : ""}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Two lines tall, so the longest message fits without the totals
            below jumping when it appears. */}
        <p
          id={`${id}-note`}
          className={cn(
            "mt-2 min-h-10 text-[13px] leading-5",
            error ? "text-danger" : "text-muted",
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={error || applied?.code || "hint"}
              className="block"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -2, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              {error || applied?.blurb || "Codes are not case sensitive."}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>

      <dl className="mt-1 flex flex-col border-t border-border pt-3 text-sm">
        <div className="flex h-7 items-center justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd>
            <Struck
              from={shown(subtotal)}
              to={applied ? shown(subtotal - saved) : shown(subtotal)}
              struck={applied?.kind === "percent"}
            />
          </dd>
        </div>
        <div className="flex h-7 items-center justify-between">
          <dt className="text-muted">Shipping</dt>
          <dd>
            <Struck
              from={shown(shipping)}
              to="Free"
              struck={applied?.kind === "shipping"}
            />
          </dd>
        </div>
        {/* Grows downward, below everything you might have clicked. */}
        <AnimatePresence initial={false}>
          {applied && (
            <motion.div
              key="saving"
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: 28,
                opacity: 1,
                transition: { ...ROW, delay: 0.1 },
              }}
              exit={{
                height: 0,
                opacity: 0,
                transition: { duration: 0.2, ease: EASE_OUT },
              }}
              className="overflow-hidden"
            >
              <motion.div
                initial={reduceMotion ? false : { y: -6, filter: "blur(4px)" }}
                animate={{ y: 0, filter: "blur(0px)" }}
                transition={{ ...ROW, delay: 0.1 }}
                className="flex h-7 items-center justify-between"
              >
                <dt className="text-muted">You save</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {shown(saved)}
                </dd>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
          <dt className="text-[15px] font-semibold text-foreground">Total</dt>
          <dd className="text-lg font-semibold text-foreground">
            <Roll text={shown(total)} />
            <span className="sr-only">{shown(total)}</span>
          </dd>
        </div>
      </dl>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}

// Product drawings in the dye color (currentColor), with a faint darker
// outline so a pale fabric still has an edge.
const SHIRT = (
  <svg viewBox="0 0 48 48" aria-hidden className="size-10">
    <path
      d="M18 9 l-9 4 -5 10 6 3 3-5 v20 h22 v-20 l3 5 6-3 -5-10 -9-4 c-1 3-3.5 4.5-6 4.5 s-5-1.5-6-4.5 Z"
      fill="currentColor"
      stroke="oklch(0 0 0 / 0.18)"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path
      d="M24 13.5 v23.5 M21 18 h6"
      stroke="oklch(0 0 0 / 0.15)"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);
const TOTE = (
  <svg viewBox="0 0 48 48" aria-hidden className="size-10">
    <path
      d="M17 17 v-3 a7 7 0 0 1 14 0 v3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M11 17 h26 l-2 24 h-22 Z"
      fill="currentColor"
      stroke="oklch(0 0 0 / 0.2)"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path d="M12.5 22 h23" stroke="oklch(1 0 0 / 0.18)" strokeWidth="1" />
  </svg>
);

const ITEMS: LineItem[] = [
  // Swatches are the products' dye colors: data, the same in both themes.
  {
    name: "Linen overshirt",
    detail: "Sand, size M",
    price: 68,
    swatch: "#d9c9a8",
    thumb: SHIRT,
  },
  {
    name: "Waxed canvas tote",
    detail: "Olive",
    price: 24,
    swatch: "#6b705c",
    thumb: TOTE,
  },
];

const CODES: PromoCode[] = [
  {
    code: "WELCOME10",
    kind: "percent",
    percent: 10,
    blurb: "10% off your first order.",
  },
  { code: "FREESHIP", kind: "shipping", blurb: "Shipping is on us." },
  {
    code: "SUMMER20",
    kind: "percent",
    percent: 20,
    blurb: "20% off summer styles.",
    expired: "Aug 31",
    instead: "WELCOME10 still takes 10% off.",
  },
];

export default function CouponCodeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <CouponCode items={ITEMS} shipping={6} codes={CODES} />
      <p className="text-[13px] text-muted">
        Try <span className="font-mono text-foreground">WELCOME10</span>,{" "}
        <span className="font-mono text-foreground">FREESHIP</span> or{" "}
        <span className="font-mono text-foreground">SUMMER20</span>
      </p>
    </div>
  );
}
