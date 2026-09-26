"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// The domains people actually sign up with, most common first so a tie in
// distance goes to the likelier one.
const COMMON = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "live.com",
  "msn.com",
  "proton.me",
  "protonmail.com",
  "me.com",
  "mac.com",
  "googlemail.com",
  "yandex.com",
  "gmx.com",
  "hey.com",
  "fastmail.com",
  "zoho.com",
  "comcast.net",
  "yahoo.co.uk",
  "hotmail.co.uk",
];

// Real domains that sit one letter from a common one. Never "correct" them.
const KNOWN = new Set([
  ...COMMON,
  "ymail.com",
  "mail.com",
  "email.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "live.co.uk",
  "pm.me",
  "hey.co",
]);

// Endings that are almost always a slipped .com, .net or .org.
const TLD_SLIPS: Record<string, string> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  comm: "com",
  cpm: "com",
  cim: "com",
  nte: "net",
  ent: "net",
  ner: "net",
  ogr: "org",
  rog: "org",
  orh: "org",
};

const VALID = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Optimal string alignment: Levenshtein plus swapped neighbours, so
// "hotmial" is one slip from "hotmail", not two.
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (domain.length < 4 || !domain.includes(".") || KNOWN.has(domain)) {
    return null;
  }
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of COMMON) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  // Two slips are only believable in a long name; "me.co" is not "mac.com".
  if (best && bestDistance <= (best.length >= 9 ? 2 : 1)) {
    return `${local}@${best}`;
  }
  const dot = domain.lastIndexOf(".");
  const fix = TLD_SLIPS[domain.slice(dot + 1)];
  return fix ? `${local}@${domain.slice(0, dot)}.${fix}` : null;
}

type Glyph = { key: string; char: string; kind: "keep" | "move" | "new" };

// How the old text becomes the new: letters in the longest common run stay
// put, a letter that only changed places slides to its new spot, and the
// rest flip out or in. Keys carry identity across the two renders.
function morphPlan(from: string, to: string) {
  const n = from.length;
  const m = to.length;
  const lcs = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        from[i] === to[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const kept = new Map<number, number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (from[i] === to[j]) kept.set(j++, i++);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  const used = new Set(kept.values());
  const before: Glyph[] = [...from].map((char, i) => ({
    key: `k${i}`,
    char,
    kind: "keep",
  }));
  const after: Glyph[] = [...to].map((char, j) => {
    const i = kept.get(j);
    if (i !== undefined) return { key: `k${i}`, char, kind: "keep" };
    const spare = [...from].findIndex((c, k) => c === char && !used.has(k));
    if (spare >= 0) {
      used.add(spare);
      return { key: `k${spare}`, char, kind: "move" };
    }
    return { key: `n${j}`, char, kind: "new" };
  });
  return { before, after };
}

// range: the fixed stretch of the new address, underlined as it lands.
type Morph = {
  from: string;
  to: string;
  stage: 0 | 1;
  range: [number, number];
};

// The letters land by ~600ms (up to four flips, 40ms apart); the underline
// under the fixed letters then lingers and fades, ending at 1300ms, so you
// can see what changed after the motion stops.
const MORPH_MS = 1300;

export function EmailTypoFix({
  value: controlled,
  onValueChange,
  onSubmit,
  label = "Work email",
  hint = "We will send a sign-in link here.",
  submitLabel = "Create account",
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (email: string) => void;
  label?: string;
  hint?: string;
  submitLabel?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [own, setOwn] = useState("");
  const value = controlled ?? own;
  const setValue = (next: string) => {
    if (controlled === undefined) setOwn(next);
    onValueChange?.(next);
  };
  // The last value we looked at for typos. Typing moves ahead of it, so a
  // half typed "gmail.co" is never flagged mid-word.
  // Starts equal to the value, so an address handed in pre-filled (a
  // paste, autofill, a saved draft) is checked on the first render.
  const [checked, setChecked] = useState(value);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [morph, setMorph] = useState<Morph | null>(null);
  const [sent, setSent] = useState("");
  const [previous, setPrevious] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  // A paste or autofill lands several letters at once: check it right away.
  // A keystroke extends or trims the old value; anything else (a paste, a
  // replaced domain) is a whole new address.
  if (previous !== value) {
    setPrevious(value);
    const keystroke =
      Math.abs(value.length - previous.length) <= 1 &&
      (value.startsWith(previous) || previous.startsWith(value));
    if (!keystroke) setChecked(value);
    // Replaced from outside mid-morph: drop the overlay so it never paints
    // letters of an address that is no longer there.
    if (morph && value !== morph.to) setMorph(null);
  }

  useEffect(() => {
    if (checked === value) return;
    // A pause in typing reads as "done with this bit".
    const t = window.setTimeout(() => setChecked(value), 900);
    return () => window.clearTimeout(t);
  }, [value, checked]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const suggestion =
    checked === value && !dismissed.includes(value.toLowerCase())
      ? suggestEmail(value.trim())
      : null;
  const valid = VALID.test(value.trim());

  const accept = () => {
    if (!suggestion) return;
    const input = inputRef.current;
    const from = value.trim();
    // Morph only when the whole address is visible; a scrolled field would
    // put the overlay's letters in the wrong place.
    const fits = input ? input.scrollWidth <= input.clientWidth : false;
    setValue(suggestion);
    setChecked(suggestion);
    if (!reduceMotion && fits) {
      setMorph({ from, to: suggestion, stage: 0, range: [fix.start, fix.end] });
      // Two frames: the overlay first paints the old text exactly over the
      // field's, then the letters move.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setMorph((m) => (m ? { ...m, stage: 1 } : m)),
        ),
      );
      timers.current.push(window.setTimeout(() => setMorph(null), MORPH_MS));
    }
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(suggestion.length, suggestion.length);
    });
  };

  const morphGlyphs = morph
    ? morph.stage === 0
      ? morphPlan(morph.from, morph.to).before
      : morphPlan(morph.from, morph.to).after
    : [];
  let changed = 0;

  // The stretch of the suggestion that differs, trimmed of the shared start
  // and end, so a swap underlines both letters rather than one.
  const fix = { start: 0, end: 0 };
  if (suggestion) {
    const from = value.trim();
    while (
      fix.start < Math.min(from.length, suggestion.length) &&
      from[fix.start] === suggestion[fix.start]
    ) {
      fix.start++;
    }
    let tail = 0;
    while (
      tail < Math.min(from.length, suggestion.length) - fix.start &&
      from[from.length - 1 - tail] === suggestion[suggestion.length - 1 - tail]
    ) {
      tail++;
    }
    fix.end = Math.max(fix.start + 1, suggestion.length - tail);
  }

  return (
    <form
      noValidate
      className={cn(
        "flex w-[min(400px,100%)] flex-col rounded-[20px] bg-background p-6 shadow-raised",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setSent(value.trim());
        onSubmit?.(value.trim());
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">
        Start your free trial
      </h2>
      <p className="mt-1 text-sm text-muted">
        14 days of everything. No card needed.
      </p>

      <label htmlFor={id} className="mt-5 text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          ref={inputRef}
          id={id}
          // Text, not email: email inputs refuse setSelectionRange, and the
          // caret has to land at the end after a fix.
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@company.com"
          value={value}
          aria-describedby={`${id}-note`}
          onChange={(e) => {
            setMorph(null);
            setSent("");
            setValue(e.target.value);
          }}
          onBlur={() => setChecked(value)}
          className={cn(
            // Kerning and ligatures off, here and in the overlay, so letters
            // set one span at a time land exactly where the field draws them.
            "h-11 w-full rounded-[10px] bg-surface px-3.5 text-[15px] text-foreground outline-hidden [font-kerning:none] [font-variant-ligatures:none] placeholder:text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground max-sm:text-[16px]",
            morph && "text-transparent caret-transparent",
          )}
        />
        {morph && (
          <LayoutGroup id={`${id}-morph`}>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center px-3.5 text-[15px] max-sm:text-[16px] whitespace-pre text-foreground [font-kerning:none] [font-variant-ligatures:none]"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {morphGlyphs.map((glyph, index) => {
                  const order = glyph.kind === "keep" ? 0 : changed++;
                  return (
                    <motion.span
                      key={glyph.key}
                      layout="position"
                      className="relative inline-block"
                      style={{ transformPerspective: 120 }}
                      initial={{ opacity: 0, rotateX: -90, y: "30%" }}
                      animate={{
                        opacity: 1,
                        rotateX: 0,
                        // A moved letter hops over its neighbour instead of
                        // sliding through it.
                        y: glyph.kind === "move" ? ["0%", "-40%", "0%"] : "0%",
                      }}
                      exit={{
                        opacity: 0,
                        rotateX: 90,
                        y: "-30%",
                        transition: {
                          duration: 0.16,
                          ease: [0.23, 1, 0.32, 1],
                        },
                      }}
                      transition={{
                        type: "spring",
                        visualDuration: 0.38,
                        bounce: 0,
                        delay: order * 0.04,
                        y: { duration: 0.42, ease: [0.77, 0, 0.175, 1] },
                      }}
                    >
                      {glyph.char}
                      {morph?.stage === 1 &&
                        index >= morph.range[0] &&
                        index < morph.range[1] && (
                          // The same underline the suggestion used, left under
                          // the stretch it fixed, then faded out.
                          // Plain WAAPI, not motion: the glyph lives under an
                          // AnimatePresence with initial={false}, which would
                          // make a motion child start on its last keyframe.
                          <span
                            className="absolute inset-x-0 -bottom-[3px] h-0.5 rounded-full bg-foreground/40 opacity-0"
                            ref={(el) => {
                              const run = el?.animate(
                                [
                                  { opacity: 0 },
                                  { opacity: 1, offset: 0.25 },
                                  { opacity: 1, offset: 0.6 },
                                  { opacity: 0 },
                                ],
                                {
                                  duration: 1100,
                                  delay: 240,
                                  easing: "ease-out",
                                },
                              );
                              return () => run?.cancel();
                            }}
                          />
                        )}
                    </motion.span>
                  );
                })}
              </AnimatePresence>
            </span>
          </LayoutGroup>
        )}
      </div>

      {/* One fixed-height slot for the hint, the suggestion and the sent
          note, so the button below never moves. */}
      <div id={`${id}-note`} aria-live="polite" className="relative mt-2 h-10">
        <AnimatePresence initial={false} mode="popLayout">
          {suggestion ? (
            <motion.div
              key="suggest"
              className="absolute inset-0 flex items-center gap-1"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -4, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{
                opacity: 0,
                filter: "blur(2px)",
                transition: { duration: 0.12 },
              }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <button
                type="button"
                onClick={accept}
                className="-ml-2 flex h-10 min-w-0 flex-1 items-center rounded-lg px-2 text-left text-sm leading-5 text-muted outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
              >
                {/* Wraps to a second line on a phone rather than cutting
                    off the one part that matters. */}
                <span className="line-clamp-2 [overflow-wrap:anywhere]">
                  Did you mean{" "}
                  <span className="text-foreground">
                    {suggestion.slice(0, fix.start)}
                    <span className="font-semibold underline decoration-foreground/40 decoration-2 underline-offset-[3px]">
                      {suggestion.slice(fix.start, fix.end)}
                    </span>
                    {suggestion.slice(fix.end)}
                  </span>
                  ?
                </span>
              </button>
              <button
                type="button"
                aria-label={`No, keep ${value.trim()}`}
                onClick={() => {
                  setDismissed((d) => [...d, value.toLowerCase()]);
                  inputRef.current?.focus();
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                >
                  <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                </svg>
              </button>
            </motion.div>
          ) : (
            <motion.p
              key={sent ? `sent-${sent}` : "hint"}
              className="absolute inset-0 flex items-center text-[13px] text-muted"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -4, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="truncate">
                {sent ? (
                  <>
                    Link sent to <span className="text-foreground">{sent}</span>
                    .
                  </>
                ) : (
                  hint
                )}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <button
        type="submit"
        disabled={!valid}
        className="mt-2 h-11 rounded-[10px] bg-foreground text-[15px] font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground enabled:active:scale-[0.96] disabled:opacity-35"
      >
        {submitLabel}
      </button>
    </form>
  );
}

// Four slips of different shapes: a swap, a swap mid-word, a dropped
// letter and a wrong key in the ending.
const TYPOS = ["gmial.com", "hotmial.com", "yaho.com", "gmail.con"];
const NAME = "maya.chen@";

export default function EmailTypoFixDemo() {
  // Opens on a typo so the suggestion is the first thing you see.
  const [value, setValue] = useState(`${NAME}${TYPOS[0]}`);
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <EmailTypoFix value={value} onValueChange={setValue} />
      <div className="flex w-[min(400px,100%)] flex-col items-center gap-2">
        <span className="text-[13px] text-muted">Try another typo</span>
        {/* Two by two on a phone rather than three and an orphan. */}
        <div className="grid grid-cols-2 gap-1.5 sm:flex">
          {TYPOS.map((typo) => (
            <button
              key={typo}
              type="button"
              aria-pressed={value === `${NAME}${typo}`}
              onClick={() => setValue(`${NAME}${typo}`)}
              className="h-8 rounded-full bg-surface px-3 font-mono text-[12px] text-foreground outline-hidden transition-[scale,background-color,color] duration-150 ease-out hover:bg-foreground/[0.08] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {typo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
