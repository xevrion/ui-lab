"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

// Long enough to read a short caption, the same as Instagram's default.
const DURATION = 4000;
// Shorter presses are taps that navigate; longer ones are holds that pause.
const HOLD_MS = 200;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;

export type Story = { value: string; caption: string };

export function StoryProgress({
  stories,
  className,
}: {
  stories: Story[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const play = usePreviewPlay();
  const [index, setIndex] = useState(0);
  // Auto-advancing stays silent; only stories the user moved to are announced.
  const [manual, setManual] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [held, setHeld] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [hidden, setHidden] = useState(false);

  const paused = pressing || toggled || hidden || play === false;
  const pausedRef = useRef(paused);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const timer = useRef<Animation>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const count = stories.length;

  const go = (step: number) => {
    setManual(true);
    setIndex((i) => (i + step + count) % count);
  };

  // A compositor-driven transform animation is the timer itself: when it
  // finishes, the story advances, so the bar and the content can't drift.
  useEffect(() => {
    const fill = fills.current[index];
    if (!fill) return;
    const animation = fill.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: DURATION, easing: "linear", fill: "forwards" },
    );
    if (pausedRef.current) animation.pause();
    animation.onfinish = () => {
      setManual(false);
      setIndex((i) => (i + 1) % count);
    };
    timer.current = animation;
    return () => animation.cancel();
  }, [index, count]);

  useEffect(() => {
    pausedRef.current = paused;
    const animation = timer.current;
    if (!animation) return;
    if (paused) animation.pause();
    else if (animation.playState === "paused") animation.play();
  }, [paused]);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const release = (navigate: boolean, clientX = 0, box?: DOMRect) => {
    clearTimeout(holdTimer.current);
    setPressing(false);
    if (held) setHeld(false);
    else if (navigate && box) go(clientX < box.left + box.width / 2 ? -1 : 1);
  };

  const story = stories[index];
  const dimmed = held || toggled;

  return (
    <div
      role="region"
      aria-roledescription="stories"
      aria-label="Stories"
      tabIndex={0}
      className={cn(
        "relative flex h-[480px] w-[min(320px,100%)] touch-manipulation flex-col overflow-hidden rounded-3xl bg-surface text-foreground shadow-raised outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
        className,
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        // The fill freezes the moment you press; the dim waits until it is
        // clearly a hold, so quick taps don't flicker.
        setPressing(true);
        holdTimer.current = setTimeout(() => setHeld(true), HOLD_MS);
      }}
      onPointerUp={(e) =>
        release(true, e.clientX, e.currentTarget.getBoundingClientRect())
      }
      onPointerCancel={() => release(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
        else if (e.key === " " && !e.repeat) setToggled((t) => !t);
        else return;
        e.preventDefault();
      }}
    >
      <div className="flex gap-1 px-3 pt-3" aria-hidden>
        {stories.map((_, i) => (
          <span
            key={i}
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/15"
          >
            <span
              ref={(el) => {
                fills.current[i] = el;
              }}
              className="block h-full origin-left rounded-full bg-foreground"
              style={{ transform: `scaleX(${i < index ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>

      <div className="flex h-11 items-center justify-between px-4">
        <span className="text-xs text-muted tabular-nums">
          {index + 1} / {count}
        </span>
        {/* Static cue for the paused state, so the frozen bar isn't the only signal. */}
        <button
          type="button"
          aria-label={toggled ? "Play" : "Pause"}
          className="relative -mr-2 grid size-10 place-items-center rounded-full text-muted transition-[scale,color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Let Space reach the button's own click instead of toggling twice.
            if (e.key === " " || e.key === "Enter") e.stopPropagation();
          }}
          onClick={() => setToggled((t) => !t)}
        >
          <PlayPause paused={dimmed} />
        </button>
      </div>

      <div
        className={cn(
          "relative flex-1 transition-[opacity] duration-200 ease-out",
          dimmed && "opacity-60",
        )}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            aria-hidden
            className="absolute inset-0 flex flex-col justify-end gap-2 p-6"
            initial={{ opacity: 0, filter: reduce ? "blur(0px)" : "blur(4px)" }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] },
            }}
            exit={{
              opacity: 0,
              filter: reduce ? "blur(0px)" : "blur(4px)",
              transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] },
            }}
          >
            <span className="text-7xl font-medium tracking-tight tabular-nums">
              {story.value}
            </span>
            <span className="text-[15px] text-pretty text-muted">
              {story.caption}
            </span>
          </motion.div>
        </AnimatePresence>
        {/* A persistent region: one that mounts with its content is rarely read. */}
        <p className="sr-only" aria-live={manual ? "polite" : "off"}>
          {story.value}. {story.caption}
        </p>
      </div>

      {/* Reachable by screen readers; pointer taps are handled by the card,
          so a real click (detail > 0) is ignored here to avoid a double step. */}
      <div className="absolute inset-x-0 top-[60px] bottom-0 flex">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Previous story"
          className="flex-1 outline-hidden"
          onClick={(e) => e.detail === 0 && go(-1)}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Next story"
          className="flex-1 outline-hidden"
          onClick={(e) => e.detail === 0 && go(1)}
        />
      </div>
    </div>
  );
}

function PlayPause({ paused }: { paused: boolean }) {
  return (
    <span className="grid size-4">
      <motion.svg
        viewBox="0 0 16 16"
        className="col-start-1 row-start-1 size-4"
        fill="currentColor"
        initial={false}
        animate={
          paused
            ? { scale: 0.25, opacity: 0, filter: "blur(4px)" }
            : { scale: 1, opacity: 1, filter: "blur(0px)" }
        }
        transition={ICON_SWAP}
      >
        <rect x="4" y="3" width="2.5" height="10" rx="1" />
        <rect x="9.5" y="3" width="2.5" height="10" rx="1" />
      </motion.svg>
      <motion.svg
        viewBox="0 0 16 16"
        className="col-start-1 row-start-1 size-4"
        fill="currentColor"
        initial={false}
        animate={
          paused
            ? { scale: 1, opacity: 1, filter: "blur(0px)" }
            : { scale: 0.25, opacity: 0, filter: "blur(4px)" }
        }
        transition={ICON_SWAP}
      >
        {/* Nudged right of centre so the triangle looks optically centred. */}
        <path d="M5.5 3.4v9.2a.6.6 0 0 0 .9.5l7-4.6a.6.6 0 0 0 0-1L6.4 2.9a.6.6 0 0 0-.9.5Z" />
      </motion.svg>
    </span>
  );
}

const STORIES: Story[] = [
  { value: "12k", caption: "People tried the lab this week." },
  { value: "4.8", caption: "Average rating across every component." },
  { value: "38%", caption: "Fewer layout shifts since the last release." },
  { value: "212", caption: "Commits that were only about easing curves." },
  { value: "0", caption: "Components that animate from scale zero." },
];

export default function StoryProgressDemo() {
  return <StoryProgress stories={STORIES} />;
}
