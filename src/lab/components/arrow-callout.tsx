"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Caveat } from "next/font/google";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

// A marker hand for the note. Not preloaded: the index bundles every preview,
// and pages that never draw it shouldn't fetch it.
const hand = Caveat({ subsets: ["latin"], weight: ["500"], preload: false });

type Pt = { x: number; y: number };
type Box = { left: number; top: number; width: number; height: number };

const round = (n: number) => Math.round(n * 10) / 10;
// Room between the arrow tip and the target, so it points rather than stabs.
const TIP_GAP = 8;
// Padding around the path's box so round caps and the head never clip.
const PAD = 6;

// The curve lives in the note's own coordinates: (0,0) is the note's top left.
function geometry(note: Box, target: Box) {
  const tc = {
    x: target.left + target.width / 2 - note.left,
    y: target.top + target.height / 2 - note.top,
  };
  const dx = tc.x - note.width / 2;
  const dy = tc.y - note.height / 2;

  // Leaves from the side of the note that faces the target, a little below
  // the middle, the way a note-taker starts an arrow near the last word.
  let s: Pt;
  if (Math.abs(dx) > Math.abs(dy)) s = { x: dx < 0 ? -6 : note.width + 6, y: note.height * 0.6 };
  else s = { x: note.width * 0.35, y: dy < 0 ? -4 : note.height + 4 };

  // Aims at the target's centre and stops where that line meets its edge.
  const hw = target.width / 2 + TIP_GAP;
  const hh = target.height / 2 + TIP_GAP;
  const ax = s.x - tc.x;
  const ay = s.y - tc.y;
  const k = Math.min(ax ? hw / Math.abs(ax) : Infinity, ay ? hh / Math.abs(ay) : Infinity);
  const e = k < 1 ? { x: tc.x + ax * k, y: tc.y + ay * k } : tc;

  // A pen arc: bulges to one side (always upward, like a flick of the
  // wrist) by about a third of its length, capped so long arrows stay calm.
  const vx = e.x - s.x;
  const vy = e.y - s.y;
  const len = Math.hypot(vx, vy) || 1;
  let nx = -vy / len;
  let ny = vx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(len * 0.32, 56);
  // Asymmetric handles: a quick start, a longer approach into the tip.
  const c1 = { x: s.x + vx * 0.15 + nx * bulge, y: s.y + vy * 0.15 + ny * bulge };
  const c2 = { x: s.x + vx * 0.7 + nx * bulge * 0.75, y: s.y + vy * 0.7 + ny * bulge * 0.75 };

  // The head follows the curve's last tangent, two unequal barbs like a
  // quick hand would draw them.
  const angle = Math.atan2(e.y - c2.y, e.x - c2.x);
  const barb = (spread: number, length: number) => ({
    x: e.x - Math.cos(angle + spread) * length,
    y: e.y - Math.sin(angle + spread) * length,
  });
  const b1 = barb(0.5, 9);
  const b2 = barb(-0.45, 7.5);

  const xs = [s.x, c1.x, c2.x, e.x, b1.x, b2.x];
  const ys = [s.y, c1.y, c2.y, e.y, b1.y, b2.y];
  const box = {
    x: Math.min(...xs) - PAD,
    y: Math.min(...ys) - PAD,
    w: Math.max(...xs) - Math.min(...xs) + PAD * 2,
    h: Math.max(...ys) - Math.min(...ys) + PAD * 2,
  };
  const p = (pt: Pt) => `${round(pt.x)} ${round(pt.y)}`;
  return {
    box,
    body: `M${p(s)}C${p(c1)} ${p(c2)} ${p(e)}`,
    head: `M${p(b1)}L${p(e)}L${p(b2)}`,
  };
}

export function ArrowCallout({
  target,
  follow = false,
  children,
  className,
}: {
  /** The element the arrow points at. It can live anywhere on the page. */
  target: RefObject<HTMLElement | null>;
  /** Track the target every frame, for when a script (not a pointer) moves it. */
  follow?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const note = useRef<HTMLSpanElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const body = useRef<SVGPathElement>(null);
  const head = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = note.current;
    const to = target.current;
    const art = svg.current;
    if (!el || !to || !art) return;

    // Straight DOM writes: this runs every frame while the target moves, and
    // a React render per frame would be wasted work.
    const layout = () => {
      const n = el.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      // Rects are post-transform, but the svg is drawn in the note's own
      // pixels: inside a scaled container, divide the scale back out.
      const k = el.offsetWidth ? n.width / el.offsetWidth : 1;
      const g = geometry(
        { left: 0, top: 0, width: n.width / k, height: n.height / k },
        {
          left: (t.left - n.left) / k,
          top: (t.top - n.top) / k,
          width: t.width / k,
          height: t.height / k,
        },
      );
      art.style.left = `${round(g.box.x)}px`;
      art.style.top = `${round(g.box.y)}px`;
      art.setAttribute("width", String(round(g.box.w)));
      art.setAttribute("height", String(round(g.box.h)));
      art.setAttribute("viewBox", `${round(g.box.x)} ${round(g.box.y)} ${round(g.box.w)} ${round(g.box.h)}`);
      body.current?.setAttribute("d", g.body);
      head.current?.setAttribute("d", g.head);
    };
    layout();

    // Any layout change around either end reshapes the arrow.
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    ro.observe(to);
    ro.observe(document.documentElement);

    // Transforms don't trigger ResizeObserver, so while the target is being
    // handled (dragged, springing back) follow it frame by frame, and sleep
    // once it has held still for a few frames.
    let raf = 0;
    let still = 0;
    let last = "";
    let held = follow;
    const track = () => {
      const r = to.getBoundingClientRect();
      const now = `${r.left},${r.top},${r.width},${r.height}`;
      if (now !== last) {
        last = now;
        still = 0;
        layout();
      } else still++;
      if (held || still < 12) raf = requestAnimationFrame(track);
    };
    const wake = () => {
      cancelAnimationFrame(raf);
      still = 0;
      raf = requestAnimationFrame(track);
    };
    const down = () => {
      held = true;
      wake();
    };
    const up = () => {
      held = false;
    };
    to.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    to.addEventListener("transitionrun", wake);
    if (follow) wake();

    // Draws once, when the note is properly on screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        art.dataset.drawn = "true";
        io.disconnect();
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      to.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      to.removeEventListener("transitionrun", wake);
    };
  }, [target, follow]);

  const ink = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    pathLength: 1,
  } as const;

  return (
    <span ref={note} className={cn("relative inline-block text-marker", className)}>
      <span className={cn(hand.className, "inline-block -rotate-3 text-[22px] leading-none whitespace-nowrap")}>
        {children}
      </span>
      <svg
        ref={svg}
        aria-hidden
        data-drawn="false"
        className="group/arrow pointer-events-none absolute overflow-visible"
      >
        {/* A pen stroke: eases into the line and off it, 650ms because the
            drawing is the point and it plays once. The head lands after. */}
        <path
          ref={body}
          {...ink}
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-200 duration-[650ms] ease-[cubic-bezier(0.65,0,0.35,1)] group-data-[drawn=true]/arrow:[stroke-dashoffset:0] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
        <path
          ref={head}
          {...ink}
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-[830ms] duration-[160ms] ease-out group-data-[drawn=true]/arrow:[stroke-dashoffset:0] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
      </svg>
    </span>
  );
}

// The same spring the sticker uses to snap home after a real drag.
const HOME = { type: "spring", stiffness: 400, damping: 30 } as const;

export default function ArrowCalloutDemo() {
  const chip = useRef<HTMLButtonElement>(null);
  const play = usePreviewPlay();
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // True from the first scripted tug until the sticker is home again, so the
  // arrow tracks it every frame only while it actually moves.
  const [moving, setMoving] = useState(false);
  const run = useRef(0);

  // Index preview: someone picks the sticker up, tugs it up and to the
  // right, lets go, and it springs home with the arrow chasing it.
  useEffect(() => {
    if (play !== true || reduceMotion) return;
    const gen = run;
    const id = ++gen.current;
    const live = () => gen.current === id;
    let timer: ReturnType<typeof setTimeout>;
    const tug = async () => {
      setMoving(true);
      // A hand's drag: quick to start, easing out at the end of the pull.
      const pull = { duration: 0.55, ease: [0.23, 1, 0.32, 1] } as const;
      await Promise.all([animate(x, 26, pull), animate(y, -24, pull)]);
      if (!live()) return;
      await Promise.all([animate(x, 0, HOME), animate(y, 0, HOME)]);
      if (live()) timer = setTimeout(tug, 1600);
    };
    timer = setTimeout(tug, 200);
    return () => {
      clearTimeout(timer);
      const done = ++gen.current;
      // Let go mid-tug: it springs home from wherever it is.
      Promise.all([animate(x, 0, HOME), animate(y, 0, HOME)]).then(() => {
        if (gen.current === done) setMoving(false);
      });
    };
  }, [play, reduceMotion, x, y]);

  return (
    <div className="relative flex w-[min(360px,100%)] items-center justify-between gap-4 py-8 pl-2 sm:gap-16">
      <motion.button
        ref={chip}
        type="button"
        drag
        // A short leash with rubber past it, so the sticker can't be laid
        // over its own note and the arrow always has room to point.
        dragConstraints={{ top: -28, bottom: 28, left: -8, right: 28 }}
        dragElastic={0.25}
        // Springs home on release, keeping the throw's velocity; the arrow
        // follows it the whole way.
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 400, bounceDamping: 30 }}
        whileTap={{ scale: 0.96 }}
        style={{ x, y }}
        className="relative z-10 inline-flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 rounded-full bg-surface px-3.5 text-sm font-medium text-foreground shadow-raised outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:cursor-grabbing"
      >
        {/* A six-dot grip, the usual "this moves" hint. */}
        <svg viewBox="0 0 8 12" className="size-3 text-muted" fill="currentColor" aria-hidden>
          {[2, 6, 10].map((y) => (
            <g key={y}>
              <circle cx="2" cy={y} r="1" />
              <circle cx="6" cy={y} r="1" />
            </g>
          ))}
        </svg>
        Sticker
      </motion.button>
      <ArrowCallout target={chip} follow={moving} className="mt-20">
        try dragging this!
      </ArrowCallout>
    </div>
  );
}
