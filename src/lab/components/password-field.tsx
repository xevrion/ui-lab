"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Long enough to outlast a burst of typing, short enough that the verdict
// still arrives while the user is thinking about it.
const ANNOUNCE_DELAY = 900;
// Per changed segment, so even an empty-to-full jump starts its last segment
// only 120ms after the first.
const STAGGER = 40;

// The reveal: each dot slides out to where its letter sits and resolves
// into it, left to right like reading; hiding runs it back from the right
// and the dots close ranks. Per character it is a quick 200ms swap. The wave
// across the word is capped at 160ms however long the password is, so the
// whole gesture stays near 360ms: long enough to read as one sweep.
const CHAR_MS = 200;
const WAVE_MS = 160;
const MORPH_CSS = `
@keyframes pw-slide { from { translate: var(--pw-from) 0; } to { translate: var(--pw-to) 0; } }
@keyframes pw-show { from { opacity: 0; filter: blur(4px); scale: 0.6; } }
@keyframes pw-hide { to { opacity: 0; filter: blur(4px); scale: 0.6; } }
`;

type Morph = {
  id: number;
  reveal: boolean;
  chars: string[];
  // Left edge of each character as text, and as a password dot.
  letterX: number[];
  dotX: number[];
};

let measureCanvas: HTMLCanvasElement | null = null;

// Where each character starts in both renderings, measured with the input's
// own font, so the overlay lands exactly on what the input will draw.
function measure(input: HTMLInputElement, chars: string[]) {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return null;
  const style = getComputedStyle(input);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const dot = ctx.measureText("•").width;
  const letterX: number[] = [];
  let prefix = "";
  for (const c of chars) {
    letterX.push(ctx.measureText(prefix).width);
    prefix += c;
  }
  return { letterX, dotX: chars.map((_, i) => i * dot) };
}

const WORDS = ["", "Weak", "Good", "Good", "Strong"] as const;
const VERDICTS = ["Weak", "Good", "Strong"] as const;
// Weak is the one level worth alarm; past that, the meter just gets bolder.
const LEVEL_COLORS = [
  "",
  "bg-danger",
  "bg-foreground/35",
  "bg-foreground/65",
  "bg-foreground",
];

const RULES = [
  { label: "8 or more characters", test: (p: string) => p.length >= 8 },
  { label: "A number", test: (p: string) => /\d/.test(p) },
  { label: "A symbol", test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
];

// 0 when empty, otherwise 1 to 4. Length matters most, so anything under 8
// characters stays Weak however varied it is.
export function passwordStrength(password: string) {
  if (password === "") return 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(password),
  ).length;
  if (password.length < 8) return 1;
  let score = 1;
  if (password.length >= 12) score++;
  if (variety >= 2) score++;
  if (variety >= 3) score++;
  return Math.min(score, 4);
}

export function PasswordField({
  label = "Password",
  name,
  autoComplete = "new-password",
  onValueChange,
  className,
}: {
  label?: string;
  name?: string;
  autoComplete?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const rulesId = `${id}-rules`;
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef<[number, number] | null>(null);
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);

  const score = passwordStrength(value);
  const word = WORDS[score];

  // The score before the latest change, so only the segments that actually
  // change get staggered: left to right as the meter fills, right to left as
  // it drains. Segments already filled just recolor at once.
  const [current, setCurrent] = useState(score);
  const [from, setFrom] = useState(score);
  if (score !== current) {
    setFrom(current);
    setCurrent(score);
  }

  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setAnnounced(word ? `Password strength: ${word}` : ""),
      ANNOUNCE_DELAY,
    );
    return () => clearTimeout(timer);
  }, [word]);

  // Switching the input type can reset the caret in some browsers, so put
  // it back exactly where it was.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const range = selection.current;
    if (!input || !range || document.activeElement !== input) return;
    input.setSelectionRange(range[0], range[1]);
    selection.current = null;
  }, [revealed]);

  const [morph, setMorph] = useState<Morph | null>(null);
  const morphTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(morphTimer.current), []);

  const toggle = () => {
    const input = inputRef.current;
    if (input && input.selectionStart !== null && input.selectionEnd !== null)
      selection.current = [input.selectionStart, input.selectionEnd];
    const next = !revealed;
    setRevealed(next);
    clearTimeout(morphTimer.current);
    setMorph(null);
    const chars = [...value];
    // Skipped when the text is scrolled inside the field: the overlay only
    // knows where characters sit when the field starts at its first one.
    if (
      !input ||
      reduceMotion ||
      chars.length === 0 ||
      input.scrollWidth > input.clientWidth ||
      input.scrollLeft > 0
    )
      return;
    const spots = measure(input, chars);
    if (!spots) return;
    const id = (morph?.id ?? 0) + 1;
    setMorph({ id, reveal: next, chars, ...spots });
    morphTimer.current = setTimeout(() => setMorph(null), CHAR_MS + WAVE_MS);
  };

  const step = morph ? Math.min(24, WAVE_MS / Math.max(morph.chars.length - 1, 1)) : 0;

  return (
    <div className={cn("flex flex-col", className)}>
      <label
        htmlFor={id}
        className="mb-2 text-[15px] font-medium text-foreground select-none"
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          aria-describedby={rulesId}
          onChange={(e) => {
            // Typing wins over the flourish: the real text shows at once.
            clearTimeout(morphTimer.current);
            setMorph(null);
            setValue(e.target.value);
            onValueChange?.(e.target.value);
          }}
          className={cn(
            "h-11 w-full rounded-xl border border-border bg-background pr-12 pl-3.5 text-[15px] caret-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-foreground max-sm:text-[16px]",
            // The overlay draws the characters while it runs; the caret stays.
            morph ? "text-transparent" : "text-foreground",
          )}
        />
        {morph && (
          <span
            key={morph.id}
            aria-hidden
            // Same box and type as the input's text: 1px border + 14px padding.
            className="pointer-events-none absolute inset-y-0 right-12 left-[15px] overflow-hidden text-[15px] max-sm:text-[16px] whitespace-pre text-foreground"
          >
            <style href="password-field" precedence="default">
              {MORPH_CSS}
            </style>
            {morph.chars.map((char, i) => {
              // Reveal sweeps left to right; hiding starts from the end.
              const order = morph.reveal ? i : morph.chars.length - 1 - i;
              const timing = `${CHAR_MS}ms cubic-bezier(0.23, 1, 0.32, 1) ${order * step}ms both`;
              const from = morph.reveal ? morph.dotX[i] : morph.letterX[i];
              const to = morph.reveal ? morph.letterX[i] : morph.dotX[i];
              return (
                <span
                  key={i}
                  // Left-aligned, so the dot and the letter share the left
                  // edge the measurements describe.
                  className="absolute inset-y-0 left-0 grid items-center justify-items-start"
                  style={
                    {
                      "--pw-from": `${from}px`,
                      "--pw-to": `${to}px`,
                      animation: `pw-slide ${timing}`,
                    } as React.CSSProperties
                  }
                >
                  <span
                    className="col-start-1 row-start-1"
                    style={{ animation: `${morph.reveal ? "pw-show" : "pw-hide"} ${timing}` }}
                  >
                    {char}
                  </span>
                  <span
                    className="col-start-1 row-start-1"
                    style={{ animation: `${morph.reveal ? "pw-hide" : "pw-show"} ${timing}` }}
                  >
                    {"•"}
                  </span>
                </span>
              );
            })}
          </span>
        )}
        {/* 8px radius inside the 12px field with 4px of inset: concentric. */}
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={revealed}
          aria-controls={id}
          // Stops a mouse click from stealing focus, so the caret stays put
          // and typing can carry on. Keyboard users keep focus on the button.
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") e.preventDefault();
          }}
          onClick={toggle}
          className={cn(
            "absolute top-1 right-1 flex size-9 touch-manipulation items-center justify-center rounded-lg text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]",
            revealed && "text-foreground",
          )}
        >
          <span className="grid" aria-hidden>
            <Icon visible={!revealed} reduceMotion={reduceMotion}>
              <path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z" />
              <circle cx="8" cy="8" r="2" />
            </Icon>
            <Icon visible={revealed} reduceMotion={reduceMotion}>
              <path d="M6.5 3.9A6 6 0 0 1 8 3.75c4 0 6.25 4.25 6.25 4.25a11 11 0 0 1-1.6 2.2M9.4 9.45a2 2 0 0 1-2.85-2.85M11.6 11.3A6.3 6.3 0 0 1 8 12.25C4 12.25 1.75 8 1.75 8a11 11 0 0 1 2.7-3.2M2.25 2.25l11.5 11.5" />
            </Icon>
          </span>
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3" aria-hidden>
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3, 4].map((segment) => {
            const filled = segment <= score;
            const step =
              score > from
                ? segment - from - 1
                : segment > score
                  ? from - segment
                  : 0;
            const delay = Math.max(0, step) * STAGGER;
            return (
              <span
                key={segment}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
              >
                <span
                  style={{
                    transitionDelay: reduceMotion ? "0ms" : `${delay}ms`,
                  }}
                  className={cn(
                    "block h-full origin-left rounded-full transition-[scale,opacity,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity,background-color]",
                    filled
                      ? cn("scale-x-100 opacity-100", LEVEL_COLORS[score])
                      : "scale-x-0 opacity-0 motion-reduce:scale-x-100",
                  )}
                />
              </span>
            );
          })}
        </div>
        {/* All words share one grid cell, so the row keeps the width of the
            longest and never jumps; they crossfade through a 4px blur. */}
        <span className="grid w-14 text-right text-sm font-medium">
          {VERDICTS.map((w) => (
            <span
              key={w}
              className={cn(
                "col-start-1 row-start-1 transition-[opacity,filter] ease-out",
                w === word
                  ? "opacity-100 blur-[0px] duration-200"
                  : "opacity-0 blur-[4px] duration-150",
                w === "Weak" ? "text-danger" : "text-foreground",
              )}
            >
              {w}
            </span>
          ))}
        </span>
      </div>

      <ul id={rulesId} className="mt-3.5 flex flex-col gap-2">
        {RULES.map((rule) => {
          const met = rule.test(value);
          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-2 text-sm transition-[color] duration-150 ease-out",
                met ? "text-foreground" : "text-muted",
              )}
            >
              <span className="grid" aria-hidden>
                <Icon visible={!met} reduceMotion={reduceMotion} small>
                  <circle cx="8" cy="8" r="2" />
                </Icon>
                <Icon visible={met} reduceMotion={reduceMotion} small>
                  <path d="m3.5 8.5 3 3 6-7" />
                </Icon>
              </span>
              {rule.label}
              <span className="sr-only">{met ? ", met" : ", not met"}</span>
            </li>
          );
        })}
      </ul>

      <span className="sr-only" aria-live="polite">
        {announced}
      </span>
    </div>
  );
}

function Icon({
  visible,
  reduceMotion,
  small,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean | null;
  small?: boolean;
  children: React.ReactNode;
}) {
  // Reduced motion keeps the cross-fade but drops the scale and blur.
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
  return (
    <motion.svg
      viewBox="0 0 16 16"
      className={cn("col-start-1 row-start-1", small ? "size-4" : "size-5")}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
    >
      {children}
    </motion.svg>
  );
}

export default function PasswordFieldDemo() {
  return <PasswordField name="password" className="w-[380px] max-w-full" />;
}
