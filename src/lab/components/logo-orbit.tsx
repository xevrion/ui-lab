"use client";

import { useEffect, useRef, useState } from "react";
import {
  siArc,
  siBun,
  siCloudflare,
  siFigma,
  siFramer,
  siGithub,
  siLinear,
  siNeovim,
  siNextdotjs,
  siNotion,
  siRaycast,
  siReact,
  siStripe,
  siSupabase,
  siTailwindcss,
  siTypescript,
  siVercel,
} from "simple-icons";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { usePreviewPlay } from "@/lab/preview-play";
import { cn } from "@/lib/cn";

export type OrbitLogo = { title: string; path: string; hex: string };

type Ring = {
  logos: OrbitLogo[];
  // Radius across, as a share of the stage's width.
  radius: number;
  // Seconds per lap; negative turns the other way.
  lap: number;
};

// How far the ring is tipped away from you: the vertical radius is this
// share of the horizontal one, so the circle reads as a tilted plane. Tipped
// enough that the rings pass above and below the heading, not through it.
const TILT = 0.42;
// A hovered orbit brakes to a stop rather than freezing, and picks back up
// as smoothly when you leave.
const BRAKE = 4;

// Brand colours only show where they'd read: near-black marks (Vercel,
// Notion, GitHub) would vanish on a dark page, so those stay in the text
// colour.
function readable(hex: string) {
  const n = parseInt(hex, 16);
  const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 40 && lum < 225;
}

export function LogoOrbit({
  rings,
  paused = false,
  className,
  children,
}: {
  rings: Ring[];
  // Holds a still frame and runs nothing, for idle previews.
  paused?: boolean;
  className?: string;
  // What the logos circle: a heading, a stat, a line of copy.
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hovering = useRef(false);
  const [active, setActive] = useState<string | null>(null);

  const flat = rings.flatMap((ring, r) =>
    ring.logos.map((logo, i) => ({ logo, r, i, n: ring.logos.length })),
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const turns = rings.map(() => 0);
    let speed = 1;
    let frame = 0;
    let visible = true;
    let last = performance.now();

    const place = () => {
      const w = stage.offsetWidth;
      const h = stage.offsetHeight;
      flat.forEach(({ r, i, n }, k) => {
        const el = itemRefs.current[k];
        if (!el) return;
        const ring = rings[r];
        const angle = turns[r] + (i / n) * Math.PI * 2;
        const rx = (ring.radius * w) / 2;
        const x = Math.cos(angle) * rx;
        // Height keeps the taller phone stage clear of its wrapped heading.
        // 0.8 preserves the original ellipse on the desktop 16:10 stage.
        const y = Math.sin(angle) * ring.radius * h * 0.8 * TILT;
        // -1 at the back of the ring, 1 at the front.
        const depth = Math.sin(angle);
        const near = (depth + 1) / 2;
        el.style.transform = `translate(${(w / 2 + x).toFixed(1)}px, ${(h / 2 + y).toFixed(1)}px) translate(-50%, -50%) scale(${(0.7 + near * 0.35).toFixed(3)})`;
        el.style.opacity = (0.28 + near * 0.72).toFixed(3);
        // The front half passes over the text, the back half behind it.
        el.style.zIndex = depth > 0 ? "3" : "1";
      });
    };

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const target = hovering.current ? 0 : 1;
      speed += (target - speed) * (1 - Math.exp(-BRAKE * dt));
      rings.forEach((ring, r) => {
        turns[r] += ((Math.PI * 2) / ring.lap) * dt * speed;
      });
      place();
      frame = visible ? requestAnimationFrame(step) : 0;
    };

    place();
    if (paused || reduceMotion) return;

    // Sleeps offscreen, so a long page never pays for it.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    });
    io.observe(stage);
    const ro = new ResizeObserver(place);
    ro.observe(stage);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
    };
    // `flat` is derived from `rings` on every render; the rings are the
    // real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings, paused, reduceMotion]);

  return (
    <div
      ref={stageRef}
      // Reserves vertical clearance for the two-line phone heading.
      className={cn("relative isolate aspect-[16/10] min-h-[360px] w-full", className)}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") hovering.current = true;
      }}
      onPointerLeave={() => {
        hovering.current = false;
        setActive(null);
      }}
    >
      {/* Centre layer: sits between the back and front of the orbit. It
          spans the stage only to centre its content, so the pointer passes
          through to the logos behind it everywhere but the text itself. */}
      <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center px-[18%] text-center [&>*]:pointer-events-auto">
        {children}
      </div>

      {flat.map(({ logo }, k) => {
        const on = active === logo.title;
        return (
          <div
            key={logo.title}
            ref={(el) => void (itemRefs.current[k] = el)}
            data-on={on}
            // The one you point at comes forward at full strength, even from
            // the far side of the ring. !important beats the per-frame depth.
            className="absolute top-0 left-0 will-change-transform data-[on=true]:!z-[4] data-[on=true]:!opacity-100"
          >
            <button
              type="button"
              aria-label={logo.title}
              onPointerEnter={(e) => e.pointerType !== "touch" && setActive(logo.title)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => {
                hovering.current = true;
                setActive(logo.title);
              }}
              onBlur={() => {
                hovering.current = false;
                setActive(null);
              }}
              className="relative grid size-11 touch-manipulation place-items-center rounded-full text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-7 transition-[color,scale] duration-200 ease-out"
                style={{
                  fill: on && readable(logo.hex) ? `#${logo.hex}` : "currentColor",
                  scale: on ? "1.12" : "1",
                }}
              >
                <path d={logo.path} />
              </svg>
              {/* The name surfaces under the mark you're pointing at. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-xs font-medium whitespace-nowrap text-background transition-[opacity,translate] duration-150 ease-out",
                  on ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
                )}
              >
                {logo.title}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

const pick = (i: { title: string; path: string; hex: string }) => ({
  title: i.title,
  path: i.path,
  hex: i.hex,
});

// The lab's own stack, so the section says something true.
const RINGS: Ring[] = [
  {
    logos: [siReact, siNextdotjs, siTypescript, siTailwindcss, siBun, siVercel, siFramer].map(pick),
    radius: 0.72,
    lap: 42,
  },
  {
    logos: [siFigma, siLinear, siGithub, siCloudflare, siSupabase, siStripe, siNotion, siRaycast, siArc, siNeovim].map(pick),
    radius: 0.98,
    lap: -64,
  },
];

export default function LogoOrbitDemo() {
  const play = usePreviewPlay();
  return (
    <LogoOrbit rings={RINGS} paused={play === false} className="w-[min(600px,100%)]">
      <div className="flex flex-col items-center gap-2">
        <p className="text-[13px] font-medium text-muted">The stack</p>
        <h2 className="max-w-[14ch] text-lg leading-tight font-semibold tracking-tight text-balance sm:max-w-none sm:text-[28px]">
          The tools behind the lab
        </h2>
      </div>
    </LogoOrbit>
  );
}
