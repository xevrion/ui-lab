"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Testimonial = {
  quote: string;
  // The phrase to mark: must appear in `quote` exactly as written.
  highlight: string;
  name: string;
  role: string;
  // Falls back to initials.
  avatar?: string;
};

type Line = { x: number; y: number; w: number; h: number };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// A marker covers about this many pixels a second: slow enough to watch the
// stroke travel, quick enough that a long phrase is done in about a second.
const MARKER_SPEED = 620;
// Where the swipe starts after the quote begins fading up, so the stroke
// lands on text you can already read.
const MARK_DELAY = 380;
// The stroke covers the middle of the line box, not all of it, the way a
// real highlighter sits over the x-height and leaves the leading clear.
const COVER_TOP = 0.2;
const COVER = 0.7;
// Ink runs slightly past the words at both ends, like a hand that starts a
// hair early and lifts a hair late.
const OVERSHOOT = 4;

// Seeded so the same line always gets the same ragged edge, on the server
// and the client alike.
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A highlighter stroke: a chisel tip leaves slanted ends, and the edges
// wobble a little along the way, top and bottom independently.
function strokePath(w: number, h: number, seed: number) {
  const next = random(seed);
  const step = 10;
  const wobble = () => (next() - 0.5) * 2.2;
  const top: string[] = [];
  const bottom: string[] = [];
  const slant = h * 0.28;
  for (let x = slant; x <= w; x += step) {
    top.push(`${x.toFixed(1)} ${(1.2 + wobble()).toFixed(1)}`);
  }
  top.push(`${w.toFixed(1)} ${(1 + wobble()).toFixed(1)}`);
  for (let x = w - slant; x >= 0; x -= step) {
    bottom.push(`${x.toFixed(1)} ${(h - 1.2 + wobble()).toFixed(1)}`);
  }
  bottom.push(`0 ${(h - 1 + wobble()).toFixed(1)}`);
  return `M${top.join(" L")} L${bottom.join(" L")} Z`;
}

export function TestimonialHighlight({
  testimonials,
  interval = 7000,
  className,
}: {
  testimonials: Testimonial[];
  // How long each quote stays, in ms, once its highlight is drawn.
  interval?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef, { amount: 0.5 });
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  // The swipe for the current quote has finished, so the author can come in
  // and the countdown can start.
  const [marked, setMarked] = useState(false);
  const barRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<Animation | null>(null);
  const n = testimonials.length;

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const go = useCallback(
    (i: number) => {
      setMarked(false);
      setIndex(((i % n) + n) % n);
    },
    [n],
  );

  // The countdown is an animation on the progress bar itself, so pausing it
  // pauses the bar and the timer together and they can never drift apart.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !marked) return;
    const run = bar.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      {
        duration: interval,
        easing: "linear",
        fill: "forwards",
      },
    );
    run.onfinish = () => go(index + 1);
    timer.current = run;
    return () => {
      run.onfinish = null;
      run.cancel();
      timer.current = null;
    };
  }, [marked, index, interval, go]);

  const holding = hovered || focused || paused || hidden || !inView;
  useEffect(() => {
    const run = timer.current;
    if (!run) return;
    if (holding) run.pause();
    else run.play();
  }, [holding, marked, index]);

  const current = testimonials[index];

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Customer testimonials"
      onPointerEnter={(e) => e.pointerType !== "touch" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // Keyboard focus holds the rotation; a mouse click on a dot shouldn't
      // leave it paused until the next click elsewhere.
      onFocus={(e) => setFocused(e.target.matches(":focus-visible"))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
      className={cn(
        "flex w-[min(540px,100%)] flex-col gap-6 rounded-[22px] bg-background p-5 shadow-raised sm:gap-7 sm:p-7",
        className,
      )}
    >
      {/* Every quote shares one grid cell, so the card is always as tall as
          the longest and never jumps between quotes. */}
      <div className="grid gap-4">
        {/* A plain opening mark, quiet enough to leave the ink the only
            colour in the card. */}
        <svg
          aria-hidden
          viewBox="0 0 32 24"
          className="h-5 w-[27px] fill-foreground/15"
        >
          <path d="M0 24V14.4C0 6.6 4.2 1.8 12.4 0l1.4 3.4C9.4 4.8 7.3 7.6 7 11.2h6.2V24H0Zm18.2 0V14.4C18.2 6.6 22.4 1.8 30.6 0L32 3.4c-4.4 1.4-6.5 4.2-6.8 7.8h6.2V24H18.2Z" />
        </svg>
        <div className="grid">
          {testimonials.map((t, i) => (
            <Quote
              key={t.name}
              testimonial={t}
              state={
                i === index
                  ? "active"
                  : i === (index - 1 + n) % n
                    ? "past"
                    : "future"
              }
              play={i === index && inView}
              reduceMotion={reduceMotion}
              onMarked={() => i === index && setMarked(true)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative h-11 min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {marked && (
              <motion.figcaption
                key={current.name}
                initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  filter: "blur(2px)",
                  transition: { duration: 0.15 },
                }}
                transition={{
                  duration: reduceMotion ? 0 : 0.35,
                  ease: EASE_OUT,
                }}
                className="absolute inset-0 flex items-center gap-3"
              >
                <Avatar testimonial={current} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">
                    {current.name}
                  </span>
                  <span className="truncate text-[13px] text-muted">
                    {current.role}
                  </span>
                </span>
              </motion.figcaption>
            )}
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div
            role="group"
            aria-label="Choose a testimonial"
            className="flex items-center"
          >
            {testimonials.map((t, i) => {
              const on = i === index;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Testimonial from ${t.name}`}
                  aria-current={on ? "true" : undefined}
                  className="group flex h-9 w-6 touch-manipulation items-center justify-center rounded-full outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
                >
                  <span
                    className={cn(
                      "relative h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.77,0,0.175,1)]",
                      on
                        ? "w-5 bg-border"
                        : "w-1.5 bg-border group-hover:bg-muted",
                    )}
                  >
                    {on && (
                      <span
                        ref={barRef}
                        className="absolute inset-0 origin-left rounded-full bg-foreground"
                        style={{ transform: "scaleX(0)" }}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume rotation" : "Pause rotation"}
            aria-pressed={paused}
            className="flex size-9 touch-manipulation items-center justify-center rounded-full text-muted outline-hidden transition-[scale,color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
          >
            <PlayPause paused={paused} />
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live={holding ? "polite" : "off"}>
        {`${current.quote} ${current.name}, ${current.role}`}
      </p>
    </section>
  );
}

function Quote({
  testimonial,
  state,
  play,
  reduceMotion,
  onMarked,
}: {
  testimonial: Testimonial;
  state: "active" | "past" | "future";
  play: boolean;
  reduceMotion: boolean;
  onMarked: () => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const strokes = useRef<(SVGSVGElement | null)[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const drawn = useRef(false);
  const done = useRef(onMarked);
  const filterId = useId().replace(/:/g, "");
  useEffect(() => {
    done.current = onMarked;
  });

  const { quote, highlight } = testimonial;
  const at = quote.indexOf(highlight);
  const before = at >= 0 ? quote.slice(0, at) : quote;
  const after = at >= 0 ? quote.slice(at + highlight.length) : "";

  // One rect per line the phrase wraps onto, in the paragraph's own space.
  // Remeasured on resize, since a new width rewraps the words.
  useLayoutEffect(() => {
    const text = textRef.current;
    const mark = markRef.current;
    if (!text || !mark) return;
    const measure = () => {
      const base = text.getBoundingClientRect();
      // Client rects are in screen pixels, after every ancestor's transform.
      // Dividing by the on-screen scale puts them back in the paragraph's own
      // space, so the marks still land when the whole card is scaled, as in
      // the index preview. Subtracting the paragraph's rect removes the
      // fade-up's offset.
      const scale = base.width / text.offsetWidth || 1;
      const rects = [...mark.getClientRects()].filter((r) => r.width > 1);
      setLines(
        rects.map((r) => ({
          x: (r.left - base.left) / scale - OVERSHOOT,
          y: (r.top - base.top) / scale + (r.height / scale) * COVER_TOP,
          w: r.width / scale + OVERSHOOT * 2,
          h: (r.height / scale) * COVER,
        })),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(text);
    return () => ro.disconnect();
  }, []);

  // Draws line by line, left to right, each at the same pen speed so a
  // short last line takes less time than a long first one.
  useEffect(() => {
    const svgs = strokes.current
      .slice(0, lines.length)
      .filter(Boolean) as SVGSVGElement[];
    if (state !== "active") {
      drawn.current = false;
      // Wiped only once the quote has faded, so it never visibly un-draws.
      const t = setTimeout(
        () => svgs.forEach((s) => (s.style.clipPath = "inset(0 100% 0 0)")),
        300,
      );
      return () => clearTimeout(t);
    }
    if (!play || !svgs.length) return;
    if (drawn.current || reduceMotion) {
      svgs.forEach((s) => (s.style.clipPath = "inset(0 0 0 0)"));
      if (!drawn.current) {
        drawn.current = true;
        done.current();
      }
      return;
    }
    let delay = MARK_DELAY;
    const runs = svgs.map((svg, i) => {
      const duration = (lines[i].w / MARKER_SPEED) * 1000;
      const first = i === 0;
      const last = i === svgs.length - 1;
      // The pen accelerates off the first word and slows onto the last;
      // lines in between run at an even speed so the stroke reads as one.
      const easing =
        first && last
          ? "cubic-bezier(0.45, 0, 0.3, 1)"
          : first
            ? "cubic-bezier(0.45, 0, 1, 1)"
            : last
              ? "cubic-bezier(0, 0, 0.3, 1)"
              : "linear";
      const run = svg.animate(
        [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
        { duration, delay, easing, fill: "forwards" },
      );
      delay += duration;
      return run;
    });
    const lastRun = runs[runs.length - 1];
    lastRun.onfinish = () => {
      svgs.forEach((s) => (s.style.clipPath = "inset(0 0 0 0)"));
      runs.forEach((r) => r.cancel());
      drawn.current = true;
      done.current();
    };
    return () => {
      lastRun.onfinish = null;
      runs.forEach((r) => r.cancel());
    };
  }, [state, play, lines, reduceMotion]);

  return (
    <blockquote
      aria-hidden={state !== "active"}
      className={cn(
        "[grid-area:1/1] transition-[opacity,translate,filter,visibility] motion-reduce:translate-y-0 motion-reduce:filter-none",
        state === "active" &&
          "translate-y-0 opacity-100 filter-none duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
        // Leaving is quicker and quieter than arriving.
        state === "past" &&
          "-translate-y-1 opacity-0 blur-[2px] duration-200 ease-out",
        state === "future" && "translate-y-3 opacity-0 blur-[4px] duration-0",
        // Hidden from pointers and find-in-page once faded; visibility flips
        // at the end of the fade, so the fade itself still shows.
        state !== "active" && "invisible",
      )}
    >
      <p
        ref={textRef}
        className="relative isolate text-[18px] leading-[1.55] font-medium tracking-[-0.01em] text-pretty sm:text-[20px]"
      >
        <svg aria-hidden className="absolute size-0">
          {/* Highlighter ink is uneven: a little streaking along the stroke
              and edges that bleed into the paper fibres. */}
          <filter id={filterId} x="-2%" y="-20%" width="104%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05 0.3"
              numOctaves={2}
              seed={3}
              result="grain"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="grain"
              scale={1.6}
              result="edge"
            />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006 0.5"
              numOctaves={1}
              seed={9}
              result="streak"
            />
            <feColorMatrix
              in="streak"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.45 1.15"
              result="mask"
            />
            <feComposite in="edge" in2="mask" operator="in" />
          </filter>
        </svg>
        {lines.map((line, i) => (
          <svg
            key={`${i}-${Math.round(line.w)}`}
            ref={(el) => void (strokes.current[i] = el)}
            aria-hidden
            className="pointer-events-none absolute -z-10 overflow-visible"
            style={{
              left: line.x,
              top: line.y,
              width: line.w,
              height: line.h,
              // Always mounts undrawn; the draw effect reveals it, instantly
              // if this quote was already marked before a rewrap.
              clipPath: "inset(0 100% 0 0)",
            }}
            viewBox={`0 0 ${line.w} ${line.h}`}
          >
            <path
              d={strokePath(line.w, line.h, (i + 1) * 97 + quote.length)}
              filter={`url(#${filterId})`}
              // Highlighter ink is a physical material, so it keeps its
              // colour: bright fluorescent yellow on paper, a deep gold in
              // dark mode so light text on it stays readable.
              className="fill-[oklch(0.91_0.17_100)] opacity-80 dark:fill-[oklch(0.5_0.11_88)] dark:opacity-90"
            />
          </svg>
        ))}
        <span>{before}</span>
        <mark ref={markRef} className="bg-transparent text-inherit">
          {highlight}
        </mark>
        <span>{after}</span>
      </p>
    </blockquote>
  );
}

function Avatar({ testimonial }: { testimonial: Testimonial }) {
  const initials = testimonial.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[oklch(0.97_0_0)] text-[14px] font-semibold text-[oklch(0.3_0_0)] outline-1 -outline-offset-1 outline-[oklch(0_0_0/0.1)] dark:outline-[oklch(1_0_0/0.1)]">
      {testimonial.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={testimonial.avatar}
          alt=""
          className="size-full"
          draggable={false}
        />
      ) : (
        initials
      )}
    </span>
  );
}

function PlayPause({ paused }: { paused: boolean }) {
  return (
    <span className="relative size-4">
      <AnimatePresence initial={false}>
        <motion.svg
          key={paused ? "play" : "pause"}
          viewBox="0 0 16 16"
          className="absolute inset-0 size-4"
          fill="currentColor"
          aria-hidden
          initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          {paused ? (
            <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />
          ) : (
            <path d="M4.5 3h2v10h-2zM9.5 3h2v10h-2z" />
          )}
        </motion.svg>
      </AnimatePresence>
    </span>
  );
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We moved our month-end close into Ledgerly in March. What used to eat the first week of every month now takes an afternoon, and nobody on the team misses the spreadsheets.",
    highlight: "now takes an afternoon",
    name: "Ava Chen",
    role: "Controller, Northwind Traders",
    avatar: "/avatars/ava.svg",
  },
  {
    quote:
      "I was braced for a six month migration. Our books were live in eleven days, and the auditors signed off on the first try.",
    highlight: "the auditors signed off on the first try",
    name: "Ben Ortiz",
    role: "CFO, Globex Retail",
    avatar: "/avatars/ben.svg",
  },
  {
    quote:
      "The payout view is the first screen I open every morning. When a transfer is late I know which customer it is before our bank does.",
    highlight: "I know which customer it is before our bank does",
    name: "Cara Lindqvist",
    role: "Head of Finance Ops, Initech",
    avatar: "/avatars/cara.svg",
  },
  {
    quote:
      "Three entities, two currencies, one login. Consolidation used to need a consultant, and now it's a button.",
    highlight: "now it's a button",
    name: "Dev Raman",
    role: "Founder, Parcel & Pine",
    avatar: "/avatars/dev.svg",
  },
];

export default function TestimonialHighlightDemo() {
  return <TestimonialHighlight testimonials={TESTIMONIALS} />;
}
