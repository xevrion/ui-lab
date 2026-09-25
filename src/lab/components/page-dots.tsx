"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

const DOT = 6;
const PILL = 20;
const GAP = 6;
// How far each edge of the pill travels between two pages.
const STEP = DOT + GAP;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (v: number) => v * v * (3 - 2 * v);
// The leading edge does its travel in the first 60% of the move and the
// trailing edge in the last 60%, so the pill stretches toward the next dot,
// then pulls its tail in after it, like a worm.
const lead = (t: number) => smooth(clamp01(t / 0.6));
const trail = (t: number) => smooth(clamp01((t - 0.4) / 0.6));

/**
 * `progress` is a continuous page index (1.5 is halfway between the second
 * and third page), so the dots can follow a scroll or a drag frame by frame
 * without React rendering anything.
 */
export function PageDots({
  count,
  progress,
  onSelect,
  autoplay,
  className,
}: {
  count: number;
  progress: MotionValue<number>;
  onSelect: (index: number) => void;
  /** Fills the pill over `duration` ms while `running`, then calls `onElapsed`. */
  autoplay?: {
    duration: number;
    running: boolean;
    onElapsed: (active: number) => void;
  };
  className?: string;
}) {
  const [active, setActive] = useState(() => Math.round(progress.get()));
  // Only crossing the halfway point renders, which is what aria-current needs.
  useMotionValueEvent(progress, "change", (p) => setActive(Math.round(p)));

  const fillRef = useRef<HTMLSpanElement>(null);
  const settle = useRef<Animation>(undefined);
  const onElapsed = useRef(autoplay?.onElapsed);
  useEffect(() => {
    onElapsed.current = autoplay?.onElapsed;
  });
  const running = autoplay?.running ?? false;
  const duration = autoplay?.duration ?? 0;

  // The countdown is the timer: when the fill finishes, the page advances.
  // WAAPI keeps it on the compositor with no React state per frame, and
  // restarting it on every page or pause means a resume starts over.
  useEffect(() => {
    const fill = fillRef.current;
    if (!fill || !running) return;
    settle.current?.cancel();
    const countdown = fill.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration, easing: "linear" },
    );
    countdown.onfinish = () => onElapsed.current?.(active);
    return () => {
      countdown.onfinish = null;
      if (countdown.playState !== "running") return;
      // Paused partway: ease the fill back to full over 200ms rather than
      // snapping, so a paused pill reads as solid, not half done.
      const from = getComputedStyle(fill).transform;
      countdown.cancel();
      settle.current = fill.animate(
        [{ transform: from }, { transform: "scaleX(1)" }],
        { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    };
  }, [running, active, duration]);

  useEffect(() => () => settle.current?.cancel(), []);

  // Pill spans [left, right] across the two pages it is between.
  const pill = (p: number) => {
    const k = Math.min(Math.max(Math.floor(p), 0), Math.max(count - 2, 0));
    const t = clamp01(p - k);
    const left = k * STEP + STEP * trail(t);
    const right = k * STEP + PILL + STEP * lead(t);
    return { left, width: right - left };
  };
  const pillX = useTransform(progress, (p) => pill(p).left);
  const pillWidth = useTransform(progress, (p) => pill(p).width);

  return (
    <div
      role="group"
      aria-label="Pages"
      className={cn("relative h-8 [contain:layout]", className)}
      // The row never changes width: the active slot is always one pill
      // wide, whichever dot owns it.
      style={{ width: (count - 1) * STEP + PILL }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot
          key={i}
          index={i}
          count={count}
          progress={progress}
          current={i === active}
          onSelect={onSelect}
        />
      ))}
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 left-0 h-1.5 -translate-y-1/2 overflow-hidden rounded-full",
          // With a countdown the pill's track is a lighter tint, still twice
          // the dots' 20%, so it stays the active slot before it fills.
          autoplay ? "bg-foreground/40" : "bg-foreground",
        )}
        style={{ x: pillX, width: pillWidth }}
      >
        {autoplay && (
          // Rests full, so a paused pill looks exactly like a plain one.
          <span
            ref={fillRef}
            className="absolute inset-0 origin-left bg-foreground"
          />
        )}
      </motion.span>
    </div>
  );
}

function Dot({
  index,
  count,
  progress,
  current,
  onSelect,
}: {
  index: number;
  count: number;
  progress: MotionValue<number>;
  current: boolean;
  onSelect: (index: number) => void;
}) {
  // A dot swells toward pill width as the page approaches, so the gray row
  // makes room for the pill and every gap stays even mid-scroll.
  const width = useTransform(
    progress,
    (p) => DOT + (PILL - DOT) * clamp01(1 - Math.abs(p - index)),
  );
  // Everything before this dot is plain dots, plus however much of the
  // extra pill width sits behind it.
  const left = useTransform(
    progress,
    (p) => index * STEP + (PILL - DOT) * clamp01(index - p),
  );

  return (
    <motion.button
      type="button"
      aria-label={`Page ${index + 1} of ${count}`}
      aria-current={current ? "page" : undefined}
      onClick={() => onSelect(index)}
      // Reaches half the 6px gap past each side of its dot, so the hit areas
      // tile the row with no dead space between them.
      className="group absolute inset-y-0 -ml-[3px] box-content flex touch-manipulation items-center rounded-full px-[3px] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
      style={{ left, width }}
    >
      <span className="h-1.5 w-full rounded-full bg-foreground/20 transition-[background-color,scale] duration-150 ease-out group-hover:bg-foreground/35 group-active:scale-[0.96]" />
    </motion.button>
  );
}

const PAGES = [
  { title: "Inbox zero", note: "Everything triaged before lunch." },
  { title: "Focus time", note: "Two quiet hours blocked every morning." },
  { title: "Weekly review", note: "Friday at four, fifteen minutes." },
  { title: "Shared lists", note: "Groceries, synced with Sam." },
  { title: "Offline mode", note: "Works on the train, syncs later." },
];

// Long enough to read a card's two lines, short enough to feel alive.
const INTERVAL = 3000;
// A scroll counts as over once no scroll event has arrived for this long,
// which also covers the momentum after a flick.
const SCROLL_QUIET = 200;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;

export default function PageDotsDemo() {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);

  // null until the viewer picks, so reduced motion can default to paused.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = (choice ?? !reduceMotion) && play !== false;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [visible, setVisible] = useState(true);
  const running = playing && !hovered && !focused && !scrolling && visible;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // Scroll events can outpace frames on high-rate trackpads; reading
    // layout once per frame is all the dots can show anyway.
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = scroller.scrollWidth - scroller.clientWidth;
      progress.set(
        max > 0 ? (scroller.scrollLeft / max) * (PAGES.length - 1) : 0,
      );
    };

    // Only wheel and touch mark a scroll as the viewer's, so autoplay's own
    // smooth scrolls never pause autoplay.
    let touching = false;
    let busy = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const settleSoon = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        if (touching) return;
        busy = false;
        setScrolling(false);
      }, SCROLL_QUIET);
    };
    const start = () => {
      busy = true;
      setScrolling(true);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
      if (busy) settleSoon();
    };
    const onWheel = () => {
      start();
      settleSoon();
    };
    const onTouchStart = () => {
      touching = true;
      clearTimeout(quiet);
      start();
    };
    const onTouchEnd = () => {
      touching = false;
      settleSoon();
    };

    const passive = { passive: true } as const;
    scroller.addEventListener("scroll", onScroll, passive);
    scroller.addEventListener("wheel", onWheel, passive);
    scroller.addEventListener("touchstart", onTouchStart, passive);
    scroller.addEventListener("touchend", onTouchEnd, passive);
    scroller.addEventListener("touchcancel", onTouchEnd, passive);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      cancelAnimationFrame(frame);
      clearTimeout(quiet);
    };
  }, [progress]);

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const goTo = (index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollTo({
      left: (index / (PAGES.length - 1)) * max,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  // Past the last page it scrolls back to the first rather than jumping,
  // and the pill crawls home through every dot, so the loop reads as a
  // deliberate rewind.
  const advance = (active: number) => goTo((active + 1) % PAGES.length);

  const insideRegion = (node: EventTarget | null) =>
    node instanceof Node &&
    !!regionRef.current?.contains(node) &&
    !toggleRef.current?.contains(node);

  return (
    <div
      ref={regionRef}
      className="flex w-[min(400px,100%)] flex-col items-center gap-4"
      // The toggle is left out on purpose: hovering it to press play must
      // not be what keeps autoplay paused.
      onPointerOver={(e) => {
        if (e.pointerType !== "touch") setHovered(insideRegion(e.target));
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e) => {
        // Only keyboard focus pauses; a mouse click on a dot leaves focus
        // behind that would otherwise hold autoplay forever.
        if (insideRegion(e.target) && e.target.matches(":focus-visible"))
          setFocused(true);
      }}
      onBlur={(e) => {
        if (!insideRegion(e.relatedTarget)) setFocused(false);
      }}
    >
      <div
        ref={scrollerRef}
        tabIndex={0}
        role="region"
        aria-label="Features"
        aria-roledescription="carousel"
        // Announcing every automatic slide would talk over the viewer.
        aria-live={running ? "off" : "polite"}
        // Keeps the horizontal swipe from also scrolling the page sideways
        // or triggering back navigation.
        className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain rounded-[20px] outline-hidden [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-scrollbar]:hidden"
      >
        {PAGES.map((page, i) => (
          <div
            key={page.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${PAGES.length}`}
            className="flex h-55 w-full shrink-0 snap-center snap-always flex-col justify-end rounded-[20px] border border-border bg-background p-6"
          >
            <p className="text-sm text-muted tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-1.5 text-lg font-medium text-foreground">
              {page.title}
            </p>
            <p className="mt-0.5 text-[15px] text-muted">{page.note}</p>
          </div>
        ))}
      </div>
      {/* The 32px toggle sits on the right with a matching 32px spacer on the
          left, so the dots stay centered under the cards. */}
      <div className="flex items-center gap-4">
        <span aria-hidden className="size-8" />
        <PageDots
          count={PAGES.length}
          progress={progress}
          onSelect={goTo}
          autoplay={{ duration: INTERVAL, running, onElapsed: advance }}
        />
        <button
          ref={toggleRef}
          type="button"
          aria-label="Pause autoplay"
          aria-pressed={!playing}
          onClick={() => setChoice(!playing)}
          className="relative flex size-8 touch-manipulation items-center justify-center rounded-full text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color] after:absolute after:-inset-1.5 after:rounded-full"
        >
          <span className="grid" aria-hidden>
            <SwapIcon visible={playing} reduceMotion={reduceMotion}>
              <path d="M5.75 3.75v8.5M10.25 3.75v8.5" />
            </SwapIcon>
            <SwapIcon visible={!playing} reduceMotion={reduceMotion}>
              <path d="M5 3.9v8.2a.6.6 0 0 0 .9.5l6.6-4.1a.6.6 0 0 0 0-1L5.9 3.4a.6.6 0 0 0-.9.5Z" />
            </SwapIcon>
          </span>
        </button>
      </div>
    </div>
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
  // Reduced motion keeps the cross-fade but drops the scale and blur.
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
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
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
    >
      {children}
    </motion.svg>
  );
}
