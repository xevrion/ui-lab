"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { usePreviewPlay } from "@/lab/preview-play";
import { SIGNATURE, SIGNATURE_VIEWBOX } from "@/lib/signature";
import { cn } from "@/lib/cn";

type Point = { x: number; y: number; w: number };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Ink width in px: fast strokes thin out to MIN, slow ones swell to MAX,
// the way a pen leaves more ink where it lingers.
const MIN = 1.1;
const MAX = 3.6;

export type PadActions = {
  begin: (x: number, y: number) => void;
  move: (x: number, y: number, t: number, pressure?: number) => void;
  end: () => void;
  clear: () => void;
};

export function SignaturePad({
  ref,
  onSignedChange,
  className,
}: {
  // Lets a script sign the pad through the same path a hand takes.
  ref?: React.Ref<PadActions>;
  onSignedChange?: (signed: boolean) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const last = useRef<{ x: number; y: number; t: number; w: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [done, setDone] = useState(false);
  const [wiping, setWiping] = useState(false);

  const ctx = () => canvas.current?.getContext("2d") ?? null;
  const ink = () =>
    canvas.current ? getComputedStyle(canvas.current).color : "#171717";

  // Draws one smoothed piece of a stroke: a curve through the previous
  // point, from midpoint to midpoint, so corners come out round.
  const segment = (c: CanvasRenderingContext2D, a: Point, b: Point, d: Point) => {
    c.beginPath();
    c.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    c.quadraticCurveTo(b.x, b.y, (b.x + d.x) / 2, (b.y + d.y) / 2);
    c.lineWidth = d.w;
    c.stroke();
  };

  const redraw = () => {
    const el = canvas.current;
    const c = ctx();
    if (!el || !c) return;
    c.clearRect(0, 0, el.width, el.height);
    c.strokeStyle = c.fillStyle = ink();
    c.lineCap = c.lineJoin = "round";
    for (const s of strokes.current) {
      if (s.length === 1) {
        c.beginPath();
        c.arc(s[0].x, s[0].y, s[0].w / 2, 0, Math.PI * 2);
        c.fill();
      }
      for (let i = 1; i < s.length; i++) segment(c, s[Math.max(0, i - 2)], s[i - 1], s[i]);
    }
  };

  // Sharp at any pixel density, redrawn from the points on resize and when
  // the theme flips the ink colour.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = el.offsetWidth * dpr;
      el.height = el.offsetHeight * dpr;
      el.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", redraw);
    return () => {
      ro.disconnect();
      mo.disconnect();
      media.removeEventListener("change", redraw);
    };
    // redraw only reads refs; running this once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = (x: number, y: number) => {
    if (wiping) return;
    const p = { x, y, w: (MIN + MAX) / 2 };
    strokes.current.push([p]);
    last.current = { x, y, t: performance.now(), w: p.w };
    if (!hasInk) setHasInk(true);
    if (done) {
      setDone(false);
      onSignedChange?.(false);
    }
    const c = ctx();
    if (c) {
      c.fillStyle = ink();
      c.beginPath();
      c.arc(x, y, p.w / 2, 0, Math.PI * 2);
      c.fill();
    }
  };

  const move = (x: number, y: number, t: number, pressure?: number) => {
    const prev = last.current;
    const stroke = strokes.current.at(-1);
    if (!prev || !stroke) return;
    const dist = Math.hypot(x - prev.x, y - prev.y);
    if (dist < 1) return;
    const speed = dist / Math.max(1, t - prev.t); // px per ms
    const target =
      pressure !== undefined && pressure > 0 && pressure !== 0.5
        ? MIN + (MAX - MIN) * Math.min(1, pressure * 1.2)
        : Math.max(MIN, Math.min(MAX, MAX - speed * 1.4));
    // Eases toward the new width, so the line swells and thins smoothly.
    const w = prev.w * 0.72 + target * 0.28;
    const point = { x, y, w };
    stroke.push(point);
    last.current = { x, y, t, w };
    const c = ctx();
    if (c && stroke.length > 1) {
      c.strokeStyle = ink();
      c.lineCap = c.lineJoin = "round";
      segment(c, stroke[Math.max(0, stroke.length - 3)], stroke[stroke.length - 2], point);
    }
  };

  const end = () => {
    last.current = null;
  };

  // Wipes the ink away left to right, the way it was written.
  const clear = () => {
    const el = canvas.current;
    if (!el || !strokes.current.length || wiping) return;
    const finish = () => {
      strokes.current = [];
      redraw();
      el.style.clipPath = "";
      setWiping(false);
      setHasInk(false);
      setDone(false);
      onSignedChange?.(false);
    };
    if (reduceMotion) return finish();
    setWiping(true);
    animate(el, { clipPath: ["inset(0 0 0 0%)", "inset(0 0 0 100%)"] }, {
      duration: 0.45,
      ease: [0.77, 0, 0.175, 1],
      onComplete: finish,
    });
  };

  useImperativeHandle(ref, () => ({ begin, move, end, clear }));

  // Pointer positions in the canvas's own pixels, even inside a scaled card.
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const scale = r.width / el.offsetWidth || 1;
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const pressureOf = (e: React.PointerEvent) =>
    e.pointerType === "pen" ? e.pressure : undefined;

  return (
    <div
      className={cn(
        "w-[min(440px,100%)] rounded-2xl bg-background p-5 shadow-raised",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-medium text-foreground">Sign below</p>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || wiping}
          className="h-8 rounded-full px-3 text-[13px] text-muted outline-hidden transition-[color,background-color,opacity,scale] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="relative mt-3 h-44 overflow-hidden rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--border)]">
        {/* The line you sign on, with its little cross, like paper. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-10 flex items-end gap-2">
          <span className="-mb-0.5 text-[15px] leading-none text-muted">×</span>
          <span className="h-px flex-1 border-b border-dashed border-muted/50" />
        </div>
        {!hasInk && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-6 text-center text-[13px] text-muted">
            Sign with your mouse, pen or finger
          </p>
        )}
        <canvas
          ref={canvas}
          role="img"
          aria-label={hasInk ? "Your signature" : "Signature area, empty"}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = at(e);
            begin(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!last.current) return;
            // Coalesced events keep fast strokes smooth instead of angular.
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            const r = e.currentTarget.getBoundingClientRect();
            const scale = r.width / e.currentTarget.offsetWidth || 1;
            for (const ev of events.length ? events : [e.nativeEvent]) {
              move(
                (ev.clientX - r.left) / scale,
                (ev.clientY - r.top) / scale,
                ev.timeStamp,
                pressureOf(e),
              );
            }
          }}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute inset-0 size-full cursor-crosshair touch-none text-foreground"
        />
        <AnimatePresence>
          {done && (
            <motion.p
              initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-[12px] font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3.5 8.25l3 3 6-6.5" />
              </svg>
              Signed
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted">Your signature stays on this page.</p>
        <button
          type="button"
          disabled={!hasInk || done || wiping}
          onClick={() => {
            setDone(true);
            onSignedChange?.(true);
          }}
          className="h-9 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-medium text-background outline-hidden transition-[opacity,scale] duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
        >
          Done
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {done ? "Signature saved" : ""}
      </span>
    </div>
  );
}

// The card's hover show signs the lab's own name: the path is walked in
// small steps, faster on the straights and slower round the bends, so the
// ink swells and thins as a hand's would.
function useSignatureReplay(actions: React.RefObject<PadActions | null>, play: boolean | null) {
  useEffect(() => {
    if (play !== true) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden");
    document.body.append(svg);
    const [vx, vy, vw, vh] = SIGNATURE_VIEWBOX.split(" ").map(Number);
    const parts = SIGNATURE.split(/(?=M)/).map((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
      return path;
    });
    // Fits the signature into the pad: 400 by 176, sitting on the line.
    const scale = Math.min(300 / vw, 110 / vh);
    const ox = (400 - vw * scale) / 2 - vx * scale;
    const oy = 24 - vy * scale;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const sign = () => {
      let part = 0;
      let dist = 0;
      let clock = performance.now();
      let began = false;
      const step = () => {
        if (stopped) return;
        const path = parts[part];
        const len = path.getTotalLength();
        // Covers ~10px of the path per frame, slower where it curves.
        for (let k = 0; k < 3 && dist <= len; k++) {
          const a = path.getPointAtLength(dist);
          const b = path.getPointAtLength(Math.min(len, dist + 4));
          const bend = Math.abs(Math.atan2(b.y - a.y, b.x - a.x));
          clock += 4 + (bend > 1 ? 5 : 0);
          const x = ox + a.x * scale;
          const y = oy + a.y * scale;
          if (!began) {
            actions.current?.begin(x, y);
            began = true;
          } else actions.current?.move(x, y, clock);
          dist += 3.5;
        }
        if (dist > len) {
          actions.current?.end();
          part++;
          dist = 0;
          began = false;
          if (part >= parts.length) {
            timer = setTimeout(() => {
              actions.current?.clear();
              timer = setTimeout(sign, 1100);
            }, 1400);
            return;
          }
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    timer = setTimeout(sign, 300);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      svg.remove();
      // Whichever pad is showing when the show stops gets wiped.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      actions.current?.clear();
    };
  }, [play, actions]);
}

export default function SignaturePadDemo() {
  const play = usePreviewPlay();
  const actions = useRef<PadActions>(null);
  useSignatureReplay(actions, play);
  return <SignaturePad ref={actions} />;
}
