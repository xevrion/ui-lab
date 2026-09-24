"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

type Status = "idle" | "checking" | "error" | "success";

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Long enough to register the red and the shake, short enough that retyping
// never feels blocked.
const ERROR_HOLD = 700;
const SUCCESS_HOLD = 2000;
// Slot geometry, in px: w-10 slots with gap-2 between them.
const GAP = 8;
const SLOT_STEP = 40 + GAP;

// Keyframes suit both: the caret loops forever and the shake is a one-shot
// that nothing interrupts.
const CSS = `
@keyframes otp-caret {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}
@keyframes otp-shake {
  0% { translate: 0; }
  20% { translate: -6px; }
  40% { translate: 5px; }
  60% { translate: -3px; }
  80% { translate: 1.5px; }
  100% { translate: 0; }
}
.otp-caret { animation: otp-caret 1s infinite; }
.otp-shake { animation: otp-shake 300ms cubic-bezier(0.23, 1, 0.32, 1); }
@media (prefers-reduced-motion: reduce) {
  .otp-caret, .otp-shake { animation: none; }
}
`;

export function OtpInput({
  length = 6,
  onVerify,
  hint,
  label = "One-time code",
  autoFocus = false,
  className,
}: {
  length?: number;
  onVerify: (code: string) => boolean | Promise<boolean>;
  hint?: string;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attempt = useRef(0);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    const attempts = attempt;
    return () => {
      clearTimeout(timer.current);
      // Drops any verification that resolves after unmount.
      attempts.current++;
    };
  }, []);

  // A code screen exists to take the code, so typing should work straight
  // away, and a digit typed after focus has wandered off to nothing brings
  // it back instead of being lost. Keys meant for another field are left
  // alone.
  useEffect(() => {
    // Inert copies, like the index preview, never take focus or keys.
    if (!autoFocus || inputRef.current?.closest("[inert]")) return;
    inputRef.current?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (!/^\d$/.test(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      const current = document.activeElement;
      if (current && current !== document.body) return;
      inputRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [autoFocus]);

  const reset = () => {
    setValue("");
    setStatus("idle");
    inputRef.current?.focus();
  };

  const verify = async (code: string) => {
    const id = ++attempt.current;
    setStatus("checking");
    let ok = false;
    try {
      ok = await onVerify(code);
    } catch {
      // A failed check reads as a wrong code rather than a stuck input.
    }
    if (id !== attempt.current) return;
    setStatus(ok ? "success" : "error");
    clearTimeout(timer.current);
    timer.current = setTimeout(reset, ok ? SUCCESS_HOLD : ERROR_HOLD);
  };

  const onChange = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, length);
    setValue(next);
    if (next.length === length) verify(next);
  };

  // Slots only fill left to right, so a click anywhere lands the caret at
  // the end. A real selection (like select all) is left alone.
  const keepCaretAtEnd = () => {
    const input = inputRef.current;
    if (!input || input.selectionStart !== input.selectionEnd) return;
    const end = input.value.length;
    if (input.selectionStart !== end) input.setSelectionRange(end, end);
  };

  const locked = status !== "idle";
  const active = focused && !locked ? Math.min(value.length, length - 1) : -1;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <style href="otp-input" precedence="default">
        {CSS}
      </style>
      {/* The one real input sits over the slots with invisible text, so
          paste, SMS autofill, selection and backspace all stay native. */}
      <div
        className={cn("relative flex gap-2", status === "error" && "otp-shake")}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setFocused(true);
            // The browser places the caret after focus fires.
            requestAnimationFrame(keepCaretAtEnd);
          }}
          onBlur={() => setFocused(false)}
          onSelect={keepCaretAtEnd}
          readOnly={locked}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={length}
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={status === "error"}
          spellCheck={false}
          // 16px text stops iOS from zooming the page on focus.
          className="absolute inset-0 z-10 cursor-text bg-transparent text-base text-transparent caret-transparent outline-hidden selection:bg-transparent"
        />
        {Array.from({ length }, (_, i) => (
          <Slot
            key={i}
            char={value[i]}
            caret={i === active && value.length < length}
            caretKey={value.length}
            status={status}
            // Distance to the row's middle, in slots: how far this one
            // travels when the code seals.
            offset={(length - 1) / 2 - i}
            edge={i === 0 ? "start" : i === length - 1 ? "end" : "middle"}
            reduceMotion={reduceMotion}
          />
        ))}
        {/* One focus ring for the whole code, gliding to the next slot as
            each digit lands, so the eye is led along instead of watching
            one box switch off and the next switch on. */}
        <span
          aria-hidden
          style={{ translate: `${Math.max(active, 0) * SLOT_STEP}px 0` }}
          className={cn(
            "pointer-events-none absolute top-0 left-0 h-12 w-10 rounded-lg border border-foreground ring-1 ring-foreground",
            "transition-[translate,opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
            active < 0 && "scale-[0.96] opacity-0",
          )}
        />
        {/* The seal's single outline, drawn around where the slots end up,
            so it has no seams where the six boxes meet. It waits until the
            320ms close is nearly done, or the slots would overhang it. */}
        <span
          aria-hidden
          style={{ insetInline: reduceMotion ? 0 : ((length - 1) * GAP) / 2 }}
          className={cn(
            "pointer-events-none absolute inset-y-0 rounded-lg border border-foreground",
            status === "success"
              ? "opacity-100 transition-[opacity] delay-[240ms] duration-200 ease-out"
              : "opacity-0 transition-[opacity] duration-150 ease-out",
          )}
        />
      </div>

      {/* All three messages share one grid cell, so swapping never shifts
          anything and the cell keeps the width of the longest. */}
      <p className="grid h-5 text-sm">
        <Message visible={status === "idle" || status === "checking"}>
          <span id={hintId} className="text-muted">
            {hint}
          </span>
        </Message>
        <Message visible={status === "error"}>
          <span className="text-danger">Wrong code, try again</span>
        </Message>
        <Message visible={status === "success"}>
          <motion.svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 shrink-0 text-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={
              status === "success"
                ? { scale: 1, opacity: 1, filter: "blur(0px)" }
                : reduceMotion
                  ? { scale: 1, opacity: 0, filter: "blur(0px)" }
                  : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
            }
            transition={ICON_SWAP}
          >
            <path d="m3.5 8.5 3 3 6-7" />
          </motion.svg>
          <span className="text-foreground">Verified</span>
        </Message>
      </p>

      <span className="sr-only" aria-live="polite">
        {status === "success"
          ? "Code verified"
          : status === "error"
            ? "Wrong code. The field was cleared, try again."
            : ""}
      </span>
    </div>
  );
}

function Message({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden={!visible}
      className={cn(
        "col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap",
        "transition-[opacity,filter] ease-out motion-reduce:transition-[opacity]",
        // Enters in 200ms, leaves in 120ms so the old line never lingers.
        visible
          ? "opacity-100 duration-200"
          : "opacity-0 blur-[2px] duration-[120ms] motion-reduce:filter-none",
      )}
    >
      {children}
    </span>
  );
}

function Slot({
  char,
  caret,
  caretKey,
  status,
  offset,
  edge,
  reduceMotion,
}: {
  char: string | undefined;
  caret: boolean;
  caretKey: number;
  status: Status;
  offset: number;
  edge: "start" | "middle" | "end";
  reduceMotion: boolean | null;
}) {
  // A verified code seals: the slots slide together into one bar, their
  // inner walls and corners dissolve, and the six boxes become one field.
  const sealed = status === "success";
  return (
    <div
      aria-hidden
      style={{
        translate: sealed && !reduceMotion ? `${offset * GAP}px 0` : undefined,
      }}
      className={cn(
        "flex h-12 w-10 items-center justify-center rounded-lg border bg-surface font-mono text-lg text-foreground tabular-nums",
        sealed
          ? // 320ms, over the usual cap: it plays once per code, as the
            // payoff, and a faster close reads as a glitch rather than a seal.
            "border-transparent transition-[translate,border-color,border-radius,color] duration-[320ms] ease-[cubic-bezier(0.77,0,0.175,1)]"
          : "transition-[translate,border-color,border-radius,color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        // The walls between digits stay as hairlines, so the code still
        // reads in groups of one.
        sealed && edge !== "start" && "rounded-l-none border-l-border",
        sealed && edge !== "end" && "rounded-r-none",
        status === "error"
          ? "border-danger text-danger"
          : !sealed && "border-border",
      )}
    >
      {char ? (
        // Keyed by the digit so a replaced digit lifts in again. Deleting
        // unmounts it, so removals vanish with no exit.
        <motion.span
          key={char}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          {char}
        </motion.span>
      ) : caret ? (
        // Remounts on every keystroke so the caret restarts solid while
        // typing, like a native caret.
        <span key={caretKey} className="otp-caret h-5 w-px bg-foreground" />
      ) : null}
    </div>
  );
}

export default function OtpInputDemo() {
  return (
    <OtpInput
      autoFocus
      hint="Try 123456"
      onVerify={(code) => code === "123456"}
    />
  );
}
