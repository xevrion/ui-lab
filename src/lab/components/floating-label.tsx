"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

type Status = "idle" | "error" | "valid";

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Per letter: 14ms reads as a ripple without the end of a long label
// lagging. Past the cap every letter moves together, so no label takes
// longer than 200ms + 8 * 14ms to land.
const RISE_STAGGER = 14;
// Settling back is quicker: the field is being left, not entered.
const SETTLE_STAGGER = 8;
const STAGGER_CAP = 8;

export function FloatingLabel({
  label,
  type = "text",
  name,
  autoComplete,
  defaultValue,
  validate,
  onValueChange,
  className,
}: {
  label: string;
  type?: "text" | "email" | "tel" | "url";
  name?: string;
  autoComplete?: string;
  defaultValue?: string;
  // Returns an error message, or null when the value is fine.
  validate?: (value: string) => string | null;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<Status>("idle");
  // Kept after the error clears so the message never empties while its row
  // is still collapsing.
  const [message, setMessage] = useState("");
  // Validation starts on blur and only follows every keystroke once the
  // user has seen an error, so nobody is scolded for a half-typed address.
  const [live, setLive] = useState(false);

  const check = (value: string) => {
    const error = validate?.(value) ?? null;
    if (error) setMessage(error);
    setStatus(error ? "error" : "valid");
    return error;
  };

  const invalid = status === "error";
  // Only flips when focus moves or the field crosses empty, never per
  // keystroke; setState with an unchanged value skips the render.
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(() => !!defaultValue);
  const floated = focused || filled;
  const letters = Array.from(label);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative">
        {/* placeholder=" " lets CSS know when the field is filled, so the
            label floats without a re-render on every keystroke. */}
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          placeholder=" "
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const value = e.target.value;
            setFilled(value !== "");
            onValueChange?.(value);
            if (!validate) return;
            if (live) check(value);
            // A valid field stops claiming so the moment it isn't, but only
            // turns red again on blur.
            else if (status === "valid" && validate(value)) setStatus("idle");
          }}
          onBlur={(e) => {
            setFocused(false);
            if (!validate) return;
            const value = e.target.value;
            // Tabbing past an untouched field is not a mistake.
            if (value === "" && !live) return;
            if (check(value)) setLive(true);
          }}
          className={cn(
            // 22px of top padding (23px with the border) clears the floated
            // label (7px down, 12px text in a 16px line box, so done by 23px),
            // so typed text and label never share a pixel. A fixed 20px line
            // height keeps that math independent of the page's leading.
            "peer h-13 w-full rounded-xl border bg-background pt-[22px] pr-10 pb-2 pl-3.5 text-[15px]/5 text-foreground outline-hidden transition-[border-color] duration-150 ease-out max-sm:text-[16px]",
            "focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-1",
            invalid
              ? "border-danger focus-visible:outline-danger"
              : "border-border focus-visible:outline-foreground",
          )}
        />
        {/* The label peels off the line one letter at a time, first letter
            first, and settles back last letter first, like a sticker lifted
            from its corner. The whole word scales from its top left corner
            while each letter rises on its own delay, so nothing reflows. */}
        <label
          htmlFor={id}
          data-floated={floated || undefined}
          className={cn(
            "group/label pointer-events-none absolute top-4 left-3.5 origin-top-left text-[15px]/5 max-sm:text-[16px] whitespace-nowrap select-none",
            "transition-[scale,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[color]",
            // Centered at 16px from the top, it shrinks to 80% (12px) while
            // its letters rise 9px, to sit 7px from the top.
            "data-floated:scale-[0.8] data-floated:duration-200",
            invalid ? "text-danger" : "text-muted peer-focus:text-foreground",
          )}
        >
          <span className="sr-only">{label}</span>
          <span aria-hidden>
            {letters.map((letter, i) => (
              <span
                key={i}
                style={{
                  transitionDelay: `${
                    floated
                      ? Math.min(i, STAGGER_CAP) * RISE_STAGGER
                      : Math.min(letters.length - 1 - i, STAGGER_CAP) *
                        SETTLE_STAGGER
                  }ms`,
                }}
                className={cn(
                  "inline-block whitespace-pre",
                  "transition-[translate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                  // 9px on screen is 11.25px before the 0.8 scale.
                  "group-data-floated/label:-translate-y-[11.25px] group-data-floated/label:duration-200",
                )}
              >
                {letter}
              </span>
            ))}
          </span>
        </label>
        <motion.svg
          aria-hidden
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute top-4 right-3.5 size-5 text-foreground"
          initial={false}
          animate={
            status === "valid"
              ? { scale: 1, opacity: 1, filter: "blur(0px)" }
              : reduceMotion
                ? { scale: 1, opacity: 0, filter: "blur(0px)" }
                : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
          }
          transition={ICON_SWAP}
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </motion.svg>
      </div>

      {/* Grid rows from 0fr to 1fr give a real height transition without
          measuring. Opens in 200ms, closes in 150ms. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          invalid
            ? "grid-rows-[1fr] duration-200"
            : "grid-rows-[0fr] duration-150",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <p
            id={errorId}
            aria-hidden={!invalid}
            className={cn(
              "pt-2 pl-3.5 text-sm text-danger transition-[opacity,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
              invalid
                ? "translate-y-0 opacity-100 duration-200"
                : "-translate-y-1 opacity-0 duration-150 motion-reduce:translate-y-0",
            )}
          >
            {message}
          </p>
        </div>
      </div>
      {/* Blur moves focus away, so the error needs its own announcement. */}
      <span className="sr-only" aria-live="polite">
        {invalid ? message : ""}
      </span>
    </div>
  );
}

// Deliberately loose: the server is the real judge of an address.
function validateEmail(value: string) {
  const email = value.trim();
  if (email === "") return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return "That doesn't look like an email address.";
  return null;
}

export default function FloatingLabelDemo() {
  return (
    <form
      className="flex w-[380px] max-w-full flex-col gap-4"
      noValidate
      onSubmit={(e) => e.preventDefault()}
    >
      <FloatingLabel label="Full name" name="name" autoComplete="name" />
      <FloatingLabel
        label="Email address"
        type="email"
        name="email"
        autoComplete="email"
        validate={validateEmail}
      />
    </form>
  );
}
