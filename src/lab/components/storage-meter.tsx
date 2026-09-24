"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { usePreviewPlay } from "@/lab/preview-play";
import { cn } from "@/lib/cn";

export type StorageCategory = {
  id: string;
  name: string;
  gb: number;
  // Category colours are data, so raw values.
  color: string;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const RESIZE = { type: "spring", duration: 0.6, bounce: 0 } as const;

const gb = (n: number) => `${n.toFixed(1)} GB`;

export function StorageMeter({
  capacity,
  categories,
  cleanable,
  focus: controlledFocus,
  cleared: controlledCleared,
  onClearedChange,
  className,
}: {
  capacity: number;
  categories: StorageCategory[];
  // The category the clean-up action removes.
  cleanable?: string;
  // Drive the highlight and clean-up from outside (the card preview).
  focus?: string | null;
  cleared?: boolean;
  onClearedChange?: (cleared: boolean) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const [clearedState, setClearedState] = useState(false);
  const focus = controlledFocus !== undefined ? controlledFocus : hover;
  const cleared = controlledCleared ?? clearedState;

  const shown = categories.map((c) => ({
    ...c,
    gb: cleared && c.id === cleanable ? 0 : c.gb,
  }));
  const used = shown.reduce((t, c) => t + c.gb, 0);
  const active = shown.find((c) => c.id === focus && c.gb > 0);
  const cleanGb = categories.find((c) => c.id === cleanable)?.gb ?? 0;

  // Each clear gets its own burst of pieces, counted as the state flips
  // (adjusting state during render, so no effect is needed).
  const [lastCleared, setLastCleared] = useState(cleared);
  const [burst, setBurst] = useState(0);
  if (cleared !== lastCleared) {
    setLastCleared(cleared);
    if (cleared) setBurst((b) => b + 1);
  }
  // Where the cleanable slice sits in the bar, as percentages, so the
  // pieces start from it with no measuring.
  const cleanIndex = categories.findIndex((c) => c.id === cleanable);
  const cleanLeft =
    (categories.slice(0, Math.max(0, cleanIndex)).reduce((t, c) => t + c.gb, 0) /
      capacity) *
    100;
  const cleanWidth = (cleanGb / capacity) * 100;

  // The used total counts to its new value instead of jumping. It's a
  // motion value rendered as text, so counting never re-renders anything.
  const usedValue = useMotionValue(used);
  const usedLabel = useTransform(usedValue, gb);
  useEffect(() => {
    if (reduceMotion) return usedValue.set(used);
    const a = animate(usedValue, used, { duration: 0.6, ease: EASE_OUT });
    return () => a.stop();
  }, [used, reduceMotion, usedValue]);

  const setCleared = (next: boolean) => {
    setClearedState(next);
    onClearedChange?.(next);
  };

  const swap = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT };
  const resize = reduceMotion ? { duration: 0 } : RESIZE;

  return (
    <div
      className={cn(
        "w-[min(440px,100%)] rounded-2xl bg-background p-6 shadow-raised",
        className,
      )}
    >
      {/* The headline is the readout: the total, or whatever you point at. */}
      <div className="relative h-12">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={active?.id ?? "total"}
            initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)", transition: { duration: 0.12 } }}
            transition={swap}
          >
            <p className="text-[12px] font-medium text-muted">
              {active ? active.name : "Storage"}
            </p>
            <p className="mt-1 text-[15px] text-muted">
              {active ? (
                <span className="text-[22px] font-semibold tracking-tight text-foreground tabular-nums">
                  {gb(active.gb)}
                </span>
              ) : (
                <>
                  <motion.span className="text-[22px] font-semibold tracking-tight text-foreground tabular-nums">
                    {usedLabel}
                  </motion.span>{" "}
                  of {capacity} GB used
                </>
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-4">
        <div
          aria-hidden
          className="flex h-3 overflow-hidden rounded-full bg-surface"
          onPointerLeave={() => setHover(null)}
        >
          {shown.map((c) => {
            const crushed = cleared && c.id === cleanable;
            return (
              // The slice's width carries its own 2px gap inside it, so a
              // slice shrinking to nothing takes its gap along with it.
              <motion.div
                key={c.id}
                initial={false}
                animate={{ width: `${(c.gb / capacity) * 100}%` }}
                // A crushed slice holds its width a beat, squashed, then
                // the gap closes behind the pieces.
                transition={
                  crushed && !reduceMotion ? { ...RESIZE, delay: 0.3 } : resize
                }
                onPointerEnter={() => setHover(c.id)}
                className="relative h-full shrink-0 overflow-hidden transition-opacity duration-150 ease-out"
                style={{ opacity: focus && focus !== c.id ? 0.3 : 1 }}
              >
                <motion.span
                  className="absolute inset-y-0 left-0 right-[2px] origin-center"
                  initial={false}
                  // Squashes under the press, then hands over to its shards.
                  animate={
                    crushed && !reduceMotion
                      ? { scaleY: 0.45, scaleX: 1.04, opacity: 0 }
                      : { scaleY: 1, scaleX: 1, opacity: 1 }
                  }
                  transition={
                    crushed
                      ? {
                          duration: CRUSH,
                          ease: [0.55, 0, 1, 0.45],
                          // Gone the instant its shards take over.
                          opacity: { delay: CRUSH, duration: 0 },
                        }
                      : { duration: 0.25, ease: EASE_OUT }
                  }
                  style={{ background: c.color }}
                />
              </motion.div>
            );
          })}
        </div>
        {cleared && burst > 0 && !reduceMotion && (
          <Crumble
            key={burst}
            left={cleanLeft}
            width={cleanWidth}
            color={categories[cleanIndex]?.color ?? "currentColor"}
          />
        )}
      </div>

      {/* Holds its three rows even when a category goes, so clearing never
          shrinks the card and moves the button out from under you. */}
      <ul className="mt-5 grid min-h-[6.5rem] auto-rows-min grid-cols-2 gap-x-4 gap-y-1">
        <AnimatePresence initial={false}>
          {shown
            .filter((c) => c.gb > 0)
            .map((c) => (
              <motion.li
                key={c.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.15 } }}
                transition={swap}
              >
                <button
                  type="button"
                  onPointerEnter={() => setHover(c.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(c.id)}
                  onBlur={() => setHover(null)}
                  aria-label={`${c.name}, ${gb(c.gb)}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] outline-hidden transition-[background-color,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground",
                    focus === c.id && "bg-surface",
                    focus && focus !== c.id && "opacity-50",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <span className="flex-1 text-foreground">{c.name}</span>
                  <span className="text-muted tabular-nums">{gb(c.gb)}</span>
                </button>
              </motion.li>
            ))}
        </AnimatePresence>
      </ul>

      {cleanable && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={cleared ? "done" : "offer"}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
              transition={swap}
              className="text-[13px] text-muted"
            >
              {cleared ? `Freed ${gb(cleanGb)}` : `${gb(cleanGb)} can be cleared`}
            </motion.p>
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setCleared(!cleared)}
            className="h-9 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
          >
            {cleared ? "Undo" : "Clear cache"}
          </button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {cleared ? `Cache cleared, ${gb(used)} of ${capacity} GB used` : ""}
      </span>
    </div>
  );
}

// The crushed slice shatters: its own area splits into shards that spray
// out from the middle, arc, spin and fall under gravity, bounce once or
// twice on the shelf below the bar and skid to a stop before fading, while
// a puff of dust drifts down against air drag. Drawn on a canvas that
// exists only for the second or so it runs.
const CRUSH = 0.12; // s the slice spends squashing before it breaks
const TOP = 48; // px of room above the bar for shards to hop into
const BAR = 12; // the bar's height
const SHELF = 18; // px below the bar where the pieces land
const GRAVITY = 900; // px/s²

type Shard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  points: [number, number][];
  shade: number;
  bounces: number;
  resting: boolean;
  life: number;
};
type Dust = { x: number; y: number; vx: number; vy: number; r: number; a: number; life: number };

function Crumble({
  left,
  width,
  color,
}: {
  left: number;
  width: number;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Offsets, not client rects, so a scaled index card draws right too.
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const rand = Math.random;
    const x0 = (left / 100) * W;
    const w = Math.max(6, (width / 100) * W - 2);
    const squashed = BAR * 0.45;
    const y0 = TOP + (BAR - squashed) / 2;
    const cx = x0 + w / 2;
    const floor = TOP + BAR + SHELF;

    // The slice's own area, cut into a grid of uneven, jagged shards.
    const cols = Math.max(3, Math.round(w / 2.6));
    const rows = 3;
    const shards: Shard[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cw = w / cols;
        const ch = squashed / rows;
        const x = x0 + (c + 0.5) * cw;
        const y = y0 + (r + 0.5) * ch;
        const size = Math.max(cw, ch * 1.8) * (0.7 + rand() * 0.6);
        const sides = 4 + Math.floor(rand() * 2);
        const points: [number, number][] = Array.from({ length: sides }, (_, i) => {
          const a = (i / sides) * Math.PI * 2 + rand() * 0.6;
          const d = (size / 2) * (0.6 + rand() * 0.5);
          return [Math.cos(a) * d, Math.sin(a) * d];
        });
        const out = (x - cx) / (w / 2); // -1 at the left edge, 1 at the right
        shards.push({
          x,
          y,
          vx: out * 70 + (rand() - 0.5) * 60,
          vy: -(30 + rand() * 110) - (rows - r) * 12,
          rot: rand() * Math.PI,
          spin: (rand() - 0.5) * 16,
          points,
          shade: rand(),
          bounces: 0,
          resting: false,
          life: 1,
        });
      }
    }
    const dust: Dust[] = Array.from({ length: 34 }, () => ({
      x: cx + (rand() - 0.5) * w,
      y: y0 + rand() * squashed,
      vx: (rand() - 0.5) * 110,
      vy: -(8 + rand() * 55),
      r: 0.4 + rand() * 0.9,
      a: 0.35 + rand() * 0.4,
      life: 0.8 + rand() * 0.5,
    }));

    let raf = 0;
    const start = performance.now();
    let last = start;
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      if (t < CRUSH) {
        raf = requestAnimationFrame(tick);
        return;
      }
      let alive = false;

      for (const s of shards) {
        if (s.life <= 0) continue;
        alive = true;
        if (!s.resting) {
          s.vy += GRAVITY * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.rot += s.spin * dt;
          if (s.y >= floor) {
            s.y = floor;
            // Lands, bounces a little lower each time, then skids.
            if (s.vy > 70 && s.bounces < 2) {
              s.vy *= -0.3;
              s.vx *= 0.55;
              s.spin *= 0.5;
              s.bounces++;
            } else {
              s.vy = 0;
              s.resting = true;
            }
          }
        } else {
          s.vx *= 1 - 8 * dt;
          s.x += s.vx * dt;
          s.spin *= 1 - 8 * dt;
          s.rot += s.spin * dt;
        }
        if (s.resting || t > 1) s.life -= dt * 2.4;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.beginPath();
        s.points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
        ctx.fillStyle = color;
        ctx.fill();
        // Faces catch the light differently as they tumble.
        const light = Math.sin(s.rot * 2 + s.shade * 6);
        ctx.fillStyle = light > 0 ? "rgba(255,255,255,1)" : "rgba(0,0,0,1)";
        ctx.globalAlpha *= Math.abs(light) * 0.2;
        ctx.fill();
        ctx.restore();
      }

      for (const d of dust) {
        if (d.life <= 0) continue;
        alive = true;
        d.vx *= 1 - 3.5 * dt;
        d.vy = (d.vy + 140 * dt) * (1 - 1.8 * dt);
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.life -= dt;
        ctx.globalAlpha = Math.max(0, d.a * Math.min(1, d.life * 1.5));
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (alive) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [left, width, color]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 w-full"
      style={{ top: -TOP, height: TOP + BAR + SHELF + 16 }}
    />
  );
}

const CATEGORIES: StorageCategory[] = [
  { id: "apps", name: "Apps", gb: 14.2, color: "oklch(0.62 0.15 255)" },
  { id: "photos", name: "Photos", gb: 11.6, color: "oklch(0.76 0.14 70)" },
  { id: "docs", name: "Documents", gb: 6.3, color: "oklch(0.68 0.12 160)" },
  { id: "cache", name: "Cache", gb: 2.4, color: "oklch(0.66 0.16 15)" },
  {
    id: "system",
    name: "System",
    gb: 4.1,
    color: "light-dark(oklch(0.72 0 0), oklch(0.5 0 0))",
  },
];

export default function StorageMeterDemo() {
  const play = usePreviewPlay();
  const [demo, setDemo] = useState<{ focus: string | null; cleared: boolean }>({
    focus: null,
    cleared: false,
  });

  // The card's hover show: glance at photos and apps, clear the cache,
  // then put it back.
  useEffect(() => {
    if (play !== true) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = () => {
      at(300, () => setDemo({ focus: "photos", cleared: false }));
      at(1300, () => setDemo({ focus: "apps", cleared: false }));
      at(2300, () => setDemo({ focus: null, cleared: false }));
      at(2800, () => setDemo({ focus: null, cleared: true }));
      at(4800, () => setDemo({ focus: null, cleared: false }));
      at(6000, run);
    };
    run();
    return () => {
      timers.forEach(clearTimeout);
      setDemo({ focus: null, cleared: false });
    };
  }, [play]);

  return (
    <StorageMeter
      capacity={64}
      categories={CATEGORIES}
      cleanable="cache"
      focus={play === true ? demo.focus : undefined}
      cleared={play === true ? demo.cleared : undefined}
    />
  );
}
