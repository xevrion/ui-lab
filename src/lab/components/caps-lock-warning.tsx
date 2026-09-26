"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;

export function CapsLockPasswordField({
  label = "Password",
  name = "password",
  autoComplete = "current-password",
  capsLock,
  className,
}: {
  label?: string;
  name?: string;
  autoComplete?: string;
  /** Caps Lock state tracked elsewhere (say, app-wide). When set, it
   * replaces the field's own detection and shows without focus. */
  capsLock?: boolean;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-caps`;
  const reduceMotion = useReducedMotion();
  const [caps, setCaps] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  // Every key and pointer event carries the lock state, including the
  // Caps Lock key's own events, so the field stays right without polling.
  const read = (e: KeyboardEvent | PointerEvent) => {
    const on = e.getModifierState("CapsLock");
    setCaps((prev) => (prev === on ? prev : on));
  };

  // Only while typing here: a warning for a field you aren't in is noise.
  const warn = capsLock ?? (caps && focused);

  return (
    <div className={cn("grid w-[min(320px,100%)] gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-describedby={warn ? hintId : undefined}
          onKeyDown={read}
          onKeyUp={read}
          onPointerDown={read}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Right padding is fixed for both the keycap and the button, so
          // the text never shifts when the keycap arrives.
          className="h-10 w-full rounded-lg border border-border bg-background pr-[84px] pl-3 text-[15px] text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.04)] outline-hidden transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted focus-visible:border-foreground/40 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--foreground)_10%,transparent)] max-sm:text-[16px]"
        />

        <div className="pointer-events-none absolute inset-y-0 right-10 flex items-center">
          <motion.span
            aria-hidden
            initial={false}
            animate={
              warn
                ? {
                    opacity: 1,
                    x: 0,
                    filter: "blur(0px)",
                    transition: { type: "spring", duration: 0.35, bounce: 0.15 },
                  }
                : {
                    opacity: 0,
                    x: reduceMotion ? 0 : 8,
                    filter: reduceMotion ? "blur(0px)" : "blur(3px)",
                    // Leaves quicker and without the bounce.
                    transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
                  }
            }
            className="relative flex h-[22px] w-[30px] flex-col justify-between rounded-[5px] border border-border bg-background px-[4px] pt-[3px] pb-[3px] shadow-[0_2px_0_0_var(--border)] dark:bg-surface"
          >
            <span
              className={cn(
                "block size-[4px] rounded-full transition-[background-color,box-shadow] duration-300 ease-out",
                // The LED is lit hardware, so it is a raw green: it means
                // "on" in both themes, like the light on a real keyboard.
                warn
                  ? "bg-[#30d158] shadow-[0_0_4px_1px_#30d15888]"
                  : "bg-border",
              )}
            />
            {/* The caps lock glyph: an outlined up arrow over a bar. */}
            <svg
              viewBox="0 0 12 10"
              className="h-[9px] w-[11px] self-center text-foreground/70"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.1}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path d="M6 1 2 5h2v1.5h4V5h2L6 1Z" />
              <path d="M4 8.75h4" />
            </svg>
          </motion.span>
        </div>

        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-controls={id}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          // Keeps focus in the field so the caret and caps state survive.
          onPointerDown={(e) => e.preventDefault()}
          className="absolute top-1 right-1 flex size-8 touch-manipulation items-center justify-center rounded-md text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
        >
          <span className="grid" aria-hidden>
            <EyeGlyph visible={!shown} reduceMotion={reduceMotion} slash={false} />
            <EyeGlyph visible={shown} reduceMotion={reduceMotion} slash />
          </span>
        </button>
      </div>

      {/* Fixed-height row so the form never jumps when the hint appears. */}
      <p id={hintId} className="relative h-5 text-[13px] text-muted">
        {/* Visible text never empties, so it can fade out whole. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 transition-[opacity,filter,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
            warn
              ? "translate-y-0 opacity-100 filter-none duration-200"
              : "-translate-y-0.5 opacity-0 blur-[2px] duration-150 motion-reduce:translate-y-0 motion-reduce:filter-none",
          )}
        >
          Caps Lock is on
        </span>
        <span className="sr-only" aria-live="polite">
          {warn ? "Caps Lock is on" : ""}
        </span>
      </p>
    </div>
  );
}

function EyeGlyph({
  visible,
  slash,
  reduceMotion,
}: {
  visible: boolean;
  slash: boolean;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.svg
      viewBox="0 0 16 16"
      className="col-start-1 row-start-1 size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={
        visible
          ? { opacity: 1, scale: 1, filter: "blur(0px)" }
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
      }
      transition={ICON_SWAP}
    >
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      {slash && <path d="m2.5 2.5 11 11" />}
    </motion.svg>
  );
}

// Index card hover: someone types a password, hits Caps Lock partway
// through, sees the key light up, turns it off and carries on. Times are ms
// from the start of each run.
const SCRIPT: [number, string | boolean][] = [
  [300, "s"], [420, "u"], [540, "n"],
  [900, true],
  [1250, "S"], [1370, "E"], [1490, "T"],
  [2400, false],
  [2750, "4"], [2870, "2"],
];
const RUN_MS = 5200;
const ERASE_AT = 3900;
// Held backspace speed.
const ERASE_STEP = 45;

export default function CapsLockWarningDemo() {
  const play = usePreviewPlay();
  const wrap = useRef<HTMLDivElement>(null);
  const [caps, setCaps] = useState(false);
  const erase = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!play) return;
    const input = wrap.current?.querySelector("input");
    if (!input) return;
    // Typed straight into the DOM: the field is uncontrolled, and a preview
    // never takes focus or touches real keys.
    const eraseAll = () => {
      clearInterval(erase.current);
      erase.current = setInterval(() => {
        input.value = input.value.slice(0, -1);
        if (!input.value) clearInterval(erase.current);
      }, ERASE_STEP);
    };
    clearInterval(erase.current);
    input.value = "";
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = SCRIPT.map(([at, step]) =>
        setTimeout(() => {
          if (typeof step === "boolean") setCaps(step);
          else input.value += step;
        }, at),
      );
      timers.push(setTimeout(eraseAll, ERASE_AT), setTimeout(run, RUN_MS));
    };
    run();
    return () => {
      timers.forEach(clearTimeout);
      // Unhovered: let go the way a person would, not all at once.
      setCaps(false);
      if (input.value) eraseAll();
    };
  }, [play]);

  useEffect(() => () => clearInterval(erase.current), []);

  return (
    <div ref={wrap} className="contents">
      <CapsLockPasswordField capsLock={play ? caps : undefined} />
    </div>
  );
}
