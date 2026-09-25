"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

// A minute-resolution store: the text and the day/night face only change on
// the minute, so React renders once a minute while rAF writes move the hands.
function subscribeMinute(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    // 20ms past the boundary so the snapshot is already the new minute.
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 20);
  };
  const tick = () => {
    onChange();
    schedule();
  };
  schedule();
  return () => clearTimeout(timer);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
// The server can't know the time, so it renders a neutral, handless face and
// "--:--"; the client fills both in after hydration.
const serverSnapshot = () => null;

// Milliseconds to add to UTC to get the wall clock in `timeZone`. Read once a
// minute rather than per frame: formatToParts is far too slow for rAF.
function zoneOffset(timeZone: string | undefined, at: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - (at - (at % 1000));
}

// Twelve hour ticks, quarters longer. Rounded so server and client print
// identical coordinates.
const round = (n: number) => Math.round(n * 100) / 100;
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const inner = major ? 13 : 14.5;
  return {
    major,
    x1: round(20 + Math.sin(a) * inner),
    y1: round(20 - Math.cos(a) * inner),
    x2: round(20 + Math.sin(a) * 16.5),
    y2: round(20 - Math.cos(a) * 16.5),
  };
});

const HAND_ORIGIN = { transformOrigin: "20px 20px" } as const;

export function MiniClock({
  place,
  timeZone,
  size = 36,
  paused = false,
  className,
}: {
  place: string;
  /** IANA zone like "Europe/Lisbon". Defaults to the reader's own zone. */
  timeZone?: string;
  size?: number;
  /** Stops the sweep: the hour and minute stay right, the second hand
   * rests. For pages showing many clocks at once. */
  paused?: boolean;
  className?: string;
}) {
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, serverSnapshot);
  const face = useRef<SVGSVGElement>(null);
  const hourHand = useRef<SVGLineElement>(null);
  const minuteHand = useRef<SVGLineElement>(null);
  const secondHand = useRef<SVGGElement>(null);
  // Where the second hand was last drawn, so a paused clock can hold it and
  // a waking one can sweep on from it.
  const secAngle = useRef<number | null>(null);
  // Paused clocks redraw on the minute; live ones never need to.
  const pausedMinute = paused ? minute : null;

  const info = useMemo(() => {
    if (minute === null) return null;
    const at = minute * 60_000;
    // Fixed locale so the text reads the same for every visitor.
    const fmt = (o: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-GB", { timeZone, ...o }).format(at);
    const hour = Number(fmt({ hour: "numeric", hourCycle: "h23" }));
    return {
      time: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      date: fmt({ weekday: "short", day: "numeric", month: "short" }),
      iso: new Date(at).toISOString(),
      night: hour < 6 || hour >= 19,
    };
  }, [minute, timeZone]);

  const ready = info !== null;

  useEffect(() => {
    if (!ready) return;
    const svg = face.current;
    if (!svg) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Waking from a pause, the second hand catches up clockwise over
    // ~450ms instead of teleporting to the current second.
    let catchUp =
      !paused && !reduce.matches && secAngle.current !== null
        ? { from: secAngle.current, at: performance.now() }
        : null;

    let offset = zoneOffset(timeZone, Date.now());
    let offsetAt = Date.now();
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;

    const draw = () => {
      const now = Date.now();
      if (now - offsetAt > 60_000) {
        // Picks up daylight saving changes without a reload.
        offset = zoneOffset(timeZone, now);
        offsetAt = now;
      }
      const t = new Date(now + offset);
      // Reduced motion ticks the seconds instead of sweeping them.
      const ms = reduce.matches ? 0 : t.getUTCMilliseconds();
      const s = t.getUTCSeconds() + ms / 1000;
      const m = t.getUTCMinutes() + s / 60;
      const h = (t.getUTCHours() % 12) + m / 60;
      let sec = s * 6;
      if (paused && secAngle.current !== null) sec = secAngle.current;
      else if (catchUp) {
        const k = Math.min((performance.now() - catchUp.at) / 450, 1);
        const ahead = (((sec - catchUp.from) % 360) + 360) % 360;
        sec = catchUp.from + ahead * (1 - (1 - k) ** 3);
        if (k === 1) catchUp = null;
      }
      secAngle.current = sec % 360;
      secondHand.current?.style.setProperty("transform", `rotate(${sec}deg)`);
      minuteHand.current?.style.setProperty("transform", `rotate(${m * 6}deg)`);
      hourHand.current?.style.setProperty("transform", `rotate(${h * 30}deg)`);
    };

    const loop = () => {
      draw();
      if (!visible || document.hidden) return;
      if (reduce.matches) timer = setTimeout(loop, 1000 - (Date.now() % 1000));
      else raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    const restart = () => {
      stop();
      loop();
    };

    // Places the hands before they fade in, so they never swing from 12.
    draw();
    // A paused clock costs nothing between minutes: no loop, no observers.
    if (paused) return;

    // The loop sleeps whenever the face is off screen or the tab is hidden.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      restart();
    });
    io.observe(svg);
    document.addEventListener("visibilitychange", restart);
    reduce.addEventListener("change", restart);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", restart);
      reduce.removeEventListener("change", restart);
    };
  }, [ready, timeZone, paused, pausedMinute]);

  const night = info?.night ?? false;

  return (
    <span
      // Focusable so keyboard users can reveal the date, same as hovering.
      tabIndex={0}
      role="img"
      aria-label={info ? `${place}, ${info.time} local time, ${info.date}` : place}
      className={cn(
        "group/clock relative inline-flex items-center gap-2.5 rounded-full py-0.5 pr-2 pl-0.5 align-middle text-sm outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground",
        className,
      )}
    >
      <svg
        ref={face}
        viewBox="0 0 40 40"
        width={size}
        height={size}
        aria-hidden
        className={cn(
          "shrink-0 rounded-full",
          // The face inverts after dark. 400ms is slow for UI, but it runs
          // twice a day and a soft dusk reads better than a snap.
          "transition-[color,background-color,box-shadow] duration-400 ease-[cubic-bezier(0.77,0,0.175,1)]",
          night ? "bg-foreground text-background" : "bg-surface text-foreground shadow-raised",
        )}
      >
        {TICKS.map(({ major, ...line }, i) => (
          <line
            key={i}
            {...line}
            stroke="currentColor"
            strokeWidth={major ? 1.6 : 1}
            strokeLinecap="round"
            opacity={major ? 0.5 : 0.22}
          />
        ))}
        {/* Hands fade in once the client knows the time; the server face is
            deliberately empty so nothing points at a wrong hour. */}
        <g
          className={cn(
            "transition-opacity duration-300 ease-out",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <line
            ref={hourHand}
            x1="20"
            y1="21.5"
            x2="20"
            y2="11.5"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            style={HAND_ORIGIN}
          />
          <line
            ref={minuteHand}
            x1="20"
            y1="22"
            x2="20"
            y2="6.5"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            style={HAND_ORIGIN}
          />
          {/* The only accent: a red-pen second hand, same on both faces. */}
          <g ref={secondHand} className="text-marker" style={HAND_ORIGIN}>
            <line x1="20" y1="24.5" x2="20" y2="5" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
            <circle cx="20" cy="20" r="1.7" fill="currentColor" />
          </g>
        </g>
      </svg>

      <span aria-hidden className="relative flex items-baseline whitespace-nowrap">
        <span className="font-medium text-foreground">{place},</span>
        <time dateTime={info?.iso} className="ml-1 text-muted tabular-nums">
          {info?.time ?? "--:--"}
        </time>
        {/* The date unfolds to the right on hover or focus. Out of flow, so
            the line it sits in never reflows or recentres around it; a
            left-to-right clip reads as the text being written out. */}
        <span
          className={cn(
            "pointer-events-none absolute top-0 left-full pl-2 text-muted",
            // Leaves faster and softer (150ms) than it arrives (220ms).
            "opacity-0 blur-[4px] [clip-path:inset(0_100%_0_0)] transition-[opacity,filter,clip-path] duration-150 ease-out",
            "group-hover/clock:opacity-100 group-hover/clock:filter-none group-hover/clock:[clip-path:inset(0_0_0_0)] group-hover/clock:duration-[220ms] group-hover/clock:ease-[cubic-bezier(0.23,1,0.32,1)]",
            "group-focus-visible/clock:opacity-100 group-focus-visible/clock:filter-none group-focus-visible/clock:[clip-path:inset(0_0_0_0)]",
            "motion-reduce:[clip-path:inset(0_0_0_0)]",
          )}
        >
          {info?.date ?? ""}
        </span>
      </span>
    </span>
  );
}

export default function MiniClockDemo() {
  // In an index card the hands only sweep while the card is hovered; at
  // rest they hold, still showing the right time.
  const paused = usePreviewPlay() === false;
  return (
    // Two studios far enough apart that one is usually dark.
    <div className="flex flex-col items-start gap-2">
      <MiniClock place="Lisbon" timeZone="Europe/Lisbon" paused={paused} />
      <MiniClock place="Tokyo" timeZone="Asia/Tokyo" paused={paused} />
    </div>
  );
}
