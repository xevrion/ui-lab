"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// Track clicks and keys glide the thumb over; a spring so a drag that
// starts on the track can keep retargeting it without restarting.
const GLIDE = { type: "spring", visualDuration: 0.2, bounce: 0 } as const;

type Thumb = 0 | 1;
type Drag = { thumb: Thumb; gliding: boolean; offset: number };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

const usd = (v: number) => `$${v.toLocaleString("en-US")}`;

export function RangeSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format = String,
  className,
}: {
  label: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [low, high] = value;
  const span = max - min;
  const toFraction = (v: number) => (v - min) / span;

  const lowPos = useMotionValue(toFraction(low));
  const highPos = useMotionValue(toFraction(high));
  const positions = [lowPos, highPos] as const;
  // The fill is one full-width bar, shifted and scaled, so it never lays out.
  const fill = useTransform(
    [lowPos, highPos],
    ([a, b]: number[]) => `translateX(${a * 100}%) scaleX(${b - a})`,
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<Drag | null>(null);
  const glides = useRef<(AnimationPlaybackControls | undefined)[]>([]);
  const [active, setActive] = useState<Thumb | null>(null);

  useEffect(() => {
    const sync = (thumb: Thumb, v: number) => {
      const mv = thumb === 0 ? lowPos : highPos;
      const target = (v - min) / span;
      if (mv.get() === target) return;
      const d = drag.current;
      glides.current[thumb]?.stop();
      if (reduceMotion || (d?.thumb === thumb && !d.gliding)) mv.jump(target);
      else glides.current[thumb] = animate(mv, target, GLIDE);
    };
    sync(0, low);
    sync(1, high);
  }, [low, high, min, span, reduceMotion, lowPos, highPos]);

  useEffect(() => {
    const running = glides.current;
    return () => running.forEach((g) => g?.stop());
  }, []);

  // Thumbs stop at each other rather than push. In a filter, pushing would
  // quietly change the bound the user isn't touching.
  const commit = (thumb: Thumb, v: number) => {
    const next = Math.round((v - min) / step) * step + min;
    const bounded =
      thumb === 0 ? clamp(next, min, high - step) : clamp(next, low + step, max);
    if (bounded === value[thumb]) return;
    onChange(thumb === 0 ? [bounded, high] : [low, bounded]);
  };

  const fractionAt = (clientX: number) => {
    const box = trackRef.current!.getBoundingClientRect();
    return clamp((clientX - box.left) / box.width, 0, 1);
  };

  const onKeyDown = (thumb: Thumb) => (e: React.KeyboardEvent) => {
    const big = step * 10;
    const current = value[thumb];
    const delta: Record<string, number> = {
      ArrowRight: e.shiftKey ? big : step,
      ArrowUp: e.shiftKey ? big : step,
      ArrowLeft: e.shiftKey ? -big : -step,
      ArrowDown: e.shiftKey ? -big : -step,
      PageUp: big,
      PageDown: -big,
      Home: -Infinity,
      End: Infinity,
    };
    if (!(e.key in delta)) return;
    e.preventDefault();
    commit(thumb, clamp(current + delta[e.key], min, max));
  };

  const end = () => {
    drag.current = null;
    setActive(null);
  };

  const summary = `${format(low)} to ${format(high)}`;

  return (
    <div className={cn("flex w-[min(440px,100%)] flex-col gap-3 [&_input]:max-sm:text-[16px]", className)}>
      <div className="flex items-baseline justify-between">
        <span id={`${id}-label`} className="text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="text-sm text-muted tabular-nums">{summary}</span>
      </div>

      {/* Tall enough for a 44px touch target, with room above for the tooltip. */}
      <div
        ref={trackRef}
        role="group"
        aria-labelledby={`${id}-label`}
        className="relative mt-8 h-11 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const f = fractionAt(e.clientX);
          const onThumb = (e.target as HTMLElement).closest<HTMLElement>("[data-thumb]");
          let thumb: Thumb;
          if (onThumb) thumb = Number(onThumb.dataset.thumb) as Thumb;
          else {
            const toLow = Math.abs(f - lowPos.get());
            const toHigh = Math.abs(f - highPos.get());
            // Stacked thumbs tie, so the side of the click decides.
            thumb = toLow === toHigh ? (f < lowPos.get() ? 0 : 1) : toLow < toHigh ? 0 : 1;
          }
          e.preventDefault();
          thumbRefs.current[thumb]?.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          // Grabbing a thumb off-center keeps that offset, so it never jumps.
          drag.current = {
            thumb,
            gliding: !onThumb,
            offset: onThumb ? f - positions[thumb].get() : 0,
          };
          setActive(thumb);
          if (!onThumb) commit(thumb, min + f * span);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          commit(d.thumb, min + (fractionAt(e.clientX) - d.offset) * span);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-border">
          <motion.div
            className="h-full origin-left bg-foreground"
            style={{ transform: fill }}
          />
        </div>
        {([0, 1] as const).map((thumb) => (
          <ThumbHandle
            key={thumb}
            ref={(el) => {
              thumbRefs.current[thumb] = el;
            }}
            thumb={thumb}
            position={positions[thumb]}
            value={value[thumb]}
            min={min}
            max={max}
            label={thumb === 0 ? `Minimum ${label.toLowerCase()}` : `Maximum ${label.toLowerCase()}`}
            text={format(value[thumb])}
            dragging={active === thumb}
            // The active thumb sits on top; at rest, the one nearer an end
            // yields, so stacked thumbs can always be pulled apart.
            raised={active === null ? (thumb === 0) === low > (min + max) / 2 : active === thumb}
            onKeyDown={onKeyDown(thumb)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <ValueField
          label="Min"
          name={`Minimum ${label.toLowerCase()}`}
          value={low}
          onCommit={(v) => commit(0, v)}
        />
        <span aria-hidden className="h-px w-3 shrink-0 bg-border" />
        <ValueField
          label="Max"
          name={`Maximum ${label.toLowerCase()}`}
          value={high}
          onCommit={(v) => commit(1, v)}
        />
      </div>
    </div>
  );
}

function ThumbHandle({
  ref,
  thumb,
  position,
  value,
  min,
  max,
  label,
  text,
  dragging,
  raised,
  onKeyDown,
}: {
  ref: React.Ref<HTMLDivElement>;
  thumb: Thumb;
  position: MotionValue<number>;
  value: number;
  min: number;
  max: number;
  label: string;
  text: string;
  dragging: boolean;
  raised: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  // A full-width layer moved by a percentage of the track, so the thumb
  // rides on transform alone.
  const transform = useTransform(position, (p) => `translateX(${p * 100}%)`);
  return (
    <motion.div
      className={cn("pointer-events-none absolute inset-0", raised && "z-10")}
      style={{ transform }}
    >
      <div
        ref={ref}
        data-thumb={thumb}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        onKeyDown={onKeyDown}
        data-dragging={dragging || undefined}
        className={cn(
          "group pointer-events-auto absolute top-1/2 left-0 size-5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full bg-background shadow-raised outline-hidden",
          "transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground data-dragging:scale-[0.96] motion-reduce:transition-none",
          // A 44px hit area around the 20px knob.
          "after:absolute after:-inset-3 after:rounded-full",
        )}
      >
        <span className="absolute inset-[6px] rounded-full bg-foreground" aria-hidden />
        {/* Shown while dragging or keyboard-focused. In over 150ms, out in
            100ms, so it never lingers behind the thumb. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 origin-bottom rounded-full bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background tabular-nums",
            "transition-[opacity,translate,scale] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
            dragging
              ? "translate-y-0 scale-100 opacity-100 duration-150"
              : "translate-y-1 scale-[0.97] opacity-0 duration-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 group-focus-visible:duration-150 motion-reduce:translate-y-0 motion-reduce:scale-100",
          )}
        >
          {text}
        </span>
      </div>
    </motion.div>
  );
}

function ValueField({
  label,
  name,
  value,
  onCommit,
}: {
  label: string;
  name: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  // Null while not editing, so the field follows the slider until typed in.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(/[^\d.]/g, ""));
    if (draft.trim() !== "" && Number.isFinite(parsed)) onCommit(parsed);
    setDraft(null);
  };

  return (
    <label
      htmlFor={id}
      className="flex h-10 flex-1 cursor-text items-center gap-1.5 rounded-lg bg-surface px-3 text-sm shadow-raised outline-offset-2 outline-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid"
    >
      <span className="text-muted">{label}</span>
      <span className="ml-auto text-muted" aria-hidden>
        $
      </span>
      <input
        id={id}
        aria-label={name}
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-16 min-w-0 bg-transparent text-right text-foreground tabular-nums outline-hidden"
      />
    </label>
  );
}

export default function RangeSliderDemo() {
  const [range, setRange] = useState<[number, number]>([200, 750]);
  return (
    <RangeSlider
      label="Price"
      value={range}
      onChange={setRange}
      min={0}
      max={1000}
      step={10}
      format={usd}
    />
  );
}
