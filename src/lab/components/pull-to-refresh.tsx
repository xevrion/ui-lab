"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Post = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  time: string;
  text: string;
};

// Pulled this far (after resistance), letting go refreshes.
const THRESHOLD = 64;
// Stands in for a network round trip.
const REFRESH_FOR = 1200;
// Roughly the screen height; the band stiffens relative to it.
const RUBBER_DIMENSION = 480;
// Looser than Apple's 0.55 scroll edge, so reaching the threshold takes a
// comfortable ~110px of hand travel rather than ~150px.
const RUBBER = 0.7;
// Past this many px a mouse press becomes a pull rather than a click.
const DRAG_SLOP = 4;
const TICKS = 8;
// Critically damped: an indicator that overshoots would bounce the feed.
const SETTLE = { type: "spring", visualDuration: 0.35, bounce: 0 } as const;
// Longer than a UI transition on purpose: the feed travels up to ~150px and
// the new posts should be seen arriving, not just appear.
const SLIDE_IN = { type: "spring", visualDuration: 0.5, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Apple's rubber band: follows 1:1 at first, then gives less and less.
function rubberband(distance: number) {
  return (
    (distance * RUBBER_DIMENSION * RUBBER) /
    (RUBBER_DIMENSION + RUBBER * distance)
  );
}

// Where the hand would have to be for the band to show this offset, so a
// pull caught mid-spring continues from exactly where it is.
function unband(offset: number) {
  return (offset * RUBBER_DIMENSION) / (RUBBER * (RUBBER_DIMENSION - offset));
}

// The indeterminate spin is a stepped rotation of graded ticks, like the
// system activity indicator, and it only runs while refreshing.
const CSS = `
.ptr-spin[data-spinning="true"] { animation: ptr-spin 0.8s steps(8) infinite; }
@keyframes ptr-spin { to { rotate: 360deg; } }
@media (prefers-reduced-motion: reduce) {
  .ptr-spin[data-spinning="true"] { animation: none; }
}
`;

type Anim = ReturnType<typeof animate>;

export function PullToRefresh({
  initialPosts,
  loadPosts,
  className,
}: {
  initialPosts: Post[];
  // Returns the posts to add on top. Called once per refresh.
  loadPosts: () => Post[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [posts, setPosts] = useState(() =>
    initialPosts.map((post) => ({ ...post, fresh: false })),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const added = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const yAnim = useRef<Anim | null>(null);
  const fadeAnim = useRef<Anim | null>(null);
  const loader = useRef(loadPosts);

  const y = useMotionValue(0);
  // Dropped to 0 when the refresh ends, so the spinner fades rather than
  // shrinking tick by tick as the feed retracts.
  const fade = useMotionValue(1);
  // Share of ticks drawn in; grows with the pull like the system indicator.
  const reveal = useMotionValue(0);
  const opacity = useTransform(
    () => Math.min(Math.max(y.get() / THRESHOLD, 0), 1) * fade.get(),
  );
  const rotate = useTransform(y, (v) => v * 3);

  useEffect(() => {
    loader.current = loadPosts;
  });

  const stopY = () => {
    yAnim.current?.stop();
    yAnim.current = null;
  };

  const moveY = (target: number, transition: object) => {
    stopY();
    if (reduceMotion) {
      y.jump(target);
      return;
    }
    yAnim.current = animate(y, target, transition);
  };

  // One code path for touch, mouse and the button, so all three look alike.
  const gesture = useRef<{ base: number; samples: { y: number; t: number }[] } | null>(
    null,
  );

  const begin = () => {
    stopY();
    fadeAnim.current?.stop();
    fade.jump(1);
    gesture.current = { base: unband(Math.max(y.get(), 0)), samples: [] };
  };

  const pull = (distance: number, t: number) => {
    const g = gesture.current;
    if (!g) return;
    const offset = rubberband(Math.max(g.base + distance, 0));
    y.set(offset);
    reveal.set(Math.min(offset / THRESHOLD, 1));
    g.samples.push({ y: offset, t });
    // Only the last 100ms say how fast the feed is moving now.
    while (g.samples.length > 2 && t - g.samples[0].t > 100) g.samples.shift();
  };

  const startRefresh = (velocity = 0) => {
    busy.current = true;
    setRefreshing(true);
    setAnnouncement("");
    reveal.jump(1);
    fade.jump(1);
    moveY(THRESHOLD, { ...SETTLE, velocity });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const fresh = loader.current().map((post) => ({ ...post, fresh: true }));
      added.current = fresh.length;
      if (!reduceMotion)
        fadeAnim.current = animate(fade, 0, { duration: 0.15, ease: EASE_OUT });
      setPosts((p) => [...fresh, ...p].slice(0, 40));
      setRefreshing(false);
      setAnnouncement(
        `Updated, ${fresh.length} new post${fresh.length === 1 ? "" : "s"}`,
      );
      busy.current = false;
    }, REFRESH_FOR);
  };

  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const first = g.samples[0];
    const last = g.samples[g.samples.length - 1];
    const dt = first && last ? (last.t - first.t) / 1000 : 0;
    const velocity = dt > 0 ? (last.y - first.y) / dt : 0;
    if (y.get() >= THRESHOLD) startRefresh(velocity);
    else moveY(0, { ...SETTLE, velocity });
  };

  // New posts land above the ones on screen. Shifting the feed up by their
  // height keeps everything visually still for a frame, then the feed
  // springs down from the threshold, which slides the posts in from the top
  // and retracts the indicator in one motion.
  useLayoutEffect(() => {
    const count = added.current;
    const list = listRef.current;
    if (!count || !list) return;
    added.current = 0;
    const firstOld = list.children[count] as HTMLElement | undefined;
    const height = firstOld
      ? firstOld.offsetTop - (list.children[0] as HTMLElement).offsetTop
      : 0;
    stopY();
    if (reduceMotion) {
      y.jump(0);
      return;
    }
    y.jump(y.get() - height);
    yAnim.current = animate(y, 0, SLIDE_IN);
  }, [posts, reduceMotion, y]);

  // Touch listeners are attached by hand because the pull has to cancel the
  // browser's own scroll, which React's passive touchmove can't do.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let start: { y: number; pulling: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      start = null;
      // Only from the very top, and never while a refresh or the slide in
      // is still running.
      if (busy.current || e.touches.length > 1 || el.scrollTop > 0 || y.get() < 0)
        return;
      start = { y: e.touches[0].clientY, pulling: false };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dy = e.touches[0].clientY - start.y;
      if (!start.pulling) {
        // Scrolling up the feed is a normal scroll; leave it alone.
        if (dy <= 0 || el.scrollTop > 0) {
          start = null;
          return;
        }
        start.pulling = true;
        begin();
      }
      e.preventDefault();
      pull(dy, e.timeStamp);
    };
    const onEnd = () => {
      if (start?.pulling) end();
      start = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      yAnim.current?.stop();
      fadeAnim.current?.stop();
    },
    [],
  );

  const mouse = useRef<{ y: number; pulling: boolean } | null>(null);

  return (
    // 44px outer radius around 10px of bezel leaves 34px for the screen.
    <div
      className={cn(
        "h-[480px] w-[min(320px,100%)] rounded-[44px] bg-surface p-2.5 shadow-raised",
        className,
      )}
    >
      <style href="pull-to-refresh" precedence="default">
        {CSS}
      </style>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[34px] bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pr-3 pl-5">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
            Following
          </h3>
          <button
            type="button"
            aria-label="Refresh feed"
            aria-disabled={refreshing}
            onClick={() => {
              if (busy.current) return;
              scrollerRef.current?.scrollTo({
                top: 0,
                behavior: reduceMotion ? "auto" : "smooth",
              });
              startRefresh();
            }}
            className="flex size-9 items-center justify-center rounded-full text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] aria-disabled:opacity-50 motion-reduce:transition-[color,background-color]"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.77M13.25 2.5v2.75H10.5" />
            </svg>
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <motion.div
            aria-hidden
            style={{ opacity }}
            className="absolute inset-x-0 top-0 flex h-16 items-center justify-center text-foreground"
          >
            <motion.div style={{ rotate }}>
              <svg
                viewBox="0 0 24 24"
                className="ptr-spin size-6"
                data-spinning={refreshing}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                {Array.from({ length: TICKS }, (_, i) => (
                  <Tick key={i} index={i} reveal={reveal} />
                ))}
              </svg>
            </motion.div>
          </motion.div>

          <div
            ref={scrollerRef}
            aria-busy={refreshing}
            tabIndex={0}
            role="region"
            aria-label="Feed"
            className="relative h-full overflow-y-auto overscroll-contain outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground"
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse" || e.button !== 0) return;
              if (busy.current || e.currentTarget.scrollTop > 0 || y.get() < 0) return;
              mouse.current = { y: e.clientY, pulling: false };
            }}
            onPointerMove={(e) => {
              const m = mouse.current;
              if (!m) return;
              const dy = e.clientY - m.y;
              if (!m.pulling) {
                if (dy < -DRAG_SLOP) mouse.current = null;
                if (dy <= DRAG_SLOP) return;
                m.pulling = true;
                // Starts counting from here, so crossing the slop never
                // makes the feed jump.
                m.y = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
                begin();
              }
              pull(e.clientY - m.y, e.timeStamp);
            }}
            onPointerUp={() => {
              if (mouse.current?.pulling) end();
              mouse.current = null;
            }}
            onPointerCancel={() => {
              if (mouse.current?.pulling) end();
              mouse.current = null;
            }}
          >
            <motion.div style={{ y }} className="min-h-full bg-background select-none">
              <div ref={listRef}>
                {posts.map((post) => (
                  <motion.article
                    key={post.id}
                    initial={
                      post.fresh
                        ? reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: "blur(4px)" }
                        : false
                    }
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                    className="flex gap-3 border-b border-border px-5 py-3.5"
                  >
                    <span className="size-9 shrink-0 overflow-hidden rounded-full bg-[oklch(0.97_0_0)] outline-1 -outline-offset-1 outline-[oklch(0_0_0/0.1)] dark:outline-[oklch(1_0_0/0.1)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.avatar} alt="" className="size-full" draggable={false} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-1.5 text-[14px]">
                        <span className="truncate font-medium text-foreground">
                          {post.name}
                        </span>
                        <span className="shrink-0 text-[13px] text-muted">
                          {post.handle} · {post.time}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[14px] leading-5 text-pretty text-foreground">
                        {post.text}
                      </p>
                    </div>
                  </motion.article>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      </div>
    </div>
  );
}

// Graded like the system spinner: the leading tick is solid and each one
// behind it fades, so the stepped rotation reads as a sweep.
function Tick({ index, reveal }: { index: number; reveal: MotionValue<number> }) {
  // Ticks are drawn in clockwise from the top as the pull grows.
  const order = (TICKS - index) % TICKS;
  const opacity = useTransform(reveal, (r) =>
    r * TICKS > order ? 1 - index * 0.1 : 0,
  );
  return (
    <motion.line
      x1="12"
      y1="3"
      x2="12"
      y2="7"
      style={{ opacity }}
      transform={`rotate(${-index * (360 / TICKS)} 12 12)`}
    />
  );
}

const PEOPLE = [
  { name: "Ava Chen", handle: "@ava", avatar: "/avatars/ava.svg" },
  { name: "Ben Ortiz", handle: "@ben", avatar: "/avatars/ben.svg" },
  { name: "Cara Nwosu", handle: "@cara", avatar: "/avatars/cara.svg" },
  { name: "Dev Patel", handle: "@dev", avatar: "/avatars/dev.svg" },
  { name: "Fay Laurent", handle: "@fay", avatar: "/avatars/fay.svg" },
];

const INITIAL: Post[] = [
  "Shipped the new onboarding today. Two screens instead of five.",
  "Hot take: most loading spinners should be skeletons.",
  "Springs over durations for anything you can touch. Every time.",
  "Rewrote the settings page with plain CSS grid. Deleted 400 lines.",
  "The best animation is often the one you remove.",
  "Anyone else test gestures at 10% speed? It changes everything.",
  "Tabular numbers in every table, please.",
  "Friday demo went well. The drag-to-reorder finally feels right.",
].map((text, i) => ({
  ...PEOPLE[i % PEOPLE.length],
  id: `seed-${i}`,
  time: `${(i + 1) * 7}m`,
  text,
}));

const INCOMING = [
  "Just found out our checkout button had a 300ms tap delay. Fixed.",
  "Reduced motion is not no motion. Cross-fades still help.",
  "Pairing on the new command palette this afternoon.",
  "Velocity handoff is the whole trick. Nobody notices, everyone feels it.",
  "Our design review now includes a slow-motion pass.",
  "New icons landed. One stroke weight across the whole set.",
];

export default function PullToRefreshDemo() {
  const next = useRef(0);
  return (
    <PullToRefresh
      initialPosts={INITIAL}
      loadPosts={() =>
        Array.from({ length: 2 }, () => {
          const n = next.current++;
          return {
            ...PEOPLE[(n + 3) % PEOPLE.length],
            id: `new-${n}`,
            time: "now",
            text: INCOMING[n % INCOMING.length],
          };
        })
      }
    />
  );
}
