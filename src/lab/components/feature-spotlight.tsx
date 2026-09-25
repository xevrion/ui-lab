"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Region = { x: number; y: number; w: number; h: number };

export type Feature = {
  title: string;
  body: string;
  // Where this feature lives on the screenshot: the `data-spot` value of an
  // element inside it, measured from the real layout so the spotlight can't
  // drift from what it frames. For an <img>, give `region` instead, in the
  // screenshot's own design pixels (see `screenshotSize`).
  spot?: string;
  region?: Region;
};

// Offsets ignore transforms, so this reads design pixels however far the
// screenshot is scaled or zoomed. `root` must be positioned so the offset
// chain ends at it.
function measureSpot(root: HTMLElement, spot: string): Region | null {
  const el = root.querySelector<HTMLElement>(`[data-spot="${spot}"]`);
  if (!el) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

// Camera moves are explanatory, not UI feedback: slow enough that the eye can
// follow the pan and see where on the product it lands.
const CAMERA = { type: "spring", duration: 0.8, bounce: 0 } as const;
// Room kept around a region when the camera frames it, in design pixels.
const PAD = 18;
// Past this the screenshot turns into a blurry blow-up of a few words.
const MAX_ZOOM = 2.2;
// How far above the first feature, or below the last, the reading line may
// wander before the camera pulls back to the whole screenshot.
const CATCH = 28;
const HOLE_RADIUS = 12;

type ScrollRoot = React.RefObject<HTMLElement | null> | "window";

export function FeatureSpotlight({
  features,
  screenshot,
  screenshotSize,
  scrollRoot = "window",
  className,
}: {
  features: Feature[];
  // The product UI (or an <img>), drawn at `screenshotSize` design pixels
  // and scaled to fit. Build it big with real type sizes, so zoomed in it
  // stays crisp.
  screenshot: React.ReactNode;
  screenshotSize: { width: number; height: number };
  // What scrolls the section: the window on a real page, or an element
  // (like the demo's page mock) passed as a ref.
  scrollRoot?: ScrollRoot;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  // A click scrolls the feature into place; until that scroll settles the
  // passing features shouldn't steal the camera.
  const lockedUntil = useRef(0);
  const [stickyTop, setStickyTop] = useState(24);

  // Reads layout on scroll and only sets state when the focused feature
  // changes, so scrolling doesn't re-render per frame.
  useEffect(() => {
    const target: HTMLElement | Window =
      scrollRoot === "window" ? window : (scrollRoot.current ?? window);
    let frame = 0;

    const viewport = () =>
      target === window
        ? { top: 0, bottom: window.innerHeight }
        : (target as HTMLElement).getBoundingClientRect();

    const measure = () => {
      frame = 0;
      if (performance.now() < lockedUntil.current) return;
      const view = viewport();
      const list = listRef.current?.getBoundingClientRect();
      const stage = stageRef.current?.getBoundingClientRect();
      if (!list || !stage) return;
      // Side by side, the reading line is the middle of the view. Stacked,
      // the screenshot pins to the top, so it's the middle of what's left.
      const stacked = stage.left < list.right - 1;
      const top = stacked ? Math.max(view.top, stage.bottom) : view.top;
      const line = (top + view.bottom) / 2;
      // Inside the list the nearest feature always holds the camera, so
      // the gaps between features never drop back to the overview; only
      // before the first and after the last does it pull back.
      let found: number | null = null;
      let best = Infinity;
      const els = textRefs.current;
      els.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d =
          line < r.top ? r.top - line : line > r.bottom ? line - r.bottom : 0;
        const outside =
          (i === 0 && line < r.top - CATCH) ||
          (i === els.length - 1 && line > r.bottom + CATCH);
        if (!outside && d < best) {
          best = d;
          found = i;
        }
      });
      setActive(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onResize = () => {
      const view = viewport();
      const stage = stageRef.current;
      if (stage) {
        // Centres the pinned screenshot in the view when side by side.
        setStickyTop(
          Math.max(16, (view.bottom - view.top - stage.offsetHeight) / 2),
        );
      }
      onScroll();
    };

    onResize();
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (target !== window) ro.observe(target as HTMLElement);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [scrollRoot]);

  const select = (i: number, now: number) => {
    const el = textRefs.current[i];
    const root = scrollRoot === "window" ? null : scrollRoot.current;
    if (!el) return;
    setActive(i);
    const view = root
      ? root.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const list = listRef.current?.getBoundingClientRect();
    const stage = stageRef.current?.getBoundingClientRect();
    const stacked = !!list && !!stage && stage.left < list.right - 1;
    // Where the pinned screenshot will sit once scrolled, not where it is now.
    const top = stacked ? view.top + (stage?.height ?? 0) : view.top;
    const line = (top + view.bottom) / 2;
    const r = el.getBoundingClientRect();
    const delta = r.top + r.height / 2 - line;
    lockedUntil.current = now + (reduceMotion ? 50 : 900);
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (root) root.scrollBy({ top: delta, behavior });
    else window.scrollBy({ top: delta, behavior });
  };

  return (
    // Laid out by its own width, not the viewport's, so it works in a
    // column as well as full bleed.
    // Positioned, so the sr-only live region below stays inside whatever
    // scrolls the section instead of escaping to the page and stretching it.
    // The bottom padding is where the pinned screenshot comes to rest, so it
    // stops clear of whatever follows the section instead of touching it.
    <section className={cn("@container relative w-full pb-10", className)}>
      <div className="grid grid-cols-1 gap-x-7 @[34rem]:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div
          className="sticky top-0 z-10 bg-background pt-3 pb-4 @[34rem]:order-2 @[34rem]:self-start @[34rem]:bg-transparent @[34rem]:p-0 @[34rem]:[top:var(--sticky-top)]"
          style={{ "--sticky-top": `${stickyTop}px` } as React.CSSProperties}
        >
          <div ref={stageRef}>
            <Stage
              size={screenshotSize}
              feature={active === null ? null : features[active]}
              reduceMotion={reduceMotion}
            >
              {screenshot}
            </Stage>
          </div>
        </div>

        <ol ref={listRef} className="flex flex-col @[34rem]:order-1">
          {features.map((feature, i) => {
            const on = active === i;
            return (
              // Just enough air to read one feature at a time. The last gets a
              // little more below; the page's own footer supplies the rest it
              // needs to reach the reading line.
              <li
                key={feature.title}
                className="py-8 first:pt-4 last:pb-16 @[34rem]:first:pt-6"
              >
                <div ref={(el) => void (textRefs.current[i] = el)}>
                  <button
                    type="button"
                    // Event time shares performance.now()'s clock.
                    onClick={(e) => select(i, e.timeStamp)}
                    aria-pressed={on}
                    className="group relative flex w-full touch-manipulation flex-col items-start gap-2 rounded-xl py-1 pl-4 text-left outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground active:scale-[0.96]"
                  >
                    {/* A rail beside each feature: the lit one is what the
                        screenshot is showing. */}
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-0 w-0.5 overflow-hidden rounded-full bg-border"
                    >
                      <span
                        className={cn(
                          "block size-full origin-top rounded-full bg-foreground transition-[scale] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                          on ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "text-[13px] font-medium tabular-nums transition-colors duration-300 ease-out",
                        on ? "text-foreground" : "text-muted",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "text-[17px] leading-snug font-semibold text-balance transition-colors duration-300 ease-out",
                        on
                          ? "text-foreground"
                          : "text-muted group-hover:text-foreground",
                      )}
                    >
                      {feature.title}
                    </span>
                    <span className="text-[14px] leading-relaxed text-pretty text-foreground/70">
                      {feature.body}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="sr-only" aria-live="polite">
        {active === null ? "" : `Showing: ${features[active].title}`}
      </p>
    </section>
  );
}

function Stage({
  size,
  feature,
  reduceMotion,
  children,
}: {
  size: { width: number; height: number };
  feature: Feature | null;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const camX = useMotionValue(0);
  const camY = useMotionValue(0);
  const camScale = useMotionValue(1);
  const holeX = useMotionValue(0);
  const holeY = useMotionValue(0);
  const holeW = useMotionValue(size.width);
  const holeH = useMotionValue(size.height);
  const dim = useMotionValue(0);
  const transform = useMotionTemplate`translate(${camX}px, ${camY}px) scale(${camScale})`;
  const running = useRef<AnimationPlaybackControls[]>([]);

  // The screenshot is drawn at its design size and scaled to the frame.
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(el.offsetWidth / size.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.width]);

  useEffect(() => {
    running.current.forEach((a) => a.stop());
    const shot = shotRef.current;
    const region =
      feature && shot && feature.spot
        ? measureSpot(shot, feature.spot)
        : (feature?.region ?? null);
    const W = size.width;
    const H = size.height;
    let zoom = 1;
    let x = 0;
    let y = 0;
    let hole: Region = { x: 0, y: 0, w: W, h: H };
    if (region) {
      hole = {
        x: region.x - 6,
        y: region.y - 6,
        w: region.w + 12,
        h: region.h + 12,
      };
      zoom = Math.min(
        W / (region.w + PAD * 2),
        H / (region.h + PAD * 2),
        MAX_ZOOM,
      );
      // Centre the region, but never pan past the screenshot's edges.
      const cx = region.x + region.w / 2;
      const cy = region.y + region.h / 2;
      x = Math.min(0, Math.max(W - W * zoom, W / 2 - cx * zoom));
      y = Math.min(0, Math.max(H - H * zoom, H / 2 - cy * zoom));
    }
    const pairs: [typeof camX, number][] = [
      [camX, x * fit],
      [camY, y * fit],
      [camScale, zoom],
      [holeX, hole.x],
      [holeY, hole.y],
      [holeW, hole.w],
      [holeH, hole.h],
    ];
    if (reduceMotion) {
      // No camera travel: the spotlight alone points at the region.
      pairs.forEach(([mv], i) => i > 2 && mv.jump(pairs[i][1]));
      camX.jump(0);
      camY.jump(0);
      camScale.jump(1);
      running.current = [animate(dim, region ? 1 : 0, { duration: 0.2 })];
      return;
    }
    running.current = [
      ...pairs.map(([mv, to]) => animate(mv, to, CAMERA)),
      // The dim leads on the way in and trails on the way out, so the pull
      // back reads as the room lights coming up after the camera leaves.
      animate(dim, region ? 1 : 0, {
        duration: region ? 0.35 : 0.5,
        delay: region ? 0.15 : 0,
        ease: [0.23, 1, 0.32, 1],
      }),
    ];
  }, [
    feature,
    fit,
    size.width,
    size.height,
    reduceMotion,
    camX,
    camY,
    camScale,
    holeX,
    holeY,
    holeW,
    holeH,
    dim,
  ]);

  useEffect(() => () => running.current.forEach((a) => a.stop()), []);

  return (
    <figure
      aria-hidden
      className="overflow-hidden rounded-[14px] bg-background shadow-raised"
    >
      <div className="flex h-7 items-center gap-1.5 border-b border-border bg-surface px-3">
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
      </div>
      <div
        ref={viewRef}
        className="relative overflow-hidden"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
        <motion.div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform }}
        >
          <div
            ref={shotRef}
            // Positioned, so measured spots add their offsets up to here.
            className="relative origin-top-left"
            style={{
              width: size.width,
              height: size.height,
              scale: String(fit),
            }}
          >
            {children}
            {/* The spotlight: a rounded hole whose giant shadow dims the rest.
                Sized with width and height rather than scale so its corners
                stay round; it's one element, so the layout cost is small. */}
            <motion.div
              className="pointer-events-none absolute top-0 left-0"
              style={{
                x: holeX,
                y: holeY,
                width: holeW,
                height: holeH,
                opacity: dim,
                borderRadius: HOLE_RADIUS,
                boxShadow:
                  "0 0 0 2px color-mix(in oklab, var(--foreground) 22%, transparent), 0 0 0 2000px color-mix(in oklab, var(--background) 70%, transparent)",
              }}
            />
          </div>
        </motion.div>
      </div>
    </figure>
  );
}

// The demo's product: a finance dashboard built at 640 x 440 design pixels
// with real type sizes, then shown scaled down like a screenshot.
const SIZE = { width: 640, height: 440 };

const FEATURES: Feature[] = [
  {
    title: "Your numbers before your coffee",
    body: "Revenue, churn and payouts update the moment a charge settles, so the morning check takes one glance.",
    spot: "metrics",
  },
  {
    title: "Trends you can actually read",
    body: "Ninety days of revenue on one line, with the dip on the 14th called out before anyone has to ask.",
    spot: "revenue",
  },
  {
    title: "Every payout, itemized",
    body: "Each transfer lists the customer, the fees taken and when it lands, ready to reconcile in two clicks.",
    spot: "payouts",
  },
  {
    title: "A workspace for every entity",
    body: "Run the parent company and both subsidiaries from one login, with books that never mix.",
    spot: "workspaces",
  },
];

function Dashboard() {
  // Plotted as data, not decoration: a 90 day revenue series.
  const points = [
    40, 44, 43, 48, 52, 50, 56, 58, 55, 38, 46, 57, 62, 60, 66, 70, 68, 74, 78,
    76, 82, 88,
  ];
  const w = 430;
  const h = 96;
  const step = w / (points.length - 1);
  const yOf = (v: number) => h - ((v - 30) / 60) * h;
  const line = points
    .map(
      (v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${yOf(v).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;

  return (
    <div className="relative flex h-full w-full bg-background text-[13px] text-foreground">
      <aside className="flex w-[160px] shrink-0 flex-col gap-1 border-r border-border bg-surface p-3">
        <div data-spot="workspaces" className="flex flex-col gap-1">
          <div className="flex h-11 items-center gap-2 rounded-lg bg-background px-2 shadow-raised">
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[12px] font-semibold text-background">
              A
            </span>
            <span className="flex-1 truncate font-medium">Acme Inc</span>
            <svg
              viewBox="0 0 16 16"
              className="size-3.5 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3" />
            </svg>
          </div>
          <p className="mt-3 px-2 text-[12px] text-muted">Workspaces</p>
          {["Acme Europe", "Acme Labs", "Add entity"].map((name, i) => (
            <div
              key={name}
              className="flex h-8 items-center gap-2 px-2 text-muted"
            >
              <span
                className={cn(
                  "size-4 rounded",
                  i === 2 ? "border border-dashed border-muted" : "bg-border",
                )}
              />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
        <div className="my-2 h-px bg-border" />
        {["Overview", "Payouts", "Customers", "Reports"].map((name, i) => (
          <div
            key={name}
            className={cn(
              "flex h-8 items-center rounded-md px-2",
              i === 0
                ? "bg-background font-medium shadow-raised"
                : "text-muted",
            )}
          >
            {name}
          </div>
        ))}
      </aside>

      <div className="flex flex-1 flex-col gap-3 px-5 pt-4">
        <div className="flex h-8 items-center justify-between">
          <p className="text-[16px] font-semibold">Overview</p>
          <span className="rounded-full bg-surface px-3 py-1 text-[12px] text-muted">
            Last 90 days
          </span>
        </div>
        <div data-spot="metrics" className="grid grid-cols-3 gap-3">
          {[
            ["MRR", "$48.2k", "+4.1%"],
            ["Churn", "1.8%", "−0.3%"],
            ["Next payout", "$12.9k", "Fri"],
          ].map(([label, value, delta]) => (
            <div
              key={label}
              className="flex h-[76px] flex-col justify-between rounded-lg bg-surface p-3"
            >
              <span className="text-[12px] text-muted">{label}</span>
              <span className="flex items-baseline justify-between">
                <span className="text-[20px] font-semibold tracking-tight tabular-nums">
                  {value}
                </span>
                <span className="text-[12px] text-muted tabular-nums">
                  {delta}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div
          data-spot="revenue"
          className="flex h-[138px] flex-col gap-2 rounded-lg border border-border p-3"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-muted">Revenue</span>
            <span className="text-[12px] text-muted">
              Dip on Aug 14: failed card retries
            </span>
          </div>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-[96px] w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <path d={area} className="fill-foreground/[0.06]" />
            <path
              d={line}
              fill="none"
              className="stroke-foreground"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={9 * step}
              cy={yOf(38)}
              r={4}
              className="fill-background stroke-marker"
              strokeWidth={2}
            />
          </svg>
        </div>
        <div data-spot="payouts" className="flex flex-col">
          {[
            ["Northwind Traders", "Lands Fri", "$6,420.00"],
            ["Globex Retail", "Lands Mon", "$4,180.50"],
            ["Initech", "Settled", "$2,315.00"],
          ].map(([name, when, amount]) => (
            <div
              key={name}
              className="flex h-9 items-center gap-3 border-b border-border last:border-0"
            >
              <span className="flex-1 truncate font-medium">{name}</span>
              <span className="w-20 text-[12px] text-muted">{when}</span>
              <span className="w-24 text-right tabular-nums">{amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FeatureSpotlightDemo() {
  const pageRef = useRef<HTMLDivElement>(null);
  return (
    // A scrolling page mock, so the section works inside the lab. On a real
    // site leave out `scrollRoot` and the window drives it.
    <div
      ref={pageRef}
      className="h-[560px] w-[min(680px,100%)] overflow-y-auto overscroll-contain rounded-[20px] bg-background shadow-raised [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="px-6">
        <header className="flex flex-col gap-3 pt-12 pb-4">
          <p className="text-[13px] font-medium text-muted">
            Ledgerly for finance teams
          </p>
          <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-balance">
            Everything you check before the first meeting
          </h2>
          <p className="max-w-[46ch] text-[15px] leading-relaxed text-pretty text-muted">
            Scroll through the four things teams open Ledgerly for. The
            screenshot follows along.
          </p>
        </header>
        <FeatureSpotlight
          features={FEATURES}
          screenshot={<Dashboard />}
          screenshotSize={SIZE}
          scrollRoot={pageRef}
        />
        <footer className="flex flex-col items-start gap-3 border-t border-border py-12">
          <p className="text-[17px] font-semibold">Start a 14 day trial</p>
          <p className="text-[14px] text-muted">
            No card needed. Import last year&apos;s books in minutes.
          </p>
        </footer>
      </div>
    </div>
  );
}
