"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

/* The teachable part: the pen's speed comes from the path itself. The path
   is sampled once, each sample gets a cost from how sharply the line turns
   there, and time is spent in proportion to that cost. So the pen races
   down straight strokes and slows through loops, the way a hand does,
   without any hand-made keyframes. The ink is three copies of the same
   stroke nudged along a slanted nib, which makes strokes heavier in one
   direction than the other, like a broad-edged pen. */

// Handwritten "xevrion": one continuous stroke through the letters and a
// return swash underneath, then the pen lifts once to dot the i, the way
// people really sign. Drawn upright and slanted 12 degrees, in the default
// viewBox below.
export const XEVRION_SIGNATURE =
  "M 24 60 C 31 50 47 50 46 60 C 46 70 40 80 30 80 C 22 80 22 72 28 72 C 38 70 54 60 70 54 " +
  "C 62 52 50 60 50 70 C 50 80 60 82 68 78 C 77 74 89 66 90 60 C 92 54 84 54 80 62 " +
  "C 76 72 80 82 92 78 C 100 72 104 60 108 54 C 108 64 107 74 110 80 C 116 72 124 60 130 54 " +
  "C 133 50 127 50 126 56 C 126 60 132 60 139 58 C 141 56 143 52 145 47 C 146 52 146 56 150 55 " +
  "C 153 54 154 52 157 52 C 153 62 151 72 151 80 C 156 74 163 62 167 54 C 164 64 160 76 165 80 " +
  "C 173 76 191 58 202 54 C 193 50 182 62 182 72 C 182 82 194 82 200 72 C 205 64 204 54 200 54 " +
  "C 205 58 211 58 217 56 C 222 54 220 64 214 80 C 221 66 232 54 237 56 C 243 58 238 72 238 80 " +
  "C 241 86 254 80 264 70 C 286 52 268 100 206 100 C 156 100 105 102 54 108 " +
  "M 171 41 C 172 40 174 39 175 39";

// The whole signature takes this long: a quick, practised signature. Past
// the usual 300ms UI budget on purpose, since it is handwriting that plays
// once, and any faster the slowdown through loops stops reading.
const DURATION = 700;
// How strongly a turn slows the pen. At 0 the pen moves at constant speed;
// around 10 the loops take roughly three times longer than the straights.
const CURVE_DRAG = 10;
// Samples along the path. Enough that the cost curve is smooth at 2x zoom.
const SAMPLES = 360;
// The slant of the nib, in path units: each copy of the stroke is shifted
// this much further up and to the right.
const NIB_STEP = 1.4;
const NIB_COPIES = 3;

type Timing = { lengths: Float32Array; times: Float32Array };

function buildTiming(path: SVGPathElement): Timing {
  const total = path.getTotalLength();
  const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => path.getPointAtLength((total * i) / SAMPLES));
  const lengths = new Float32Array(SAMPLES + 1);
  const times = new Float32Array(SAMPLES + 1);
  let t = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    lengths[i] = (total * i) / SAMPLES;
    const a = pts[Math.max(0, i - 2)];
    const b = pts[i - 1];
    const c = pts[i];
    const turn = Math.abs(
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x),
    );
    // A jump to a new subpath reads as a sharp turn too, so a pen lift
    // gets a natural beat of stillness for free.
    const bend = Math.min(turn, 2 * Math.PI - turn);
    t += 1 + CURVE_DRAG * bend;
    times[i] = t;
  }
  for (let i = 0; i <= SAMPLES; i++) times[i] /= t;
  return { lengths, times };
}

// Time is normalized 0..1; returns the path length drawn by then.
function lengthAt({ lengths, times }: Timing, time: number) {
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo] || 1;
  return lengths[lo] + ((time - times[lo]) / span) * (lengths[hi] - lengths[lo]);
}

// A gentle start and a slightly quicker finish, like setting the pen down
// and flicking it off the page.
const penEase = (x: number) => (x < 0.08 ? (x / 0.08) ** 2 * 0.04 : 0.04 + (x - 0.08) * (0.96 / 0.92));

export type FooterLink = { label: string; href: string };

export function FooterSignature({
  name,
  signature = XEVRION_SIGNATURE,
  viewBox = "12 30 282 86",
  tagline,
  columns,
  copyright,
  scrollRef,
  replayKey = 0,
  className,
}: {
  name: string;
  // An SVG path, ideally one continuous stroke. Extra subpaths (an i dot,
  // a t cross) are written last, after a short pause for the pen lift.
  signature?: string;
  viewBox?: string;
  tagline?: string;
  columns: { title: string; links: FooterLink[] }[];
  copyright: string;
  /* The scrolling element the footer lives in. Leave it out for a normal
     page, where the window scrolls. */
  scrollRef?: React.RefObject<HTMLElement | null>;
  // Change it to write the signature again next time the footer is in view.
  replayKey?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const root = useRef<HTMLElement>(null);
  const measure = useRef<SVGPathElement>(null);
  const strokes = useRef<(SVGPathElement | null)[]>([]);
  const [phase, setPhase] = useState<"idle" | "writing" | "done">("idle");
  // Split at every absolute moveto. Write extra subpaths with "M", not "m".
  const subpaths = useMemo(() => signature.split(/(?=M)/).map((d) => d.trim()).filter(Boolean), [signature]);

  useEffect(() => {
    const el = root.current;
    const path = measure.current;
    if (!el || !path) return;
    const total = path.getTotalLength();
    const parts = strokes.current.slice(0, subpaths.length).map((s) => s?.getTotalLength() ?? 0);
    const starts = parts.map((_, k) => parts.slice(0, k).reduce((a, b) => a + b, 0));
    const setDrawn = (len: number) => {
      strokes.current.forEach((s, i) => {
        if (!s) return;
        const k = i % subpaths.length;
        const part = parts[k];
        const drawn = Math.min(part, Math.max(0, len - starts[k]));
        s.style.strokeDasharray = `${part} ${part + 1}`;
        s.style.strokeDashoffset = String(part - drawn);
      });
    };
    setDrawn(0);
    setPhase("idle");

    let frame = 0;
    let start = 0;
    let timing: Timing | null = null;
    let finished = false;

    const tick = (now: number) => {
      if (!timing) return;
      if (!start) start = now;
      const p = Math.min(1, (now - start) / DURATION);
      setDrawn(lengthAt(timing, penEase(p)));
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        finished = true;
        frame = 0;
        setPhase("done");
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || finished || frame || pausedAt) return;
        if (reduceMotion) {
          finished = true;
          setDrawn(total);
          setPhase("done");
          return;
        }
        timing ??= buildTiming(path);
        setPhase("writing");
        frame = requestAnimationFrame(tick);
      },
      // Most of the footer has to be on screen, or the signature would be
      // half written before anyone looks at it.
      { root: scrollRef?.current ?? null, threshold: 0.6 },
    );
    io.observe(el);

    // Pause with the tab; resume from the same point rather than skipping.
    let pausedAt = 0;
    const onVisibility = () => {
      if (!frame && !pausedAt) return;
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        pausedAt = performance.now();
      } else if (!document.hidden && pausedAt) {
        start += performance.now() - pausedAt;
        pausedAt = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [subpaths, scrollRef, replayKey, reduceMotion]);

  const done = phase === "done";
  // The printed name and tagline under the signature settle in once the pen
  // lifts, like a caption. The links stay put the whole time: they are the
  // footer's job, and never wait on an animation.
  const settle = (i: number) =>
    cn(
      "transition-[opacity,translate,filter] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0",
      done
        ? "translate-y-0 opacity-100 blur-none duration-300"
        : "translate-y-1.5 opacity-0 blur-[4px] duration-0",
      done && ["delay-0", "delay-[60ms]"][i],
    );

  return (
    <footer ref={root} className={cn("text-[14px] text-muted", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <svg
            viewBox={viewBox}
            role="img"
            aria-label={`${name}'s signature`}
            className="h-10 w-auto max-w-full overflow-visible text-foreground"
          >
            <path ref={measure} d={signature} fill="none" stroke="none" />
            {Array.from({ length: NIB_COPIES }, (_, copy) => (
              <g key={copy} transform={`translate(${copy * NIB_STEP} ${-copy * NIB_STEP})`}>
                {/* One element per subpath: browsers restart the dash at
                    every moveto, so a single path would show the i dot
                    before the pen ever got there. */}
                {subpaths.map((d, k) => (
                  <path
                    key={k}
                    ref={(el) => {
                      strokes.current[copy * subpaths.length + k] = el;
                    }}
                    data-subpath={k}
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    // Hidden until the first frame sets the dash, so nothing
                    // flashes fully drawn before JavaScript runs.
                    style={{ strokeDasharray: "0 1e4" }}
                  />
                ))}
              </g>
            ))}
          </svg>
          <p className={cn("mt-2 font-medium text-foreground", settle(0))}>{name}</p>
          {tagline && <p className={cn("mt-0.5", settle(1))}>{tagline}</p>}
        </div>

        <div className="flex gap-10">
          {columns.map((col) => (
            <nav key={col.title} aria-label={`${name}: ${col.title}`}>
              <p className="text-[13px] font-medium text-foreground">{col.title}</p>
              <ul className="mt-2 flex flex-col">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="-mx-1 inline-flex h-8 items-center rounded-md px-1 outline-hidden transition-[color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div
        className="mt-8 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-[13px]"
      >
        <span>{copyright}</span>
        <span>Signed, not generated.</span>
      </div>
    </footer>
  );
}

/* A scrolling page mock that ends in the footer. */

const COLUMNS = [
  {
    title: "Work",
    links: [
      { label: "Projects", href: "#" },
      { label: "Lab", href: "#" },
      { label: "Resume", href: "#" },
    ],
  },
  {
    title: "Elsewhere",
    links: [
      { label: "GitHub", href: "#" },
      { label: "X", href: "#" },
      { label: "Email", href: "#" },
    ],
  },
];

const POSTS = [
  { title: "Building a physics engine for a car simulator", meta: "Aug 2026 · 12 min" },
  { title: "What I learned shipping 91 components in a day", meta: "Sep 2026 · 6 min" },
  { title: "Reverse engineering my keyboard's config protocol", meta: "Jun 2026 · 9 min" },
  { title: "Fedora, niri and an Nvidia card: a field guide", meta: "Jul 2026 · 8 min" },
];

export default function FooterSignatureDemo() {
  const scroller = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState(0);
  const reduceMotion = useReducedMotion();

  // The demo opens at the end of the page, so the footer is in view and
  // signs itself straight away. Layout effects run before the footer's
  // observer is set up, so it already sees the footer on screen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onReplay = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    setReplay((r) => r + 1);
  };

  return (
    <div className="flex h-[480px] w-[560px] max-w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-raised">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border pr-2 pl-5">
        <span className="truncate font-mono text-[13px] text-muted">xevrion.dev/writing</span>
        <button
          type="button"
          onClick={onReplay}
          className="flex h-9 touch-manipulation items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.77M2.75 2.75v2.5h2.5" />
          </svg>
          Replay
        </button>
      </div>
      <div
        ref={scroller}
        tabIndex={0}
        aria-label="Page"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background [scrollbar-width:none] outline-hidden [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      >
        <div className="px-6 pt-6">
          <h2 className="text-xl font-semibold text-foreground">Writing</h2>
          <p className="mt-1 text-[15px] text-muted">Notes on building things, mostly late at night.</p>
          <ul className="mt-5 flex flex-col">
            {POSTS.map((p) => (
              <li key={p.title} className="border-t border-border py-4">
                <p className="text-[15px] font-medium text-foreground">{p.title}</p>
                <p className="mt-1 text-[13px] text-muted">{p.meta}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-border py-10 text-[15px] leading-relaxed text-pretty text-muted">
            Thanks for reading this far. If something here was useful, the best thanks is
            telling me what you built with it.
          </p>
        </div>
        <FooterSignature
          name="xevrion"
          tagline="Design engineer. Builds things at night."
          columns={COLUMNS}
          copyright="© 2026 xevrion"
          scrollRef={scroller}
          replayKey={replay}
          className="border-t border-border bg-surface px-6 pt-8 pb-6"
        />
      </div>
    </div>
  );
}
