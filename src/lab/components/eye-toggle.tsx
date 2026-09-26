"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

// Eye geometry in a 24 unit box. The upper lid's control points travel from
// 5 (open) down to 19, where the lid lies on the lower one and the eye is
// shut. Two decimals keeps the path strings stable and short.
const OPEN_Y = 5;
const SHUT_Y = 19;
const round = (n: number) => Math.round(n * 100) / 100;
const topLid = (c: number) => `M2 12C6 ${c} 18 ${c} 22 12`;
const LOWER_LID = "M2 12C6 19 18 19 22 12";

// How far the iris may wander from centre before it would clip the lids.
const GAZE_X = 4;
const GAZE_Y = 2;
// Distance (px) at which the gaze reaches its limit; nearer targets get a
// proportionally smaller glance, so a cursor on the icon looks straight on.
const GAZE_REACH = 160;

export function EyeToggle({
  visible,
  onToggle,
  inputRef,
  controls,
  className,
}: {
  visible: boolean;
  /** id of the input it reveals, for aria-controls. */
  controls?: string;
  onToggle: () => void;
  /** The field it reveals; while typing, the eye looks at its caret. */
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const clipId = `eye-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const reduceMotion = useReducedMotion();
  const button = useRef<HTMLButtonElement>(null);

  const lid = useMotionValue(visible ? 0 : 1);
  const lidCurve = useTransform(lid, (v) =>
    topLid(round(OPEN_Y + (SHUT_Y - OPEN_Y) * v)),
  );
  const aperture = useTransform(
    lid,
    (v) => `${topLid(round(OPEN_Y + (SHUT_Y - OPEN_Y) * v))}C18 19 6 19 2 12Z`,
  );
  // Springs so the eye darts and settles like an eye, not a cursor.
  const gazeX = useSpring(0, { stiffness: 380, damping: 28 });
  const gazeY = useSpring(0, { stiffness: 380, damping: 28 });

  const lookAt = (x: number, y: number) => {
    const el = button.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Back to unscaled px, so a zoomed preview glances as far as the page.
    const s = r.width / el.offsetWidth || 1;
    const dx = (x - (r.left + r.width / 2)) / s;
    const dy = (y - (r.top + r.height / 2)) / s;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      gazeX.set(0);
      gazeY.set(0);
      return;
    }
    const reach = Math.min(1, dist / GAZE_REACH);
    gazeX.set((dx / dist) * reach * GAZE_X);
    gazeY.set((dy / dist) * reach * GAZE_Y);
  };
  const lookAtRef = useRef(lookAt);
  useEffect(() => {
    lookAtRef.current = lookAt;
  });

  // Opening springs up; closing is a quicker, flatter fall with no bounce.
  useEffect(() => {
    const controls = reduceMotion
      ? animate(lid, visible ? 0 : 1, { duration: 0 })
      : visible
        ? animate(lid, 0, { type: "spring", duration: 0.35, bounce: 0.2 })
        : animate(lid, 1, { duration: 0.2, ease: [0.23, 1, 0.32, 1] });
    if (!visible) {
      gazeX.set(0);
      gazeY.set(0);
    }
    return () => controls.stop();
  }, [visible, reduceMotion, lid, gazeX, gazeY]);

  // The pupil follows the cursor while open, on fine pointers only: on
  // touch there is no cursor to follow between taps.
  useEffect(() => {
    if (!visible || reduceMotion) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen")
        lookAtRef.current(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [visible, reduceMotion]);

  // While typing, the eye reads along with the caret.
  useEffect(() => {
    const input = inputRef?.current;
    if (!input || !visible || reduceMotion) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const follow = () => {
      if (!ctx) return;
      const cs = getComputedStyle(input);
      ctx.font = cs.font;
      const upto = input.value.slice(0, input.selectionEnd ?? input.value.length);
      const r = input.getBoundingClientRect();
      // The offsets below are layout px; the rect is post-transform.
      const s = r.width / input.offsetWidth || 1;
      const x =
        r.left +
        (parseFloat(cs.paddingLeft) +
          parseFloat(cs.borderLeftWidth) +
          ctx.measureText(upto).width -
          input.scrollLeft) *
          s;
      lookAtRef.current(Math.min(x, r.right), r.top + r.height / 2);
    };
    const events = ["input", "keyup", "click", "select", "focus"] as const;
    events.forEach((t) => input.addEventListener(t, follow));
    return () => events.forEach((t) => input.removeEventListener(t, follow));
  }, [inputRef, visible, reduceMotion]);

  // Blinks now and then while open and idle: 3 to 7s apart so it never
  // settles into a rhythm you can predict.
  useEffect(() => {
    if (!visible || reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    let blink: AnimationPlaybackControls | undefined;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (!document.hidden)
            // A real blink is about 150ms: a quick fall, a slightly slower
            // lift.
            blink = animate(lid, [0, 1, 0], {
              duration: 0.17,
              times: [0, 0.4, 1],
              ease: ["easeIn", "easeOut"],
            });
          schedule();
        },
        3000 + Math.random() * 4000,
      );
    };
    schedule();
    return () => {
      clearTimeout(timer);
      blink?.stop();
    };
  }, [visible, reduceMotion, lid]);

  return (
    <button
      ref={button}
      type="button"
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      aria-controls={controls}
      onClick={onToggle}
      // Keeps focus (and the caret) in the field.
      onPointerDown={(e) => e.preventDefault()}
      className={cn(
        "flex size-8 touch-manipulation items-center justify-center rounded-md text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]",
        visible && "text-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5 overflow-visible"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <defs>
          <clipPath id={clipId}>
            <motion.path d={aperture} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <motion.g style={{ x: gazeX, y: gazeY }}>
            <circle cx="12" cy="12" r="3.4" />
            <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
          </motion.g>
        </g>
        <path d={LOWER_LID} />
        <motion.path d={lidCurve} />
        {/* Lashes hang from the shut lid; they belong to "hidden", not to a
            blink, so they follow the state rather than the lid. */}
        <motion.g
          initial={false}
          animate={
            visible
              ? { opacity: 0, y: reduceMotion ? 0 : -1.5 }
              : { opacity: 1, y: 0 }
          }
          transition={
            visible
              ? { duration: 0.1 }
              : { duration: 0.18, delay: reduceMotion ? 0 : 0.12, ease: [0.23, 1, 0.32, 1] }
          }
        >
          <path d="M5.2 15.4 3.9 17.4" />
          <path d="M12 17.3V19.8" />
          <path d="M18.8 15.4 20.1 17.4" />
        </motion.g>
      </svg>
    </button>
  );
}

export function RevealPasswordField({
  label = "Password",
  visible: visibleProp,
  onVisibleChange,
  className,
}: {
  label?: string;
  /** Controlled reveal state; leave unset to let the field own it. */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [visibleState, setVisible] = useState(false);
  const visible = visibleProp ?? visibleState;
  return (
    <div className={cn("grid w-[min(320px,100%)] gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          spellCheck={false}
          className="h-10 w-full rounded-lg border border-border bg-background pr-11 pl-3 text-[15px] text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.04)] outline-hidden transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-foreground/40 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--foreground)_10%,transparent)] max-sm:text-[16px]"
        />
        <EyeToggle
          visible={visible}
          onToggle={() => {
            setVisible(!visible);
            onVisibleChange?.(!visible);
          }}
          inputRef={input}
          controls={id}
          className="absolute top-1 right-1"
        />
      </div>
    </div>
  );
}

// Index card hover: a few hidden characters, the eye opens to check them,
// reads along as the rest are typed, then shuts again. Times are ms from the
// start of each run.
const SCRIPT: [number, string | boolean][] = [
  [300, "o"], [420, "p"], [540, "e"], [660, "n"],
  [1100, true],
  [1700, "s"], [1830, "e"], [1960, "s"], [2090, "a"], [2220, "m"], [2350, "e"],
  [3200, false],
];
const RUN_MS = 5400;
const ERASE_AT = 4000;
// Held backspace speed.
const ERASE_STEP = 45;

export default function EyeToggleDemo() {
  const play = usePreviewPlay();
  const wrap = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const erase = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!play) return;
    const input = wrap.current?.querySelector("input");
    if (!input) return;
    // Typed straight into the DOM (the field is uncontrolled); the input
    // event is what the eye already listens to, so it reads the caret the
    // same way it does for real typing. Nothing is focused.
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const eraseAll = () => {
      clearInterval(erase.current);
      erase.current = setInterval(() => {
        type(input.value.slice(0, -1));
        if (!input.value) clearInterval(erase.current);
      }, ERASE_STEP);
    };
    clearInterval(erase.current);
    type("");
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = SCRIPT.map(([at, step]) =>
        setTimeout(() => {
          if (typeof step === "boolean") setShown(step);
          else type(input.value + step);
        }, at),
      );
      timers.push(setTimeout(eraseAll, ERASE_AT), setTimeout(run, RUN_MS));
    };
    run();
    return () => {
      timers.forEach(clearTimeout);
      // Unhovered: let go the way a person would, not all at once.
      setShown(false);
      if (input.value) eraseAll();
    };
  }, [play]);

  useEffect(() => () => clearInterval(erase.current), []);

  return (
    <div ref={wrap} className="contents">
      <RevealPasswordField
        visible={play === null ? undefined : shown}
        onVisibleChange={setShown}
      />
    </div>
  );
}
