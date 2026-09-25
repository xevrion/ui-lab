"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Plan = {
  name: string;
  // The plan applies from this many seats up, until the next plan's minimum.
  minSeats: number;
  // Per seat, per month, before the yearly discount.
  seatPrice: number;
};

type Billing = "monthly" | "yearly";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const BLUR_IN = {
  initial: { opacity: 0, y: 4, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -2, filter: "blur(2px)" },
};

function planFor(plans: Plan[], seats: number) {
  let found = plans[0];
  for (const plan of plans) if (seats >= plan.minSeats) found = plan;
  return found;
}

function money(value: number, cents = true) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export function PricingCalculator({
  plans,
  maxSeats = 50,
  defaultSeats = 6,
  yearlyDiscount = 0.2,
  className,
}: {
  // Cheapest per seat last; the first plan's price is the list price every
  // discount is measured against.
  plans: Plan[];
  maxSeats?: number;
  defaultSeats?: number;
  yearlyDiscount?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [seats, setSeats] = useState(defaultSeats);
  const [billing, setBilling] = useState<Billing>("monthly");
  const plan = planFor(plans, seats);
  const list = plans[0];

  // Why the plan is what it is, rewritten only when a threshold is crossed
  // so it reads as the reason for the change that just happened.
  const [note, setNote] = useState(() => initialNote(plans, plan));
  const lastPlan = useRef(plan);
  useEffect(() => {
    const before = lastPlan.current;
    if (before === plan) return;
    lastPlan.current = plan;
    const up = plan.minSeats > before.minSeats;
    setNote(
      up
        ? `${plan.name} from ${plan.minSeats} seats: every seat is now ${money(plan.seatPrice)}.`
        : `Under ${before.minSeats} seats, back to ${plan.name} at ${money(plan.seatPrice)}.`,
    );
  }, [plan]);

  const gross = seats * list.seatPrice;
  const volume = seats * (list.seatPrice - plan.seatPrice);
  const monthly = gross - volume;
  const yearlyCut = billing === "yearly" ? monthly * yearlyDiscount : 0;
  const total = monthly - yearlyCut;
  const hasVolume = plan !== list;
  const yearly = billing === "yearly";

  return (
    <div
      className={cn(
        "flex w-[min(440px,100%)] flex-col gap-5 rounded-[22px] bg-background p-5 shadow-raised",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-muted">Your team</p>
          {/* The wheels are boxes, so there is no shared baseline: the
              label sits on the bottom edge and 4px lifts it onto the
              digits' baseline. */}
          <p className="flex items-end gap-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums">
            {/* Rolls like the prices below, so the cause and the effect
                move the same way. */}
            <RollingCount value={seats} reduceMotion={reduceMotion} />
            <span className="mb-1 text-[15px] leading-none font-medium text-muted">
              {seats === 1 ? "seat" : "seats"}
            </span>
          </p>
        </div>
        <PlanBadge
          plan={plan}
          rank={plans.indexOf(plan)}
          reduceMotion={reduceMotion}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SeatSlider
          value={seats}
          max={maxSeats}
          thresholds={plans.slice(1)}
          onChange={setSeats}
          reduceMotion={reduceMotion}
        />
        {/* A fixed slot, so the invoice below never shifts: one line where
            the notes fit on one, two on a phone. */}
        <div className="relative h-10 sm:h-5" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={note}
              {...BLUR_IN}
              transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE_OUT }}
              className="absolute inset-x-0 top-0 text-[13px] leading-5 text-pretty text-muted"
            >
              {note}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <BillingSwitch
        value={billing}
        onChange={setBilling}
        discount={yearlyDiscount}
      />

      <dl className="flex flex-col text-[14px]">
        <Row
          label={`${seats} × ${money(list.seatPrice)} list price`}
          value={gross}
          reduceMotion={reduceMotion}
        />
        <Row
          label={
            hasVolume
              ? `${plan.name} rate, ${money(list.seatPrice - plan.seatPrice)} off a seat`
              : `Volume rate from ${plans[1]?.minSeats ?? "more"} seats`
          }
          value={-volume}
          dim={!hasVolume}
          reduceMotion={reduceMotion}
        />
        <Row
          label={
            yearly
              ? `Yearly billing, ${Math.round(yearlyDiscount * 100)}% off`
              : `Pay yearly to save ${Math.round(yearlyDiscount * 100)}%`
          }
          value={-yearlyCut}
          dim={!yearly}
          reduceMotion={reduceMotion}
        />
        <div className="mt-2 flex items-end justify-between gap-3 border-t border-dashed border-border pt-4">
          <dt className="flex flex-col gap-1">
            <span className="text-[14px] font-medium">Total</span>
            <div className="relative h-5 text-[13px] text-muted">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.p
                  key={billing}
                  {...BLUR_IN}
                  transition={{
                    duration: reduceMotion ? 0 : 0.25,
                    ease: EASE_OUT,
                  }}
                  className="absolute top-0 left-0 whitespace-nowrap tabular-nums"
                >
                  {yearly
                    ? `Billed ${money(total * 12, false)} a year`
                    : "Billed monthly"}
                </motion.p>
              </AnimatePresence>
            </div>
          </dt>
          <dd className="flex items-baseline gap-2">
            <Struck show={yearly} reduceMotion={reduceMotion}>
              {money(monthly)}
            </Struck>
            <span className="text-[28px] leading-none font-semibold tracking-tight">
              <RollingMoney value={total} reduceMotion={reduceMotion} />
            </span>
            <span className="text-[14px] text-muted">/mo</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function initialNote(plans: Plan[], plan: Plan) {
  const next = plans[plans.indexOf(plan) + 1];
  return next
    ? `${next.name} pricing kicks in at ${next.minSeats} seats.`
    : `${plan.name} pricing applies from ${plan.minSeats} seats.`;
}

function Row({
  label,
  value,
  dim,
  reduceMotion,
}: {
  label: string;
  value: number;
  dim?: boolean;
  reduceMotion: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center justify-between gap-3 transition-colors duration-200 ease-out",
        dim ? "text-muted" : "text-foreground",
      )}
    >
      <dt className="relative min-w-0 flex-1 truncate">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={label}
            {...BLUR_IN}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE_OUT }}
            className="block truncate"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </dt>
      <dd className="shrink-0">
        <RollingMoney value={value} reduceMotion={reduceMotion} />
      </dd>
    </div>
  );
}

// The monthly price you'd have paid, crossed out by a line that draws across
// it, left to right, the moment yearly billing is on.
function Struck({
  show,
  reduceMotion,
  children,
}: {
  show: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.s
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{
            opacity: 0,
            filter: "blur(2px)",
            transition: { duration: 0.15 },
          }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
          className="relative text-[15px] text-muted tabular-nums no-underline"
        >
          <span className="sr-only">was </span>
          {children}
          <motion.span
            aria-hidden
            className="absolute inset-x-[-2px] top-1/2 h-[1.5px] origin-left bg-muted"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.3,
              delay: reduceMotion ? 0 : 0.08,
              ease: EASE_OUT,
            }}
          />
        </motion.s>
      )}
    </AnimatePresence>
  );
}

// Every digit is its own wheel, keyed from the right so the cents stay the
// cents as the number grows. Each wheel takes the short way round, so a 9
// becoming a 0 rolls forward one notch instead of back through eight.
function RollingMoney({
  value,
  reduceMotion,
}: {
  value: number;
  reduceMotion: boolean;
}) {
  const negative = value < -0.004;
  const text = money(Math.abs(value));
  const chars = [...text];
  return (
    <span className="inline-flex tabular-nums">
      <span className="sr-only">{negative ? `minus ${text}` : text}</span>
      <span aria-hidden className="inline-flex items-center">
        {/* A real minus sign, kept as a static glyph that fades. */}
        <span
          className={cn(
            "inline-flex h-[1.2em] items-center overflow-hidden transition-[opacity,width] duration-200 ease-out",
            negative ? "w-[0.6em] opacity-100" : "w-0 opacity-0",
          )}
        >
          −
        </span>
        {chars.map((char, i) => {
          const fromRight = chars.length - 1 - i;
          return /\d/.test(char) ? (
            <Digit
              key={`d${fromRight}`}
              digit={Number(char)}
              reduceMotion={reduceMotion}
            />
          ) : (
            <span
              key={`c${fromRight}${char}`}
              className="inline-flex h-[1.2em] items-center"
            >
              {char}
            </span>
          );
        })}
      </span>
    </span>
  );
}

function RollingCount({
  value,
  reduceMotion,
}: {
  value: number;
  reduceMotion: boolean;
}) {
  const chars = [...String(value)];
  return (
    <span className="inline-flex">
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((char, i) => (
          <Digit
            key={chars.length - 1 - i}
            digit={Number(char)}
            reduceMotion={reduceMotion}
          />
        ))}
      </span>
    </span>
  );
}

function Digit({
  digit,
  reduceMotion,
}: {
  digit: number;
  reduceMotion: boolean;
}) {
  const target = useRef(digit);
  const position = useSpring(digit, { visualDuration: 0.35, bounce: 0.1 });

  useEffect(() => {
    const current = ((target.current % 10) + 10) % 10;
    const delta = ((digit - current + 15) % 10) - 5;
    target.current += delta;
    if (reduceMotion) position.jump(target.current);
    else position.set(target.current);
  }, [digit, reduceMotion, position]);

  return (
    <motion.span
      className="relative inline-block h-[1.2em] w-[0.62em] overflow-hidden [mask-image:linear-gradient(transparent,black_22%,black_78%,transparent)]"
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
    >
      {Array.from({ length: 10 }, (_, g) => (
        <Glyph key={g} glyph={g} position={position} />
      ))}
    </motion.span>
  );
}

function Glyph({
  glyph,
  position,
}: {
  glyph: number;
  position: MotionValue<number>;
}) {
  // Each glyph sits within five slots of the position, so ten nodes make an
  // endless wheel; the jump from +5 to -5 happens out of sight.
  const transform = useTransform(position, (p) => {
    const offset = ((((glyph - p) % 10) + 15) % 10) - 5;
    return `translateY(${offset * 100}%)`;
  });
  return (
    <motion.span
      className="absolute inset-0 flex items-center justify-center"
      style={{ transform }}
    >
      {glyph}
    </motion.span>
  );
}

function PlanBadge({
  plan,
  rank,
  reduceMotion,
}: {
  plan: Plan;
  rank: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.span
      layout={!reduceMotion}
      transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
      className={cn(
        "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-300 ease-out",
        rank === 0 && "bg-surface text-foreground",
        rank === 1 &&
          "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--foreground)]",
        rank >= 2 && "bg-foreground text-background",
      )}
    >
      <motion.span
        layout={reduceMotion ? false : "position"}
        className="text-[12px] opacity-70"
      >
        Plan
      </motion.span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={plan.name}
          layout={reduceMotion ? false : "position"}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{
            opacity: 0,
            y: -6,
            filter: "blur(2px)",
            transition: { duration: 0.15 },
          }}
          transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE_OUT }}
        >
          {plan.name}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

function SeatSlider({
  value,
  max,
  thresholds,
  onChange,
  reduceMotion,
}: {
  value: number;
  max: number;
  thresholds: Plan[];
  onChange: (seats: number) => void;
  reduceMotion: boolean;
}) {
  const id = useId();
  const at = (seats: number) => (seats - 1) / (max - 1);
  // The fill glides behind the thumb, so a keyboard step or a click on the
  // track travels instead of jumping.
  const fill = useSpring(at(value), { visualDuration: 0.2, bounce: 0 });
  useEffect(() => {
    if (reduceMotion) fill.jump(at(value));
    else fill.set(at(value));
  });
  const scaleX = fill;
  // The thumb's centre travels inside the track minus its own width, the
  // way a native range input places it.
  const left = useTransform(fill, (f) => `calc(${f * 100}% - ${f * 20}px)`);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        Seats
      </label>
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface shadow-wheel">
          <motion.div
            className="h-full origin-left bg-foreground"
            style={{ scaleX }}
          />
        </div>
        {thresholds.map((plan) => (
          <span
            key={plan.name}
            aria-hidden
            className={cn(
              "absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200 ease-out",
              value >= plan.minSeats ? "bg-background" : "bg-muted/60",
            )}
            style={{
              left: `calc(${at(plan.minSeats) * 100}% + ${10 - at(plan.minSeats) * 20}px)`,
            }}
          />
        ))}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-background shadow-raised"
          style={{ left }}
        />
        <input
          id={id}
          type="range"
          min={1}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${value} ${value === 1 ? "seat" : "seats"}`}
          className="peer absolute inset-0 h-full w-full cursor-pointer touch-pan-y appearance-none rounded-full opacity-0"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full outline-hidden peer-focus-visible:outline-2 peer-focus-visible:outline-solid focus-visible:outline-solid peer-focus-visible:outline-foreground"
        />
      </div>
      <div
        aria-hidden
        className="relative h-4 text-[12px] text-muted tabular-nums"
      >
        <span className="absolute left-0">1</span>
        {thresholds.map((plan) => (
          <span
            key={plan.name}
            className={cn(
              "absolute -translate-x-1/2 whitespace-nowrap transition-colors duration-200 ease-out",
              value >= plan.minSeats && "text-foreground",
            )}
            style={{
              left: `calc(${at(plan.minSeats) * 100}% + ${10 - at(plan.minSeats) * 20}px)`,
            }}
          >
            {plan.minSeats} · {plan.name}
          </span>
        ))}
        <span className="absolute right-0">{max}</span>
      </div>
    </div>
  );
}

function BillingSwitch({
  value,
  onChange,
  discount,
}: {
  value: Billing;
  onChange: (b: Billing) => void;
  discount: number;
}) {
  const options: { id: Billing; label: string }[] = [
    { id: "monthly", label: "Monthly" },
    { id: "yearly", label: "Yearly" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="relative grid h-10 grid-cols-2 rounded-full bg-surface p-1 shadow-wheel"
      onKeyDown={(e) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          const next = value === "monthly" ? "yearly" : "monthly";
          onChange(next);
          (
            e.currentTarget.querySelector(
              `[data-id="${next}"]`,
            ) as HTMLElement | null
          )?.focus();
        }
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-raised transition-transform duration-250 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none",
          value === "yearly" && "translate-x-full",
        )}
      />
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            data-id={option.id}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.id)}
            className={cn(
              "relative flex touch-manipulation items-center justify-center gap-1.5 rounded-full text-[14px] font-medium outline-hidden transition-[color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]",
              active ? "text-foreground" : "text-muted",
            )}
          >
            {option.label}
            {option.id === "yearly" && (
              <span className="text-[12px] font-normal text-muted">
                −{Math.round(discount * 100)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const PLANS: Plan[] = [
  { name: "Starter", minSeats: 1, seatPrice: 12 },
  { name: "Team", minSeats: 10, seatPrice: 10 },
  { name: "Business", minSeats: 25, seatPrice: 8 },
];

export default function PricingCalculatorDemo() {
  return <PricingCalculator plans={PLANS} />;
}
