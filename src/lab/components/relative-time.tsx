"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// A digit roll: long enough to read as motion, short enough that a
// seconds counter never has two rolls overlapping.
const ROLL = { duration: 0.3, ease: [0.32, 0.72, 0, 1] } as const;
// Tooltips: first one waits so passing over text doesn't flash it, then
// neighbours open instantly while the group is still "warm".
const OPEN_DELAY = 400;
const WARM_FOR = 500;
let lastClosedAt = 0;

const tooltipFormat = () =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function label(diff: number, time: number) {
  if (diff < 10 * SEC) return "just now";
  if (diff < MIN) return `${Math.floor(diff / SEC)} sec ago`;
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) return `${Math.floor(diff / DAY)} days ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(time);
}

// Milliseconds until label() would return something different, so the
// component wakes exactly once per visible change instead of every second.
function untilChange(diff: number) {
  if (diff < 0) return -diff;
  if (diff < 10 * SEC) return 10 * SEC - diff;
  // Past a week it shows a calendar date; an hourly check is plenty.
  if (diff >= WEEK) return HOUR;
  const unit = diff < MIN ? SEC : diff < HOUR ? MIN : diff < DAY ? HOUR : DAY;
  return unit - (diff % unit);
}

// setTimeout overflows past ~24.8 days and fires immediately.
const MAX_TIMEOUT = 2 ** 31 - 1;
// Lands just past the boundary so floor() has definitely moved.
const SETTLE_MS = 20;

function useRelativeLabel(time: number | null, now?: number) {
  const pinned = now !== undefined;
  const subscribe = useCallback(
    (notify: () => void) => {
      // A pinned clock only changes when the caller passes a new one.
      if (time === null || pinned) return () => {};
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        const wait = untilChange(Date.now() - time) + SETTLE_MS;
        timer = setTimeout(
          () => {
            notify();
            schedule();
          },
          Math.min(wait, MAX_TIMEOUT),
        );
      };
      schedule();
      // Background tabs throttle timers; catch up the moment we're seen.
      const onVisible = () => {
        if (document.visibilityState !== "visible") return;
        clearTimeout(timer);
        notify();
        schedule();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
    [time, pinned],
  );
  const getSnapshot = useCallback(
    () => (time === null ? null : label((now ?? Date.now()) - time, time)),
    [time, now],
  );
  // The server has no idea what "now" is on the reader's clock, so it
  // renders nothing time-based and the client fills in after hydration.
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function RelativeTime({
  date,
  now,
  className,
}: {
  /** Pass null while the moment isn't known yet (it renders a placeholder). */
  date: Date | number | string | null;
  /** Pins "now" to this moment instead of the live clock (tests, replays). */
  now?: number;
  className?: string;
}) {
  const time = date === null ? null : new Date(date).getTime();
  const text = useRelativeLabel(time, now);
  const reduceMotion = useReducedMotion();
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (delayed: boolean) => {
    clearTimeout(openTimer.current);
    const warm = Date.now() - lastClosedAt < WARM_FOR;
    if (!delayed || warm) {
      setInstant(warm);
      setOpen(true);
      return;
    }
    setInstant(false);
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };
  const hide = () => {
    clearTimeout(openTimer.current);
    if (open) lastClosedAt = Date.now();
    setOpen(false);
  };

  const match = text?.match(/^(\d+)(.*)$/);
  const digits = match ? match[1] : "";
  const rest = match ? match[2] : (text ?? "");

  return (
    <time
      dateTime={time === null ? undefined : new Date(time).toISOString()}
      tabIndex={text === null ? undefined : 0}
      aria-describedby={open ? tipId : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") show(true);
      }}
      onPointerLeave={hide}
      onFocus={() => show(false)}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
      className={cn(
        // Brightens on hover so the text reads as something with more to say.
        "relative inline-flex cursor-default rounded-sm whitespace-nowrap tabular-nums transition-[color] duration-150 ease-out hover:text-foreground focus-visible:text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground",
        className,
      )}
    >
      {text === null ? (
        // Holds roughly the right width so the line doesn't reflow on fill.
        <span aria-hidden className="invisible">
          0 min ago
        </span>
      ) : (
        <>
          <span className="sr-only">{text}</span>
          <span aria-hidden className="inline-flex">
            <AnimatePresence initial={false} mode="popLayout">
              {[...digits].map((d, i) => (
                // Keyed from the right, so 9 -> 10 rolls the ones and
                // brings a new tens digit in beside it.
                <DigitSlot
                  key={`slot-${digits.length - i}`}
                  digit={d}
                  reduceMotion={reduceMotion}
                />
              ))}
            </AnimatePresence>
            <span className="relative inline-flex">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={rest}
                  className="inline-block whitespace-pre"
                  initial={roll.enter(reduceMotion)}
                  animate={roll.center}
                  exit={roll.exit(reduceMotion)}
                  transition={ROLL}
                >
                  {rest}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
          <AnimatePresence>
            {open && time !== null ? (
              <Tooltip
                id={tipId}
                time={time}
                instant={instant}
                reduceMotion={reduceMotion}
              />
            ) : null}
          </AnimatePresence>
        </>
      )}
    </time>
  );
}

// New values come up from below and old ones leave upward: time only
// moves forward, so the roll always runs the same way.
const roll = {
  enter: (reduce: boolean | null) =>
    reduce ? { opacity: 0 } : { opacity: 0, y: "0.55em", filter: "blur(3px)" },
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: (reduce: boolean | null) =>
    reduce
      ? { opacity: 0 }
      : // Travels less than the entrance did: the exit shouldn't hold the eye.
        { opacity: 0, y: "-0.4em", filter: "blur(3px)" },
};

function DigitSlot({
  digit,
  reduceMotion,
}: {
  digit: string;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.span
      className="relative inline-flex"
      initial={roll.enter(reduceMotion)}
      animate={roll.center}
      exit={roll.exit(reduceMotion)}
      transition={ROLL}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={digit}
          className="inline-block"
          initial={roll.enter(reduceMotion)}
          animate={roll.center}
          exit={roll.exit(reduceMotion)}
          transition={ROLL}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

const VIEWPORT_GUTTER = 8;

function Tooltip({
  id,
  time,
  instant,
  reduceMotion,
}: {
  id: string;
  time: number;
  instant: boolean;
  reduceMotion: boolean | null;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Starts centred on the text; nudged sideways only if that would poke
  // past the viewport (and widen a phone-sized page).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = document.documentElement.clientWidth - VIEWPORT_GUTTER;
    const shift =
      r.left < VIEWPORT_GUTTER
        ? VIEWPORT_GUTTER - r.left
        : r.right > max
          ? max - r.right
          : 0;
    el.style.marginLeft = `${Math.round(shift)}px`;
  }, []);

  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-1.5">
      <motion.span
        ref={ref}
        id={id}
        role="tooltip"
        className="block origin-bottom rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-raised"
        initial={
          instant || reduceMotion
            ? { opacity: instant ? 1 : 0 }
            : { opacity: 0, scale: 0.9, y: 3, filter: "blur(2px)" }
        }
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: instant ? 0 : 0.16, ease: EASE_OUT },
        }}
        exit={{
          opacity: 0,
          scale: reduceMotion ? 1 : 0.97,
          transition: { duration: 0.1, ease: EASE_OUT },
        }}
      >
        {tooltipFormat().format(time)}
      </motion.span>
    </span>
  );
}

// The moment the demo first rendered on the client. The server snapshot is
// null, so the demo's timestamps only exist after hydration.
let clientNow: number | null = null;
const noSubscribe = () => () => {};
const getClientNow = () => (clientNow ??= Date.now());

// The index card's show: the clock runs fast for a moment, so every label
// rolls the way it would over the next few minutes. Seconds tip over into
// minutes, minutes count up; then a pause, and the clock returns.
const SHOW: [wait: number, skip: number][] = [
  [500, 30 * SEC],
  [900, MIN],
  [900, 2 * MIN],
  [900, 3 * MIN],
];
// How long the last reading stays up before the clock returns, and the
// calm beat at the live time before it runs again.
const SHOW_HOLD = 1800;
const SHOW_REST = 1400;

export default function RelativeTimeDemo() {
  const now = useSyncExternalStore(noSubscribe, getClientNow, () => null);
  const ago = (ms: number) => (now === null ? null : now - ms);
  const play = usePreviewPlay();
  // Undefined: the real clock. Only the hover show pins it.
  const [pinned, setPinned] = useState<number>();
  // Index clocks stay pinned between shows, so idle cards need no timers.
  const clock = play === null ? pinned : (pinned ?? now ?? undefined);

  useEffect(() => {
    if (play !== true) return;
    let start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const step = (i: number) => {
      if (i === 0) start = Date.now();
      if (i === SHOW.length) {
        timer = setTimeout(() => {
          setPinned(undefined);
          timer = setTimeout(() => step(0), SHOW_REST);
        }, SHOW_HOLD);
        return;
      }
      const [wait, skip] = SHOW[i];
      timer = setTimeout(() => {
        setPinned(start + skip);
        step(i + 1);
      }, wait);
    };
    step(0);
    // Unhovering rolls the labels back to the pinned preview time.
    return () => {
      clearTimeout(timer);
      setPinned(undefined);
    };
  }, [play]);

  return (
    <p className="max-w-full text-sm leading-6 text-muted">
      {/* Each clause wraps as a unit, so a narrow line never starts on a dot. */}
      <span className="whitespace-nowrap">
        <span className="font-medium text-foreground">Ana Ruiz</span> opened
        this <RelativeTime now={clock} date={ago(2 * HOUR + 14 * MIN)} />
        <span aria-hidden className="pl-1.5">
          ·
        </span>
      </span>{" "}
      <span className="whitespace-nowrap">
        edited <RelativeTime now={clock} date={ago(4 * MIN + 51 * SEC)} />
        <span aria-hidden className="pl-1.5">
          ·
        </span>
      </span>{" "}
      <span className="whitespace-nowrap">
        synced <RelativeTime now={clock} date={ago(12 * SEC)} />
      </span>
    </p>
  );
}
