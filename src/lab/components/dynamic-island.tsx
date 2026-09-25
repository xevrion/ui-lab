"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

export type IslandState = "idle" | "timer" | "music" | "ring";

// Pills keep radius at half their height; the expanded card uses a softer
// corner so it reads as a card, not a capsule.
const SHAPES: Record<
  IslandState,
  { width: number; height: number; radius: number }
> = {
  idle: { width: 156, height: 42, radius: 21 },
  timer: { width: 260, height: 46, radius: 23 },
  ring: { width: 220, height: 46, radius: 23 },
  music: { width: 390, height: 100, radius: 36 },
};

const MAX_HEIGHT = Math.max(...Object.values(SHAPES).map((s) => s.height));
// The widest shape is wider than a phone's content column; this caps the
// island and its content at the viewport minus the page gutters instead.
const MAX_WIDTH = "calc(100vw - 2rem)";

// The island is the playful exception: a bounce of 0.25 gives it the
// elastic settle Apple uses. It runs past the 300ms norm because the
// overshoot needs time to read; the content fade stays well under it.
const MORPH = { type: "spring", visualDuration: 0.4, bounce: 0.25 } as const;
const MORPH_REDUCED = { type: "spring", duration: 0.3, bounce: 0 } as const;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Keyframes are right here: the equalizer is an endless loop nothing
// interrupts. Pausing freezes the bars in place rather than snapping them.
const CSS = `
@keyframes dynamic-island-eq {
  from { scale: 1 0.3; }
  to { scale: 1 1; }
}
.dynamic-island-eq > span {
  transform-origin: bottom;
  animation: dynamic-island-eq ease-in-out infinite alternate;
}
.dynamic-island-eq[data-playing="false"] > span {
  animation-play-state: paused;
}
@media (prefers-reduced-motion: reduce) {
  .dynamic-island-eq > span { animation: none; }
}
`;

// Uneven durations and negative delays so the bars never fall into step.
// `rest` is the static height shown under reduced motion.
const BARS = [
  { duration: 520, delay: -120, rest: 0.55 },
  { duration: 760, delay: -400, rest: 0.9 },
  { duration: 610, delay: -250, rest: 0.4 },
  { duration: 840, delay: -600, rest: 0.7 },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatElapsed(seconds: number) {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function describeIsland(
  state: IslandState,
  { elapsed = 0, title = "", playing = false } = {},
) {
  if (state === "timer")
    return `Timer, ${Math.floor(elapsed / 60)}:${pad(elapsed % 60)}`;
  if (state === "music") return `${playing ? "Playing" : "Paused"}, ${title}`;
  if (state === "ring") return "Ringer on";
  return "Idle";
}

export function DynamicIsland({
  state,
  elapsed = 0,
  title = "Midnight City",
  artist = "M83",
  playing = true,
  onPlayingChange,
  className,
}: {
  state: IslandState;
  elapsed?: number;
  title?: string;
  artist?: string;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const shape = SHAPES[state];

  return (
    // Fixed to the tallest state and anchored at the top, so the island
    // grows down and out symmetrically and nothing below it ever moves.
    <div
      className={cn("flex w-full justify-center", className)}
      style={{ height: MAX_HEIGHT }}
    >
      <style href="dynamic-island" precedence="default">
        {CSS}
      </style>
      <motion.div
        initial={false}
        animate={{
          width: shape.width,
          height: shape.height,
          borderRadius: shape.radius,
        }}
        transition={reduceMotion ? MORPH_REDUCED : MORPH}
        style={{ maxWidth: MAX_WIDTH }}
        className="relative overflow-hidden bg-foreground text-background"
      >
        <AnimatePresence initial={false}>
          <Content key={state} state={state} reduceMotion={reduceMotion}>
            {state === "idle" && (
              // A faint lens, like the camera sitting in the real cutout.
              <span className="ml-auto size-3 rounded-full bg-background/15" />
            )}
            {state === "timer" && (
              <>
                <svg
                  viewBox="0 0 16 16"
                  className="size-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="8" cy="9" r="5.25" />
                  <path d="M8 6.5V9l1.5 1.25M6.5 1.75h3" />
                </svg>
                <span className="ml-auto text-[15px] font-semibold tabular-nums">
                  {formatElapsed(elapsed)}
                </span>
              </>
            )}
            {state === "ring" && (
              <>
                <motion.svg
                  viewBox="0 0 16 16"
                  className="size-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  // Swings from the hanger at the top, like a real bell.
                  style={{ transformOrigin: "50% 15%" }}
                  animate={
                    reduceMotion ? undefined : { rotate: [0, -16, 13, -9, 5, 0] }
                  }
                  // One-shot and never interrupted, so keyframes fit. Waits
                  // for the content fade so the wiggle is actually seen.
                  transition={{ duration: 0.6, delay: 0.15, ease: "easeInOut" }}
                >
                  <path d="M4 11.25V7.5a4 4 0 0 1 8 0v3.75l1 1H3Z" />
                  <path d="M6.75 13.75a1.25 1.25 0 0 0 2.5 0" />
                </motion.svg>
                <span className="ml-auto text-sm font-medium">Ringer on</span>
              </>
            )}
            {state === "music" && (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">
                    {title}
                  </span>
                  <span className="truncate text-sm text-background/60">
                    {artist}
                  </span>
                </div>
                <span
                  aria-hidden
                  data-playing={playing}
                  className="dynamic-island-eq flex h-5 items-end gap-1"
                >
                  {BARS.map((bar, i) => (
                    <span
                      key={i}
                      className="h-full w-1 rounded-full bg-background"
                      style={{
                        scale: `1 ${bar.rest}`,
                        animationDuration: `${bar.duration}ms`,
                        animationDelay: `${bar.delay}ms`,
                      }}
                    />
                  ))}
                </span>
                <button
                  type="button"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => onPlayingChange?.(!playing)}
                  className="-mr-1.5 grid size-11 shrink-0 touch-manipulation place-items-center rounded-full outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-background/10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-background active:scale-[0.96] motion-reduce:transition-[background-color]"
                >
                  <SwapIcon visible={!playing} reduceMotion={reduceMotion}>
                    {/* Starts right of center so the triangle's mass, not its
                        box, sits in the middle of the circle. */}
                    <path d="M5.5 3.5v9l7-4.5Z" fill="currentColor" />
                  </SwapIcon>
                  <SwapIcon visible={playing} reduceMotion={reduceMotion}>
                    <path d="M5 3.5v9M11 3.5v9" />
                  </SwapIcon>
                </button>
              </>
            )}
          </Content>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Each state's content is laid out at its own final size and centered, so
// text never reflows or stretches while the pill morphs around it; the
// pill's overflow clips it until the shape catches up.
function Content({
  state,
  reduceMotion,
  children,
}: {
  state: IslandState;
  reduceMotion: boolean | null;
  children: React.ReactNode;
}) {
  const present = useIsPresent();
  const shape = SHAPES[state];
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, filter: "blur(4px)", scale: 0.95 };
  return (
    <motion.div
      initial={hidden}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      // Old content clears out fast; the new one waits a beat so the two
      // never read as overlapping text.
      exit={{
        opacity: 0,
        filter: reduceMotion ? "blur(0px)" : "blur(4px)",
        transition: { duration: 0.12, ease: EASE_OUT },
      }}
      transition={{ duration: 0.25, delay: 0.08, ease: EASE_OUT }}
      className={cn(
        "absolute inset-x-0 top-0 mx-auto flex items-center gap-4",
        state === "music" ? "px-6" : "px-[18px]",
        // Leaving content must never catch a click meant for the new state.
        !present && "pointer-events-none",
      )}
      style={{ width: shape.width, height: shape.height, maxWidth: MAX_WIDTH }}
    >
      {children}
    </motion.div>
  );
}

function SwapIcon({
  visible,
  reduceMotion,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean | null;
  children: React.ReactNode;
}) {
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
  return (
    <motion.svg
      viewBox="0 0 16 16"
      className="col-start-1 row-start-1 size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
    >
      {children}
    </motion.svg>
  );
}

const OPTIONS: { value: IslandState; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "timer", label: "Timer" },
  { value: "music", label: "Music" },
  { value: "ring", label: "Ring" },
];

const TITLE = "Midnight City";

export default function DynamicIslandDemo() {
  const play = usePreviewPlay();
  const [state, setState] = useState<IslandState>("timer");
  // Starts partway in so the timer reads as already running.
  const [elapsed, setElapsed] = useState(12);
  const [playing, setPlaying] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const buttons = useRef(new Map<IslandState, HTMLButtonElement>());

  useEffect(() => {
    if (state !== "timer" || play === false) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state, play]);

  // Announced once per change rather than on every tick, so a screen
  // reader is not read the clock every second.
  const select = (next: IslandState) => {
    setState(next);
    setAnnouncement(describeIsland(next, { elapsed, title: TITLE, playing }));
  };

  const togglePlaying = (next: boolean) => {
    setPlaying(next);
    setAnnouncement(describeIsland("music", { title: TITLE, playing: next }));
  };

  return (
    <div className="flex w-[420px] max-w-full flex-col items-center gap-8">
      <DynamicIsland
        state={state}
        elapsed={elapsed}
        title={TITLE}
        playing={playing}
        onPlayingChange={togglePlaying}
      />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      <div
        role="radiogroup"
        aria-label="Island state"
        className="flex gap-1 rounded-full bg-surface p-1.5 shadow-raised"
        onKeyDown={(e) => {
          const index = OPTIONS.findIndex((o) => o.value === state);
          const target = {
            ArrowRight: index + 1,
            ArrowDown: index + 1,
            ArrowLeft: index - 1,
            ArrowUp: index - 1,
            Home: 0,
            End: OPTIONS.length - 1,
          }[e.key];
          if (target === undefined) return;
          e.preventDefault();
          const next =
            OPTIONS[(target + OPTIONS.length) % OPTIONS.length].value;
          select(next);
          buttons.current.get(next)?.focus();
        }}
      >
        {OPTIONS.map((option) => {
          const checked = option.value === state;
          return (
            <button
              key={option.value}
              ref={(el) => {
                if (el) buttons.current.set(option.value, el);
                else buttons.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => select(option.value)}
              className={cn(
                "h-9 touch-manipulation rounded-full px-4 text-sm font-medium outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]",
                checked
                  ? "bg-background text-foreground shadow-raised"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
