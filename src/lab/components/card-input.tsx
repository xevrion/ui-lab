"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

type Brand = "visa" | "mastercard" | "amex" | "discover" | "unknown";
type Field = "number" | "expiry" | "cvc" | "name";

type BrandSpec = {
  name: string;
  test: RegExp;
  // Valid lengths; the first is what the card face shows as placeholders.
  lengths: number[];
  gaps: number[];
  cvc: number;
};

const BRANDS: Record<Brand, BrandSpec> = {
  visa: { name: "Visa", test: /^4/, lengths: [16, 13, 19], gaps: [4, 8, 12, 16], cvc: 3 },
  mastercard: {
    name: "Mastercard",
    test: /^(5[1-5]|2[2-7])/,
    lengths: [16],
    gaps: [4, 8, 12],
    cvc: 3,
  },
  // Amex groups 4-6-5 and puts a 4 digit code on the front.
  amex: { name: "American Express", test: /^3[47]/, lengths: [15], gaps: [4, 10], cvc: 4 },
  discover: {
    name: "Discover",
    test: /^(6011|65|64[4-9])/,
    lengths: [16, 19],
    gaps: [4, 8, 12, 16],
    cvc: 3,
  },
  // An unrecognised prefix stops at 16, the length nearly every card has.
  // Only a network known to issue longer numbers, like Visa or Discover,
  // lets the field run on to 19, so a typo never spills past the card.
  unknown: {
    name: "Card",
    test: /^/,
    lengths: [16, 12, 13, 14, 15],
    gaps: [4, 8, 12, 16],
    cvc: 3,
  },
};
const ORDER: Brand[] = ["visa", "mastercard", "amex", "discover"];

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
// A half turn across the card's full width reads as a rush under ~400ms,
// and nobody waits on it: the caret is already in the CVC field.
const FLIP = { type: "spring", visualDuration: 0.5, bounce: 0.15 } as const;
const RING = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Long enough to read, short enough that a second check isn't blocked.
const CONFIRM_FOR = 2000;

function detect(digits: string): Brand {
  return ORDER.find((b) => BRANDS[b].test.test(digits)) ?? "unknown";
}

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function group(digits: string, gaps: number[]) {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (gaps.includes(i)) out += " ";
    out += digits[i];
  }
  return out;
}

const formatExpiry = (d: string) =>
  d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;

function caretAfterDigits(value: string, count: number) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i]) && ++seen === count) return i + 1;
  }
  return value.length;
}

// Reformats in place and puts the caret back after the same number of
// digits it was after, so editing mid-number never throws it to the end.
// Writing the DOM first means React sees an unchanged value and leaves the
// caret alone.
function reformat(
  input: HTMLInputElement,
  max: number,
  format: (digits: string) => string,
  pad?: (digits: string) => string,
) {
  const caret = input.selectionStart ?? input.value.length;
  let before = input.value.slice(0, caret).replace(/\D/g, "").length;
  let digits = input.value.replace(/\D/g, "").slice(0, max);
  if (pad) {
    const padded = pad(digits);
    before += padded.length - digits.length;
    digits = padded;
  }
  const value = format(digits);
  input.value = value;
  if (document.activeElement === input) {
    const at = caretAfterDigits(value, Math.min(before, digits.length));
    input.setSelectionRange(at, at);
  }
  return { digits, value };
}

// Backspace right after a space or slash would delete the separator, which
// reformatting puts straight back, leaving the caret stuck. Step over it so
// the digit before goes instead.
function skipSeparator(e: React.KeyboardEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  const at = el.selectionStart;
  if (at === null || at !== el.selectionEnd) return;
  if (e.key === "Backspace" && at > 0 && /\D/.test(el.value[at - 1]))
    el.setSelectionRange(at - 1, at - 1);
  if (e.key === "Delete" && at < el.value.length && /\D/.test(el.value[at]))
    el.setSelectionRange(at + 1, at + 1);
}

type Values = Record<Field, string>;

function validate(field: Field, values: Values, brand: Brand, final: boolean) {
  const spec = BRANDS[brand];
  const value = values[field];
  const digits = value.replace(/\D/g, "");
  // Tabbing past an empty field isn't a mistake; only a full check flags it.
  if (!value.trim()) return final ? "Required" : null;
  if (field === "number") {
    if (!spec.lengths.includes(digits.length)) return "Too short";
    if (!luhn(digits)) return "Not a valid number";
  }
  if (field === "expiry") {
    if (digits.length < 4) return "Use MM/YY";
    const month = Number(digits.slice(0, 2));
    if (month < 1 || month > 12) return "Invalid month";
    const now = new Date();
    const year = 2000 + Number(digits.slice(2));
    // Cards stay valid through the last day of their expiry month.
    if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1))
      return "Card expired";
  }
  if (field === "cvc" && digits.length < spec.cvc) return "Too short";
  return null;
}

export function CardInput({
  onValid,
  className,
}: {
  onValid?: (card: { brand: Brand; last4: string; expiry: string; name: string }) => void;
  className?: string;
}) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const [values, setValues] = useState<Values>({ number: "", expiry: "", cvc: "", name: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [focused, setFocused] = useState<Field | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const digits = values.number.replace(/\D/g, "");
  const brand = detect(digits);
  const spec = BRANDS[brand];

  const set = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    // Typing is the fix, so the error goes at once rather than fading.
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
    setConfirmed(false);
  };

  const blur = (field: Field) => {
    setFocused((f) => (f === field ? null : f));
    const error = validate(field, values, brand, false);
    setErrors((e) => ({ ...e, [field]: error ?? undefined }));
  };

  const check = () => {
    const fields: Field[] = ["number", "expiry", "cvc", "name"];
    const next: Partial<Record<Field, string>> = {};
    for (const f of fields) next[f] = validate(f, values, brand, true) ?? undefined;
    setErrors(next);
    const firstBad = fields.find((f) => next[f]);
    if (firstBad) {
      document.getElementById(`${id}-${firstBad}`)?.focus();
      return;
    }
    setConfirmed(true);
    onValid?.({ brand, last4: digits.slice(-4), expiry: values.expiry, name: values.name.trim() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirmed(false), CONFIRM_FOR);
  };

  const inputProps = (field: Field) => ({
    id: `${id}-${field}`,
    value: values[field],
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `${id}-${field}-error` : undefined,
    onFocus: () => setFocused(field),
    onBlur: () => blur(field),
    className: cn(
      "h-11 w-full rounded-xl border bg-background px-3.5 text-[15px] text-foreground tabular-nums outline-hidden transition-[border-color] duration-150 ease-out placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 max-sm:text-[16px]",
      errors[field]
        ? "border-danger focus-visible:outline-danger"
        : "border-border focus-visible:outline-foreground",
    ),
  });

  return (
    <form
      noValidate
      aria-label="Card details"
      onSubmit={(e) => {
        e.preventDefault();
        check();
      }}
      className={cn("flex w-[min(400px,100%)] flex-col gap-5", className)}
    >
      <CardPreview
        values={values}
        brand={brand}
        focused={focused}
        reduceMotion={Boolean(reduceMotion)}
      />

      <div className="flex flex-col gap-4">
        <FieldShell id={`${id}-number`} label="Card number" error={errors.number}>
          <div className="relative">
            <input
              {...inputProps("number")}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              className={cn(inputProps("number").className, "pr-16 font-mono")}
              onKeyDown={skipSeparator}
              onChange={(e) => {
                const raw = e.currentTarget.value.replace(/\D/g, "");
                const next = BRANDS[detect(raw)];
                const { value, digits: d } = reformat(
                  e.currentTarget,
                  Math.max(...next.lengths),
                  (x) => group(x, next.gaps),
                );
                set("number", value);
                // A shorter code is required once the brand changes away from Amex.
                const cvcMax = BRANDS[detect(d)].cvc;
                if (values.cvc.length > cvcMax) set("cvc", values.cvc.slice(0, cvcMax));
              }}
            />
            <span
              className={cn(
                "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 transition-[color] duration-150 ease-out",
                brand === "unknown" ? "text-muted" : "text-foreground",
              )}
            >
              <BrandMark brand={brand} reduceMotion={Boolean(reduceMotion)} />
            </span>
          </div>
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell id={`${id}-expiry`} label="Expiry" error={errors.expiry}>
            <input
              {...inputProps("expiry")}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              className={cn(inputProps("expiry").className, "font-mono")}
              onKeyDown={skipSeparator}
              onChange={(e) => {
                const { value } = reformat(e.currentTarget, 4, formatExpiry, (d) =>
                  // A first digit of 2 to 9 can only be a single digit month.
                  /^[2-9]/.test(d) ? `0${d}`.slice(0, 4) : d,
                );
                set("expiry", value);
              }}
            />
          </FieldShell>
          <FieldShell id={`${id}-cvc`} label="CVC" error={errors.cvc}>
            <input
              {...inputProps("cvc")}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder={brand === "amex" ? "1234" : "123"}
              className={cn(inputProps("cvc").className, "font-mono")}
              onChange={(e) => {
                const { value } = reformat(e.currentTarget, spec.cvc, (d) => d);
                set("cvc", value);
              }}
            />
          </FieldShell>
        </div>

        <FieldShell id={`${id}-name`} label="Name on card" error={errors.name}>
          <input
            {...inputProps("name")}
            autoComplete="cc-name"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Ada Lovelace"
            maxLength={40}
            onChange={(e) => set("name", e.currentTarget.value)}
          />
        </FieldShell>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="submit"
          className="relative h-11 touch-manipulation rounded-xl bg-foreground text-[15px] font-medium text-background outline-hidden transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
        >
          {/* Both labels share one cell so the button never changes size. */}
          <span className="grid">
            <ButtonLabel visible={!confirmed} reduceMotion={Boolean(reduceMotion)}>
              Check details
            </ButtonLabel>
            <ButtonLabel
              visible={confirmed}
              reduceMotion={Boolean(reduceMotion)}
              icon={<path d="m3.5 8.5 3 3 6-7" />}
            >
              Details look valid
            </ButtonLabel>
          </span>
        </button>
        <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted">
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" {...STROKE} aria-hidden>
            <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          Demo only. Nothing is charged or sent anywhere.
        </p>
        <span className="sr-only" aria-live="polite">
          {confirmed ? "Card details look valid" : ""}
        </span>
        <span className="sr-only" aria-live="polite">
          {brand === "unknown" ? "" : `${spec.name} card`}
        </span>
      </div>
    </form>
  );
}

function FieldShell({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* The error shares the label's row, so showing it never shifts the
          fields below. */}
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground select-none">
          {label}
        </label>
        {error && (
          <span
            key={error}
            id={`${id}-error`}
            className="truncate text-[13px] text-danger transition-[opacity,filter,translate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:translate-y-0.5 motion-safe:starting:blur-[4px]"
          >
            {error}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function CardPreview({
  values,
  brand,
  focused,
  reduceMotion,
}: {
  values: Values;
  brand: Brand;
  focused: Field | null;
  reduceMotion: boolean;
}) {
  const spec = BRANDS[brand];
  const digits = values.number.replace(/\D/g, "");
  const flipped = focused === "cvc";
  const length = Math.max(spec.lengths[0], digits.length);
  const slots = Array.from({ length }, (_, i) => digits[i] ?? "•");

  // The focus ring is measured with offset* values, which ignore the flip's
  // transform, and driven by motion values so moving it never re-renders.
  const regions = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const opacity = useMotionValue(0);

  useLayoutEffect(() => {
    const el = focused && focused !== "cvc" ? regions.current[focused] : null;
    if (!el) {
      const fade = animate(opacity, 0, { duration: 0.12, ease: "easeOut" });
      return () => fade.stop();
    }
    // 8px and 6px of breathing room around the text it frames.
    const target = [el.offsetLeft - 8, el.offsetTop - 6, el.offsetWidth + 16, el.offsetHeight + 12];
    const box = [x, y, width, height];
    // Coming from nowhere it appears in place; only a move between fields slides.
    if (opacity.get() === 0 || reduceMotion) {
      box.forEach((v, i) => v.jump(target[i]));
      const fade = animate(opacity, 1, { duration: 0.2, ease: "easeOut" });
      return () => fade.stop();
    }
    const runs = box.map((v, i) => animate(v, target[i], RING));
    return () => runs.forEach((r) => r.stop());
  }, [focused, reduceMotion, x, y, width, height, opacity]);

  const face =
    "absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-foreground text-background shadow-raised backface-hidden";

  return (
    <div aria-hidden className="relative aspect-[1.586] w-full [perspective:1200px] select-none">
      <motion.div
        className="relative size-full transform-3d"
        initial={false}
        animate={{ rotateY: flipped && !reduceMotion ? 180 : 0 }}
        transition={FLIP}
      >
        <div
          className={cn(
            face,
            "justify-between p-6 transition-[opacity] duration-200 ease-out",
            reduceMotion && flipped && "opacity-0",
          )}
        >
          <motion.span
            className="pointer-events-none absolute top-0 left-0 rounded-lg border border-background/35"
            style={{ x, y, width, height, opacity }}
          />
          <div className="flex items-start justify-between">
            <Chip />
            <BrandMark brand={brand} reduceMotion={reduceMotion} large />
          </div>
          <div
            ref={(el) => {
              regions.current.number = el;
            }}
            className="self-start font-mono text-[clamp(16px,5.2vw,21px)] tracking-wide whitespace-nowrap"
          >
            {slots.map((c, i) => (
              <span
                // Keyed by content, so each new digit mounts and fades in
                // through @starting-style with no JS.
                key={`${i}-${c}`}
                className={cn(
                  "inline-block transition-[opacity,translate,filter] duration-150 ease-out starting:opacity-0 motion-safe:starting:-translate-y-1 motion-safe:starting:blur-[2px]",
                  spec.gaps.includes(i) && "ml-[0.6em]",
                  c === "•" && "opacity-45",
                )}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="flex items-end justify-between gap-6">
            <div
              ref={(el) => {
                regions.current.name = el;
              }}
              className="flex min-w-0 flex-1 flex-col gap-1"
            >
              <span className="text-xs tracking-wide uppercase opacity-60">Card holder</span>
              <span className="truncate text-[15px] font-medium uppercase">
                {values.name.trim() || "Your name"}
              </span>
            </div>
            <div
              ref={(el) => {
                regions.current.expiry = el;
              }}
              className="flex shrink-0 flex-col gap-1"
            >
              <span className="text-xs tracking-wide uppercase opacity-60">Expires</span>
              <span className="font-mono text-[15px] font-medium">
                {values.expiry || "MM/YY"}
              </span>
            </div>
          </div>
        </div>

        <div
          className={cn(
            face,
            "transition-[opacity] duration-200 ease-out",
            reduceMotion ? (flipped ? "opacity-100" : "opacity-0") : "[transform:rotateY(180deg)]",
          )}
        >
          <div className="mt-6 h-11 bg-background/15" />
          <div className="flex items-center gap-3 px-6 pt-5">
            <div className="flex h-10 flex-1 items-center justify-end rounded-md bg-background px-3 font-mono text-[15px] text-foreground italic">
              {values.cvc || (brand === "amex" ? "••••" : "•••")}
            </div>
            <span className="text-xs tracking-wide uppercase opacity-60">CVC</span>
          </div>
          <p className="mt-auto px-6 pb-5 text-xs opacity-60">
            Not a real card. Nothing you type leaves this page.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Chip() {
  return (
    <svg viewBox="0 0 44 32" className="h-8 w-11" fill="none" aria-hidden>
      <rect width="44" height="32" rx="6" fill="currentColor" opacity="0.22" />
      <path
        d="M0 11h14m16 0h14M0 21h14m16 0h14M14 0v32M30 0v32M14 16h16"
        stroke="currentColor"
        strokeOpacity="0.3"
      />
    </svg>
  );
}

// Monochrome marks in currentColor, so they take the theme instead of
// fighting it.
function BrandMark({
  brand,
  reduceMotion,
  large,
}: {
  brand: Brand;
  reduceMotion: boolean;
  large?: boolean;
}) {
  return (
    <span className={cn("grid", large ? "h-8 w-12" : "h-6 w-9")}>
      {(["unknown", ...ORDER] as Brand[]).map((b) => (
        <SwapIcon key={b} visible={b === brand} reduceMotion={reduceMotion}>
          {MARKS[b]}
        </SwapIcon>
      ))}
    </span>
  );
}

const MARKS: Record<Brand, React.ReactNode> = {
  unknown: (
    <g {...STROKE}>
      <rect x="6.75" y="4.75" width="22.5" height="14.5" rx="2.5" />
      <path d="M6.75 9.25h22.5M10.5 15.5h4" />
    </g>
  ),
  visa: (
    <text
      x="18"
      y="16.5"
      textAnchor="middle"
      fontSize="12.5"
      fontWeight="800"
      fontStyle="italic"
      letterSpacing="-0.3"
      fill="currentColor"
    >
      VISA
    </text>
  ),
  mastercard: (
    <g fill="currentColor">
      <circle cx="14" cy="12" r="7" opacity="0.55" />
      <circle cx="22" cy="12" r="7" opacity="0.9" />
    </g>
  ),
  amex: (
    <g>
      <rect x="3.75" y="4.75" width="28.5" height="14.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="18" y="15.25" textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing="0.4" fill="currentColor">
        AMEX
      </text>
    </g>
  ),
  discover: (
    <g fill="currentColor">
      <text x="15" y="15" textAnchor="middle" fontSize="7.5" fontWeight="700" letterSpacing="0.2">
        DISC
      </text>
      <circle cx="28.5" cy="12.25" r="3.5" />
    </g>
  ),
};

function SwapIcon({
  visible,
  reduceMotion,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
  return (
    <motion.svg
      viewBox="0 0 36 24"
      className="col-start-1 row-start-1 size-full"
      aria-hidden
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
    >
      {children}
    </motion.svg>
  );
}

function ButtonLabel({
  visible,
  reduceMotion,
  icon,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hidden = reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" };
  return (
    <span
      aria-hidden={!visible}
      className="col-start-1 row-start-1 flex items-center justify-center gap-2"
    >
      {icon && (
        <motion.svg
          viewBox="0 0 16 16"
          className="size-4 shrink-0"
          {...STROKE}
          strokeWidth={2}
          initial={false}
          animate={
            visible
              ? { scale: 1, opacity: 1, filter: "blur(0px)" }
              : reduceMotion
                ? { opacity: 0 }
                : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
          }
          transition={ICON_SWAP}
        >
          {icon}
        </motion.svg>
      )}
      <motion.span
        initial={false}
        animate={visible ? { opacity: 1, filter: "blur(0px)" } : hidden}
        transition={ICON_SWAP}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function CardInputDemo() {
  return <CardInput />;
}
