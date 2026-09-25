"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useIsPresent,
  type Variants,
} from "motion/react";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Far enough to read as travel, short enough that the fade does most of the
// work and the grid never looks like it is leaving the card.
const SLIDE = 56;
const GRID: Variants = {
  enter: (dir: number) => ({ x: dir * SLIDE, opacity: 0, filter: "blur(4px)" }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.25, ease: EASE_OUT },
  },
  // Leaves quicker and travels less than the incoming grid arrives, so the
  // eye goes straight to the new month.
  exit: (dir: number) => ({
    x: dir * -SLIDE * 0.6,
    opacity: 0,
    filter: "blur(2px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  }),
};
const TITLE: Variants = {
  enter: { opacity: 0, filter: "blur(4px)" },
  center: {
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.25, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    filter: "blur(2px)",
    transition: { duration: 0.15, ease: EASE_OUT },
  },
};
// No bounce: a circle that overshoots would briefly mark the wrong day.
const SELECT = { type: "spring", duration: 0.3, bounce: 0 } as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
// Six weeks covers every month, so the grid is always the same height and
// the month buttons never move.
const CELLS = 42;

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// Months as one running number, so comparing two tells the direction.
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();
const addDays = (iso: string, days: number) => {
  const date = fromIso(iso);
  return toIso(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
  );
};
// Keeps the day of month, clamped so Jan 31 plus one month is Feb 28.
const addMonths = (iso: string, months: number) => {
  const date = fromIso(iso);
  const y = date.getFullYear();
  const m = date.getMonth() + months;
  const last = new Date(y, m + 1, 0).getDate();
  return toIso(new Date(y, m, Math.min(date.getDate(), last)));
};
const monthTitle = (month: number) =>
  new Date(Math.floor(month / 12), month % 12, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
const dayLabel = (date: Date) =>
  date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

// The server can't know the viewer's date or time zone, so it renders an
// empty shell of the same size and the client fills it in on hydration.
const noSubscribe = () => () => {};
const useToday = () =>
  useSyncExternalStore(
    noSubscribe,
    () => toIso(new Date()),
    () => null,
  );

export function MiniCalendar({
  onSelect,
  className,
}: {
  onSelect?: (iso: string) => void;
  className?: string;
}) {
  const today = useToday();
  // Null until the user acts, meaning "today" and "today's month".
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const moveFocus = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const selectedIso = selected ?? today;
  const focusedIso = focused ?? selectedIso;
  const shownMonth =
    month ?? (selectedIso ? monthIndex(fromIso(selectedIso)) : null);

  // After a keyboard move, focus follows to the day's button, which may be
  // in a grid that has only just mounted.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-month="${shownMonth}"] [data-date="${focusedIso}"]`,
      )
      ?.focus({ preventScroll: true });
  }, [focusedIso, shownMonth]);

  if (!today || !focusedIso || shownMonth === null) {
    return <Shell className={className} />;
  }

  const showMonth = (next: number) => {
    if (next === shownMonth) return;
    setDirection(next > shownMonth ? 1 : -1);
    setMonth(next);
  };

  const goTo = (iso: string, takeFocus: boolean) => {
    setFocused(iso);
    showMonth(monthIndex(fromIso(iso)));
    moveFocus.current = takeFocus;
  };

  const select = (iso: string) => {
    setSelected(iso);
    goTo(iso, false);
    onSelect?.(iso);
  };

  // The buttons move the grid a month and carry the roving focus with it,
  // without pulling focus off the button itself.
  const step = (months: number) => {
    const iso = addMonths(focusedIso, months);
    setFocused(iso);
    showMonth(monthIndex(fromIso(iso)));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const weekday = fromIso(focusedIso).getDay();
    const years = event.shiftKey ? 12 : 1;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusedIso, -1),
      ArrowRight: () => addDays(focusedIso, 1),
      ArrowUp: () => addDays(focusedIso, -7),
      ArrowDown: () => addDays(focusedIso, 7),
      Home: () => addDays(focusedIso, -weekday),
      End: () => addDays(focusedIso, 6 - weekday),
      PageUp: () => addMonths(focusedIso, -years),
      PageDown: () => addMonths(focusedIso, years),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    goTo(move(), true);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "w-[340px] max-w-full rounded-[28px] bg-background p-4 shadow-raised",
          className,
        )}
      >
        <div className="mb-2 flex h-10 items-center justify-between">
          {/* Its own positioning context, so the outgoing title can sit on
              top of the incoming one while they crossfade. */}
          <div aria-hidden className="relative flex-1 pl-3">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={shownMonth}
                variants={TITLE}
                initial="enter"
                animate="center"
                exit="exit"
                className="block text-[16px] font-medium whitespace-nowrap text-foreground"
              >
                {monthTitle(shownMonth)}
              </motion.span>
            </AnimatePresence>
          </div>
          <span id={titleId} className="sr-only" aria-live="polite">
            {monthTitle(shownMonth)}
          </span>
          <div className="flex">
            <MonthButton label="Previous month" onClick={() => step(-1)}>
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </MonthButton>
            <MonthButton label="Next month" onClick={() => step(1)}>
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </MonthButton>
          </div>
        </div>

        {/* Clips the sliding grids at the card edge. The 4px of padding
            buys back room for focus outlines on the outer days. */}
        <div
          ref={gridRef}
          className="relative -m-1 overflow-hidden p-1"
          onKeyDown={onKeyDown}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <MonthGrid
              key={shownMonth}
              month={shownMonth}
              direction={direction}
              today={today}
              selected={selectedIso}
              focused={focusedIso}
              labelledBy={titleId}
              onSelect={select}
            />
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}

function MonthGrid({
  ref,
  month,
  direction,
  today,
  selected,
  focused,
  labelledBy,
  onSelect,
}: {
  // popLayout measures the outgoing grid through this ref.
  ref?: React.Ref<HTMLDivElement>;
  month: number;
  direction: number;
  today: string;
  selected: string | null;
  focused: string;
  labelledBy: string;
  onSelect: (iso: string) => void;
}) {
  // The outgoing grid stays in the DOM while it fades, but is gone as far as
  // focus and screen readers are concerned.
  const present = useIsPresent();
  const first = new Date(Math.floor(month / 12), month % 12, 1);
  const start = first.getDay();
  const days = Array.from(
    { length: CELLS },
    (_, i) =>
      new Date(first.getFullYear(), first.getMonth(), i - start + 1),
  );
  const weeks = Array.from({ length: CELLS / 7 }, (_, w) =>
    days.slice(w * 7, w * 7 + 7),
  );

  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={GRID}
      initial="enter"
      animate="center"
      exit="exit"
      data-month={month}
      inert={!present}
    >
      {/* Scoped per month, so the selection springs between days of one
          month but never flies across from the outgoing grid. */}
      <LayoutGroup id={`${labelledBy}-${month}`}>
        <table
          role="grid"
          aria-labelledby={labelledBy}
          className="w-full table-fixed border-collapse"
        >
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th
                  key={day}
                  scope="col"
                  abbr={day}
                  className="h-8 p-0 text-center text-xs font-medium text-muted"
                >
                  {day.slice(0, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, w) => (
              <tr key={w}>
                {week.map((date) => {
                  const iso = toIso(date);
                  const isSelected = iso === selected;
                  const outside = monthIndex(date) !== month;
                  return (
                    <td
                      key={iso}
                      role="gridcell"
                      aria-selected={isSelected}
                      className="p-0"
                    >
                      <button
                        type="button"
                        data-date={iso}
                        tabIndex={iso === focused ? 0 : -1}
                        aria-label={dayLabel(date)}
                        aria-current={iso === today ? "date" : undefined}
                        onClick={() => onSelect(iso)}
                        className={cn(
                          "relative mx-auto flex h-11 w-full max-w-11 touch-manipulation items-center justify-center rounded-full text-sm tabular-nums outline-hidden select-none",
                          "transition-[scale,color,background-color] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-[color,background-color]",
                          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground",
                          isSelected
                            ? "text-background"
                            : cn(
                                "hover:bg-foreground/[0.06]",
                                outside ? "text-muted/60" : "text-foreground",
                              ),
                        )}
                      >
                        {isSelected && (
                          <motion.span
                            layoutId="selected"
                            aria-hidden
                            transition={SELECT}
                            className="absolute inset-0 rounded-full bg-foreground"
                          />
                        )}
                        <span className="relative">{date.getDate()}</span>
                        {iso === today && (
                          <span
                            aria-hidden
                            className="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </LayoutGroup>
    </motion.div>
  );
}

// Same footprint as the real calendar, for the server render.
function Shell({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-[340px] max-w-full rounded-[28px] bg-background p-4 shadow-raised",
        className,
      )}
    >
      {/* Header row plus the 32px weekday row and six 44px weeks. */}
      <div className="mb-2 h-10" />
      <div className="h-[296px]" />
    </div>
  );
}

function MonthButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-10 touch-manipulation items-center justify-center rounded-full text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

export default function MiniCalendarDemo() {
  return <MiniCalendar />;
}
