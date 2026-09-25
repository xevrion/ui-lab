"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { usePreviewPlay } from "@/lab/preview-play";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MOODS = ["Rough", "Meh", "Okay", "Good", "Great"];
const moodOf = (v: number) => Math.min(4, Math.floor(v / 20));
// The mood's colours are the point of it, so raw values: a cool dusk blue,
// a neutral grey, a warm amber. Going through the grey keeps the in-between
// colours clean instead of muddy.
const COOL = "#8ea6c8";
const NEUTRAL = "#bdbdbd";
const WARM = "#f2b24e";

// The thumb is a face: its mouth bends from frown to grin with the value,
// worried brows fade in at the low end, and the eyes smile shut at the top.
function Face({
  value,
  blink,
  tilt,
  color,
}: {
  value: MotionValue<number>;
  blink: MotionValue<number>;
  tilt: MotionValue<number>;
  color: MotionValue<string>;
}) {
  const mouth = useTransform(value, (v) => {
    const t = v / 100;
    const corners = 27.5 - t * 2.5; // corners lift as the smile grows
    const mid = 23 + t * 12; // the mouth's belly, above the corners for a frown
    return `M13 ${corners} Q21 ${mid} 29 ${corners}`;
  });
  const brows = useTransform(value, [0, 35], [1, 0]);
  const squint = useTransform(value, [80, 100], [1, 0.62]);
  const eyes = useTransform([squint, blink], ([s, b]: number[]) => s * b);

  return (
    <motion.svg
      viewBox="0 0 42 42"
      className="size-11 drop-shadow-[0_2px_4px_oklch(0_0_0/0.2)]"
      style={{ rotate: tilt }}
      aria-hidden
    >
      <motion.circle cx="21" cy="21" r="20" style={{ fill: color }} />
      <circle cx="21" cy="21" r="20" fill="none" stroke="#000" strokeOpacity="0.08" />
      <motion.g style={{ opacity: brows }} stroke="#1c1c1c" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 13.5l5-1.8" />
        <path d="M30 13.5l-5-1.8" />
      </motion.g>
      <motion.g style={{ scaleY: eyes, originY: "17px" }} fill="#1c1c1c">
        <ellipse cx="15.5" cy="17" rx="1.9" ry="2.2" />
        <ellipse cx="26.5" cy="17" rx="1.9" ry="2.2" />
      </motion.g>
      <motion.path
        d={mouth}
        fill="none"
        stroke="#1c1c1c"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

export function MoodSlider({
  question = "How was your day?",
  defaultValue = 60,
  value: external,
  onChange,
  className,
}: {
  question?: string;
  defaultValue?: number;
  // A motion value to drive it from outside (the card preview).
  value?: MotionValue<number>;
  onChange?: (value: number) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const own = useMotionValue(defaultValue);
  const value = external ?? own;
  const input = useRef<HTMLInputElement>(null);
  const [mood, setMood] = useState(moodOf(value.get()));

  // Only the word re-renders, and only when it changes; everything else
  // follows the value frame by frame without React.
  useEffect(
    () =>
      value.on("change", (v) => {
        setMood(moodOf(v));
        if (input.current && Number(input.current.value) !== Math.round(v)) {
          input.current.value = String(Math.round(v));
        }
      }),
    [value],
  );

  const color = useTransform(value, [0, 50, 100], [COOL, NEUTRAL, WARM]);
  const fill = useTransform(value, (v) => `${v}%`);
  const left = useTransform(value, (v) => `calc(${v / 100} * (100% - 44px))`);
  // Leans into the drag a little, and rights itself when you stop.
  const speed = useVelocity(value);
  const tilt = useSpring(
    useTransform(speed, (s) => (reduceMotion ? 0 : Math.max(-16, Math.min(16, s * 0.06)))),
    { stiffness: 300, damping: 18 },
  );
  const blink = useMotionValue(1);
  const doBlink = () => {
    if (reduceMotion) return;
    animate(blink, [1, 0.1, 1], { duration: 0.22, times: [0, 0.45, 1] });
  };

  return (
    <div
      className={cn(
        "w-[min(380px,100%)] rounded-2xl bg-background p-6 shadow-raised",
        className,
      )}
    >
      <p className="text-[14px] text-muted">{question}</p>
      <div className="relative mt-1 h-8">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.p
            key={mood}
            initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.12 } }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }}
            className="text-[24px] font-semibold tracking-tight text-foreground"
          >
            {MOODS[mood]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="relative mt-5 h-11">
        <div className="absolute inset-x-[22px] top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--border)]">
          <motion.div className="h-full rounded-full" style={{ width: fill, backgroundColor: color }} />
        </div>
        <motion.div className="pointer-events-none absolute top-0" style={{ left }}>
          <Face value={value} blink={blink} tilt={tilt} color={color} />
        </motion.div>
        {/* The real control: a native range, invisible, with a thumb the
            size of the face so dragging lines up exactly. */}
        <input
          ref={input}
          type="range"
          min={0}
          max={100}
          defaultValue={defaultValue}
          aria-label={question}
          aria-valuetext={MOODS[mood]}
          onInput={(e) => {
            const v = Number(e.currentTarget.value);
            value.set(v);
            onChange?.(v);
          }}
          onPointerUp={doBlink}
          onKeyUp={doBlink}
          className="peer absolute inset-0 h-full w-full cursor-grab appearance-none bg-transparent opacity-0 active:cursor-grabbing [&::-moz-range-thumb]:size-11 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:size-11 [&::-webkit-slider-thumb]:appearance-none"
        />
        {/* Focus shows on the face, since the real thumb is invisible. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 size-11 rounded-full outline-2 outline-offset-2 outline-transparent peer-focus-visible:outline-solid peer-focus-visible:outline-[var(--focus-ring)]"
          style={{ left }}
        />
      </div>
      <div className="mt-2 flex justify-between px-1 text-[12px] text-muted">
        <span>Rough</span>
        <span>Great</span>
      </div>
    </div>
  );
}

export default function MoodSliderDemo() {
  const play = usePreviewPlay();
  const value = useMotionValue(60);

  // The card's hover show: a slow slide down to a rough day, a quick swing
  // up to a great one, then settling at good.
  useEffect(() => {
    if (play !== true) return;
    let stopped = false;
    let current: ReturnType<typeof animate> | undefined;
    const to = (v: number, duration: number) =>
      new Promise<void>((done) => {
        current = animate(value, v, { duration, ease: [0.45, 0, 0.55, 1], onComplete: done });
      });
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!stopped) {
        await pause(300);
        if (stopped) break;
        await to(12, 1.3);
        await pause(700);
        if (stopped) break;
        await to(92, 0.9);
        await pause(900);
        if (stopped) break;
        await to(66, 0.8);
        await pause(1200);
      }
    })();
    return () => {
      stopped = true;
      current?.stop();
      animate(value, 60, { duration: 0.4, ease: EASE_OUT });
    };
  }, [play, value]);

  return <MoodSlider value={value} defaultValue={60} />;
}
