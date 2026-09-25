"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/cn";

/* The teachable part: the badge is one card clipped down to a pill. Opening
   it animates clip-path from the pill's box to the card's box, so the pill
   you are pointing at never moves or redraws; the rest of the card is
   uncovered around it. The strip below it answers the question a visitor
   actually has: when are we both awake and working? */

export type Availability = "available" | "busy" | "away";

const STATUS: Record<Availability, { label: string; dot: string }> = {
  // Status colors are data, read as traffic lights, so they are raw values
  // tuned per theme rather than tokens.
  available: { label: "Available for work", dot: "light-dark(#16a34a, #3fcf6e)" },
  busy: { label: "Booked until March", dot: "light-dark(#d97706, #f5a524)" },
  away: { label: "Away, back Monday", dot: "light-dark(#8f8f8f, #737373)" },
};

const PULSE_CSS = `
@keyframes availability-sonar { from { transform: scale(1); opacity: .55 } to { transform: scale(2.6); opacity: 0 } }
@keyframes availability-beat { 0%, 40%, 100% { transform: scale(1) } 12% { transform: scale(1.35) } 26% { transform: scale(1.15) } }
@media (prefers-reduced-motion: reduce) { .availability-pulse { animation: none !important } }
`;

const DAY = 1440;

/* Time */

function offsetMinutes(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

const minutesIn = (timeZone: string, at: Date) => {
  const utc = at.getUTCHours() * 60 + at.getUTCMinutes();
  return (((utc + offsetMinutes(timeZone, at)) % DAY) + DAY) % DAY;
};

function clock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

const city = (timeZone: string) => timeZone.split("/").pop()!.replace(/_/g, " ");

// One shared minute clock. It ticks on the minute boundary, not every 60s
// from mount, so the displayed time never lags the real one.
const minuteStore = (() => {
  let now = 0;
  const subs = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    now = Date.now();
    subs.forEach((f) => f());
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  };
  return {
    subscribe(f: () => void) {
      subs.add(f);
      if (subs.size === 1) tick();
      return () => {
        subs.delete(f);
        if (subs.size === 0) clearTimeout(timer);
      };
    },
    get: () => now,
  };
})();

// Zero on the server and during hydration, so nothing time based renders
// until the client knows the real time.
const useNow = () => useSyncExternalStore(minuteStore.subscribe, minuteStore.get, () => 0);

const noop = () => () => {};
const useVisitorZone = () =>
  useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );

/* Ranges on a 24h clock, split where they wrap past midnight. */

type Span = [number, number];

function spans(start: number, end: number): Span[] {
  const s = ((start % DAY) + DAY) % DAY;
  const len = (((end - start) % DAY) + DAY) % DAY || DAY;
  return s + len <= DAY ? [[s, s + len]] : [[s, DAY], [0, s + len - DAY]];
}

function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) {
      const s = Math.max(a0, b0);
      const e = Math.min(a1, b1);
      if (e > s) out.push([s, e]);
    }
  // A window crossing midnight comes back as two pieces; the one starting
  // later in the day is where it really begins.
  return out.sort((x, y) => x[0] - y[0]);
}

/* The little sky: a sun by day, a moon by night, riding one arc. */

function Sky({ minutes }: { minutes: number }) {
  const day = minutes >= 360 && minutes < 1080;
  // 6am to 6pm maps across the arc for the sun, 6pm to 6am for the moon.
  const t = ((minutes - (day ? 360 : 1080) + DAY) % DAY) / 720;
  const angle = Math.PI * (1 - t);
  const x = 12 + 9 * Math.cos(angle);
  const y = 12 - 8 * Math.sin(angle);
  return (
    <svg viewBox="0 0 24 14" className="h-4 w-7 shrink-0 overflow-visible max-[400px]:hidden" aria-hidden>
      <path d="M3 12a9 8 0 0 1 18 0" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="1.5 1.5" />
      <path d="M1.5 12h21" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} />
      <g
        style={{ transform: `translate(${x}px, ${y}px)` }}
        className="transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
      >
        {day ? (
          <circle r={2.8} fill="currentColor" />
        ) : (
          <path d="M1.2-2.4a2.6 2.6 0 1 0 1.3 3.6A2.1 2.1 0 0 1 1.2-2.4z" fill="currentColor" />
        )}
      </g>
    </svg>
  );
}

function StatusDot({ status }: { status: Availability }) {
  const color = STATUS[status].dot;
  return (
    <span aria-hidden className="relative flex size-2.5 shrink-0 items-center justify-center">
      {status === "available" && (
        // Sonar: open for business, broadcasting.
        <span
          className="availability-pulse absolute inset-0 rounded-full"
          style={{ background: color, animation: "availability-sonar 2s cubic-bezier(0.23,1,0.32,1) infinite" }}
        />
      )}
      <span
        className={cn("availability-pulse relative size-2.5 rounded-full", status === "away" && "border-2 bg-transparent")}
        style={
          status === "busy"
            ? // Heartbeat: alive and working, just not taking more.
              { background: color, animation: "availability-beat 1.6s ease-out infinite" }
            : status === "away"
              ? // Hollow and still: nobody at the desk.
                { borderColor: color }
              : { background: color }
        }
      />
    </span>
  );
}

export function AvailabilityBadge({
  timeZone,
  hours = [9, 18],
  status = "available",
  label,
  replyHint = "Replies within a day",
  name = "me",
  visitorTimeZone,
  visitorHours = [9, 18],
  className,
}: {
  // IANA zone of the owner, like "Europe/Lisbon".
  timeZone: string;
  // Working hours in the owner's local time, 24h. Fractions allowed: 9.5 is 9:30.
  hours?: [number, number];
  status?: Availability;
  label?: string;
  replyHint?: string;
  name?: string;
  // Defaults to the visitor's own zone from Intl.
  visitorTimeZone?: string;
  // The visitor's assumed working day, for the overlap.
  visitorHours?: [number, number];
  className?: string;
}) {
  const id = useId();
  const nowMs = useNow();
  const detected = useVisitorZone();
  const zone = visitorTimeZone ?? detected;
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // How much of the card to cut away on the right and bottom to leave just
  // the pill. Only changes on resize, never while opening.
  const [clip, setClip] = useState({ right: 0, bottom: 0 });

  useLayoutEffect(() => {
    const c = card.current;
    const p = pill.current;
    if (!c || !p) return;
    const measure = () =>
      setClip({ right: c.offsetWidth - p.offsetWidth, bottom: c.offsetHeight - p.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    ro.observe(p);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short grace period, so crossing the gap between pill and card edge,
  // or a jittery pointer, never snaps it shut.
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const ready = nowMs > 0 && zone !== null;
  const now = new Date(nowMs);
  const ownerMinutes = ready ? minutesIn(timeZone, now) : 0;
  const visitorMinutes = ready ? minutesIn(zone, now) : 0;
  const shift = ready ? offsetMinutes(zone, now) - offsetMinutes(timeZone, now) : 0;
  const same = shift === 0;

  // Everything below is drawn on the visitor's clock.
  const owner = spans(hours[0] * 60 + shift, hours[1] * 60 + shift);
  const visitor = spans(visitorHours[0] * 60, visitorHours[1] * 60);
  const both = intersect(owner, visitor);
  // Rejoin a window split at midnight for the sentence.
  const best: Span | null =
    both.length === 0
      ? null
      : both.length === 2 && both[0][0] === 0 && both[1][1] === DAY
        ? [both[1][0], both[0][1] + DAY]
        : both.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));

  const sentence = !ready
    ? " "
    : best
      ? `Best time to reach me: ${clock(best[0] % DAY)} to ${clock(best[1] % DAY)} your time`
      : `Our days don't overlap. I start at ${clock(owner[0][0])} your time`;

  const working = owner.some(([s, e]) => visitorMinutes >= s && visitorMinutes < e);
  const pct = (m: number) => `${(m / DAY) * 100}%`;

  return (
    <div
      className={cn("relative h-10 w-full max-w-[400px]", className)}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") show();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") hide();
      }}
      // No open on focus: the keyboard opens it with Enter or Space, which
      // would otherwise shut the card that focus had just opened.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide();
      }}
    >
      <style>{PULSE_CSS}</style>
      {/* The drop shadow sits on a wrapper: a filter on the parent follows
          the clipped shape, a box-shadow on the card would be clipped away. */}
      {/* Two drop shadows: a hairline that stands in for a border (a real
          border would be clipped at the pill's edge), and the lift. */}
      <div className="absolute top-0 left-0 z-20 w-full [filter:drop-shadow(0_0_0.5px_light-dark(oklch(0_0_0/0.28),oklch(1_0_0/0.22)))_drop-shadow(0_6px_14px_light-dark(oklch(0_0_0/0.08),oklch(0_0_0/0.5)))]">
        <div
          ref={card}
          style={{
            clipPath: open
              ? "inset(0 0 0 0 round 20px)"
              : `inset(0 ${clip.right}px ${clip.bottom}px 0 round 20px)`,
          }}
          className={cn(
            "w-full bg-background text-foreground dark:bg-surface",
            "[transition-property:clip-path] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:duration-0",
            // Opening is the thing being looked at; closing just gets out of
            // the way, so it is quicker.
            open ? "duration-[260ms]" : "duration-[180ms]",
          )}
        >
          <button
            ref={pill}
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            // A mouse already opened it on hover, so its click must not shut
            // it again; touch and keyboard toggle.
            onClick={(e) => {
              const n = e.nativeEvent;
              const fromMouse = n instanceof PointerEvent && n.pointerType === "mouse";
              setOpen((o) => (fromMouse ? true : !o));
            }}
            className="flex h-10 w-fit touch-manipulation items-center gap-2.5 rounded-full pr-4 pl-3.5 text-[14px] whitespace-nowrap outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
          >
            <StatusDot status={status} />
            <span className="font-medium">{label ?? STATUS[status].label}</span>
            <span aria-hidden className="h-4 w-px bg-border" />
            <span className="flex items-center gap-1.5 text-muted tabular-nums">
              {ready && <Sky minutes={ownerMinutes} />}
              <span className="min-w-[4.5ch]">{ready ? clock(ownerMinutes) : ""}</span>
              <span className="sr-only">in {city(timeZone)}</span>
            </span>
          </button>

          <div
            id={`${id}-panel`}
            inert={!open}
            className={cn(
              "px-4 pt-2 pb-4 transition-[opacity,filter,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0",
              open
                ? "translate-y-0 opacity-100 blur-none delay-75 duration-200"
                : "-translate-y-1 opacity-0 blur-[4px] duration-100",
            )}
          >
            <p className="text-[13px] text-muted">
              {replyHint}
              {ready && (
                <>
                  {" · "}
                  {working ? "working now" : "off the clock right now"} in {city(timeZone)}
                </>
              )}
            </p>

            <div className="mt-4 flex gap-3 text-[12px] text-muted">
              <div className="flex w-[52px] shrink-0 flex-col gap-2 pt-1.5">
                <span className="h-3 truncate leading-3">{name === "me" ? "Me" : name}</span>
                <span className="h-3 truncate leading-3">You</span>
              </div>
              <div className="relative min-w-0 flex-1 pt-1.5">
                {/* The shared window, lit through both tracks. */}
                {both.map(([s, e]) => (
                  <span
                    key={`w${s}`}
                    aria-hidden
                    className="absolute top-0 h-[42px] rounded-md bg-foreground/[0.07]"
                    style={{ left: pct(s), width: pct(e - s) }}
                  />
                ))}
                <div className="flex flex-col gap-2">
                  <Track spans={owner} both={both} />
                  <Track spans={visitor} both={both} />
                </div>
                <div className="relative mt-2 h-4">
                  {[0, 6, 12, 18].map((h) => (
                    <span
                      key={h}
                      className="absolute top-0 -translate-x-1/2 tabular-nums first:translate-x-0 max-sm:even:hidden"
                      style={{ left: pct(h * 60) }}
                    >
                      {clock(h * 60)}
                    </span>
                  ))}
                </div>
                {/* "Now" on the visitor's clock, through both tracks. */}
                {ready && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-0 h-[42px] w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-surface"
                    style={{ left: pct(visitorMinutes) }}
                  />
                )}
              </div>
            </div>

            <p aria-live="polite" className="mt-4 text-[14px] font-medium text-pretty">
              {sentence}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {ready && (same ? `We're both on ${city(timeZone)} time` : `You're in ${city(zone)}, I'm in ${city(timeZone)}`)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Track({ spans, both }: { spans: Span[]; both: Span[] }) {
  const pct = (m: number) => `${(m / DAY) * 100}%`;
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-foreground/[0.06]">
      {spans.map(([s, e]) => (
        <span
          key={s}
          className="absolute inset-y-0 rounded-full bg-foreground/20"
          style={{ left: pct(s), width: pct(e - s) }}
        />
      ))}
      {both.map(([s, e]) => (
        <span
          key={`o${s}`}
          className="absolute inset-y-0 rounded-full bg-foreground"
          style={{ left: pct(s), width: pct(e - s) }}
        />
      ))}
    </div>
  );
}

/* A portfolio hero using it. */

const VIEWS = [
  { value: undefined, label: "Your zone" },
  { value: "America/New_York", label: "New York" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Australia/Sydney", label: "Sydney" },
] as const;

export default function AvailabilityBadgeDemo() {
  const [view, setView] = useState(0);
  const [status, setStatus] = useState<Availability>("available");
  return (
    <div className="flex w-[500px] max-w-full flex-col">
      {/* The top of a portfolio page: who, the badge, the pitch, the ask. */}
      <div className="px-1">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a static
              local SVG avatar; next/image adds nothing here. */}
          <img
            src="/avatars/cara.svg"
            alt=""
            width={44}
            height={44}
            className="size-11 rounded-full bg-[oklch(0.97_0_0)] outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-foreground">Inês Duarte</p>
            <p className="text-[13px] text-muted">Product designer, Lisbon</p>
          </div>
        </div>
        <AvailabilityBadge
          className="mt-7"
          timeZone="Europe/Lisbon"
          hours={[10, 19]}
          status={status}
          replyHint="Replies within 4 hours"
          visitorTimeZone={VIEWS[view].value}
        />
        <h2 className="mt-5 text-[30px]/[1.12] font-semibold tracking-[-0.02em] text-balance text-foreground">
          Calm software for busy teams.
        </h2>
        <p className="mt-3 max-w-[440px] text-[15px] leading-relaxed text-pretty text-muted">
          Previously design lead at a payments startup. Now taking on two projects a
          quarter: design systems, onboarding, and anything with a dashboard.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href="#book"
            onClick={(e) => e.preventDefault()}
            className="flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
          >
            Book an intro call
          </a>
          <a
            href="#work"
            onClick={(e) => e.preventDefault()}
            className="flex h-10 items-center rounded-full px-4 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
          >
            Selected work
          </a>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3 border-t border-border pt-4">
        <Segmented
          label="Status"
          options={(["available", "busy", "away"] as const).map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1) }))}
          value={status}
          onChange={(k) => setStatus(k as Availability)}
        />
        <Segmented
          label="View as"
          options={VIEWS.map((v, i) => ({ key: String(i), label: v.label }))}
          value={String(view)}
          onChange={(k) => setView(Number(k))}
        />
      </div>
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[13px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "h-9 touch-manipulation rounded-full px-3 text-[13px] outline-hidden transition-[scale,background-color,color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]",
              value === o.key ? "bg-foreground text-background" : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
