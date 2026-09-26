"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Weight = 1 | 2 | 3;
export type Reason = { id: string; text: string; weight: Weight };
export type Side = "pros" | "cons";
export type Ledger = Record<Side, Reason[]>;

// Scale geometry, in viewBox units.
const VIEW_W = 440;
const VIEW_H = 200;
const PIVOT_X = 220;
const PIVOT_Y = 40;
const ARM = 160;
// Past this the pans would read as falling, not tipping.
const MAX_TILT = 14;
// A difference of about six weight units already tips most of the way.
const TILT_SPREAD = 6;
// Beam: a heavy, lightly damped spring (about 0.6Hz, zeta 0.35), so it sways
// past the new balance point and takes a few seconds to settle, the way a
// real balance does. This is the one place a slow settle is the point.
const BEAM_K = 14;
const BEAM_C = 2.6;
// Pans hang from pins and swing against the beam's acceleration.
const PAN_K = 22;
const PAN_C = 2.2;
const PAN_COUPLING = 0.8;
// Enough to see the pans swing, never enough to spill past the frame.
const PAN_MAX = 6;
// Angular kick, deg/s per weight unit, when a weight lands.
const THUD = 9;
const REST = 0.02;
const MAX_ITEMS = 8;

const BLOCK_W: Record<Weight, number> = { 1: 14, 2: 18, 3: 22 };
const BLOCK_H: Record<Weight, number> = { 1: 10, 2: 14, 3: 18 };
// Where the dish sits below the pin, and where the strings meet its rim.
const DISH_Y = 80;
const STRING_X = 46;

// The scale is brass, a physical material: a bright edge where the light
// catches, the body, and the shade. Dimmed a step in dark mode so it sits
// in the page instead of glowing.
const BRASS_HI = "light-dark(#f2dc9b, #dcc47e)";
const BRASS = "light-dark(#c9a14a, #b08c3e)";
const BRASS_LO = "light-dark(#8c6b2b, #6e5322)";
// Cast iron weights: near black in both themes, lifted a little in dark
// mode so they still read against the page.
const IRON = "light-dark(#262626, #4d4d4d)";

function total(items: Reason[]) {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

function tiltFor(pros: number, cons: number) {
  // Heavier pros sink the left pan, which is a negative (counter-clockwise)
  // rotation in SVG.
  return -MAX_TILT * Math.tanh((pros - cons) / TILT_SPREAD);
}

// Packs weights into rows on the dish, each row centered and narrower as it
// rises between the strings.
function pack(items: Reason[]) {
  const placed: { item: Reason; x: number; y: number }[] = [];
  let row: Reason[] = [];
  let base = DISH_Y;
  const flush = () => {
    const widths = row.map((r) => BLOCK_W[r.weight]);
    const span = widths.reduce((a, b) => a + b, 0) + (row.length - 1) * 3;
    let x = -span / 2;
    row.forEach((r, i) => {
      placed.push({ item: r, x: x + widths[i] / 2, y: base });
      x += widths[i] + 3;
    });
    base -= Math.max(...row.map((r) => BLOCK_H[r.weight])) + 1;
    row = [];
  };
  for (const item of items) {
    const room = (2 * STRING_X * base) / DISH_Y - 12;
    const used =
      row.reduce((a, r) => a + BLOCK_W[r.weight] + 3, 0) + BLOCK_W[item.weight];
    if (row.length && used > room) flush();
    row.push(item);
  }
  if (row.length) flush();
  return placed;
}

function Scale({ ledger }: { ledger: Ledger }) {
  const reduceMotion = useReducedMotion();
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const beamRef = useRef<SVGGElement>(null);
  const leftRef = useRef<SVGGElement>(null);
  const rightRef = useRef<SVGGElement>(null);
  // Only weights that have landed count, so the beam answers the thud
  // rather than tilting while a weight is still in the air.
  const landed = useRef(
    new Set([...ledger.pros, ...ledger.cons].map((r) => r.id)),
  );
  const latest = useRef(ledger);
  const initialTilt = tiltFor(total(ledger.pros), total(ledger.cons));
  const [initial] = useState(() => ({
    beam: `rotate(${initialTilt} ${PIVOT_X} ${PIVOT_Y})`,
    left: `translate(${PIVOT_X - ARM} ${PIVOT_Y}) rotate(${-initialTilt})`,
    right: `translate(${PIVOT_X + ARM} ${PIVOT_Y}) rotate(${-initialTilt})`,
  }));
  const sim = useRef({
    angle: initialTilt,
    vel: 0,
    swing: 0,
    swingVel: 0,
    target: initialTilt,
    frame: 0,
  });

  const paint = () => {
    const s = sim.current;
    const pan = -s.angle + s.swing;
    beamRef.current?.setAttribute(
      "transform",
      `rotate(${s.angle.toFixed(3)} ${PIVOT_X} ${PIVOT_Y})`,
    );
    leftRef.current?.setAttribute(
      "transform",
      `translate(${PIVOT_X - ARM} ${PIVOT_Y}) rotate(${pan.toFixed(3)})`,
    );
    rightRef.current?.setAttribute(
      "transform",
      `translate(${PIVOT_X + ARM} ${PIVOT_Y}) rotate(${pan.toFixed(3)})`,
    );
  };

  const run = () => {
    const s = sim.current;
    if (s.frame) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const accel = -BEAM_K * (s.angle - s.target) - BEAM_C * s.vel;
      s.vel += accel * dt;
      s.angle += s.vel * dt;
      s.swingVel +=
        (-PAN_K * s.swing - PAN_C * s.swingVel - PAN_COUPLING * accel) * dt;
      s.swing = Math.max(
        -PAN_MAX,
        Math.min(PAN_MAX, s.swing + s.swingVel * dt),
      );
      paint();
      const still =
        Math.abs(s.angle - s.target) < REST &&
        Math.abs(s.vel) < REST &&
        Math.abs(s.swing) < REST &&
        Math.abs(s.swingVel) < REST;
      if (still) {
        Object.assign(s, { angle: s.target, vel: 0, swing: 0, swingVel: 0 });
        paint();
        s.frame = 0;
        return;
      }
      s.frame = requestAnimationFrame(tick);
    };
    s.frame = requestAnimationFrame(tick);
  };

  const retarget = () => {
    const s = sim.current;
    // Read through a ref: a weight still falling when its row is removed
    // lands from a stale render and must not weigh the old ledger.
    const current = latest.current;
    const weigh = (items: Reason[]) =>
      total(
        reduceMotion ? items : items.filter((r) => landed.current.has(r.id)),
      );
    s.target = tiltFor(weigh(current.pros), weigh(current.cons));
    if (reduceMotion) {
      cancelAnimationFrame(s.frame);
      Object.assign(s, {
        angle: s.target,
        vel: 0,
        swing: 0,
        swingVel: 0,
        frame: 0,
      });
      paint();
      return;
    }
    run();
  };

  useEffect(() => {
    latest.current = ledger;
    retarget();
    // retarget reads the latest ledger; it only needs to run when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, reduceMotion]);

  useEffect(() => {
    const s = sim.current;
    return () => cancelAnimationFrame(s.frame);
  }, []);

  const land = (side: Side, item: Reason) => {
    if (landed.current.has(item.id)) return;
    landed.current.add(item.id);
    sim.current.vel += (side === "pros" ? -1 : 1) * THUD * item.weight;
    retarget();
  };

  const pan = (side: Side) => (
    <>
      {/* Fine chains: dashes read as links at this size. */}
      <path
        d={`M0 3L${-STRING_X} ${DISH_Y}M0 3L${STRING_X} ${DISH_Y}`}
        style={{ stroke: BRASS_LO }}
        strokeWidth={1.5}
        strokeDasharray="2.5 1.5"
        strokeLinecap="butt"
      />
      <circle
        r={4}
        fill={`url(#${gid}-knob)`}
        style={{ stroke: BRASS_LO }}
        strokeWidth={1}
      />
      <AnimatePresence initial={false}>
        {pack(ledger[side]).map(({ item, x, y }) => {
          const w = BLOCK_W[item.weight];
          const h = BLOCK_H[item.weight];
          return (
            <motion.g
              key={item.id}
              initial={reduceMotion ? false : { x, y: y - 36, opacity: 0 }}
              animate={{ x, y, opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: 0.15, ease: "easeOut" },
              }}
              transition={{
                // A drop accelerates, so this one curve is ease-in on purpose.
                y: { duration: 0.26, ease: [0.55, 0, 1, 0.45] },
                opacity: { duration: 0.1 },
                x: { type: "spring", duration: 0.35, bounce: 0 },
              }}
              onAnimationComplete={() => land(side, item)}
            >
              <motion.rect
                initial={false}
                animate={{ attrX: -w / 2, attrY: -h, width: w, height: h }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                rx={2}
                style={{ fill: IRON }}
                className="stroke-background"
                strokeWidth={1.5}
              />
              {/* The lifting knob that makes a block read as a weight. */}
              <motion.rect
                initial={false}
                animate={{ attrY: -h - 3 }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                x={-3}
                width={6}
                height={4}
                rx={1.5}
                style={{ fill: IRON }}
              />
            </motion.g>
          );
        })}
      </AnimatePresence>
      {/* The dish: a shallow brass bowl with a bright rolled rim. */}
      <path
        d={`M-54 ${DISH_Y}H54Q44 ${DISH_Y + 15} 0 ${DISH_Y + 15}Q-44 ${DISH_Y + 15} -54 ${DISH_Y}Z`}
        fill={`url(#${gid}-dish)`}
      />
      <rect
        x={-55}
        y={DISH_Y - 1.5}
        width={110}
        height={3}
        rx={1.5}
        style={{ fill: BRASS_HI }}
      />
    </>
  );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="block h-auto w-full overflow-visible"
      fill="none"
      strokeLinecap="round"
      aria-hidden
    >
      <defs>
        {/* Beam and base: lit from above. */}
        <linearGradient id={`${gid}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: BRASS_HI }} />
          <stop offset="0.45" style={{ stopColor: BRASS }} />
          <stop offset="1" style={{ stopColor: BRASS_LO }} />
        </linearGradient>
        {/* The column is a cylinder: bright a little left of center. */}
        <linearGradient id={`${gid}-post`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: BRASS_LO }} />
          <stop offset="0.35" style={{ stopColor: BRASS_HI }} />
          <stop offset="1" style={{ stopColor: BRASS_LO }} />
        </linearGradient>
        <linearGradient id={`${gid}-dish`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: BRASS }} />
          <stop offset="1" style={{ stopColor: BRASS_LO }} />
        </linearGradient>
        <radialGradient id={`${gid}-knob`} cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" style={{ stopColor: BRASS_HI }} />
          <stop offset="1" style={{ stopColor: BRASS }} />
        </radialGradient>
      </defs>
      {/* Dial behind the pivot, read by the needle. */}
      <path
        d={`M${PIVOT_X - 28} ${PIVOT_Y - 12}A30 30 0 0 1 ${PIVOT_X + 28} ${PIVOT_Y - 12}`}
        className="stroke-foreground/20"
        strokeWidth={1}
      />
      {[-20, -10, 0, 10, 20].map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        const r0 = deg === 0 ? 24 : 26;
        return (
          <line
            key={deg}
            x1={PIVOT_X + Math.cos(a) * r0}
            y1={PIVOT_Y + Math.sin(a) * r0}
            x2={PIVOT_X + Math.cos(a) * 30}
            y2={PIVOT_Y + Math.sin(a) * 30}
            className="stroke-foreground/30"
            strokeWidth={1}
          />
        );
      })}
      {/* Column, a collar where it meets the base, and a two-step base. */}
      <rect
        x={PIVOT_X - 4.5}
        y={PIVOT_Y}
        width={9}
        height={VIEW_H - 22 - PIVOT_Y}
        fill={`url(#${gid}-post)`}
      />
      <rect
        x={PIVOT_X - 9}
        y={VIEW_H - 28}
        width={18}
        height={8}
        rx={2}
        fill={`url(#${gid}-post)`}
      />
      <rect
        x={PIVOT_X - 38}
        y={VIEW_H - 21}
        width={76}
        height={7}
        rx={3}
        fill={`url(#${gid}-bar)`}
      />
      <rect
        x={PIVOT_X - 62}
        y={VIEW_H - 15}
        width={124}
        height={10}
        rx={5}
        fill={`url(#${gid}-bar)`}
      />
      <g ref={beamRef} transform={initial.beam}>
        {/* The needle: dark steel, so it reads against the dial. */}
        <line
          x1={PIVOT_X}
          y1={PIVOT_Y}
          x2={PIVOT_X}
          y2={PIVOT_Y - 24}
          className="stroke-foreground"
          strokeWidth={1.5}
        />
        {/* Beam: thicker at the pivot, tapering to each end. */}
        <path
          d={`M${PIVOT_X - ARM - 4} ${PIVOT_Y - 2.5} L${PIVOT_X} ${PIVOT_Y - 5} L${PIVOT_X + ARM + 4} ${PIVOT_Y - 2.5} L${PIVOT_X + ARM + 4} ${PIVOT_Y + 2.5} L${PIVOT_X} ${PIVOT_Y + 5} L${PIVOT_X - ARM - 4} ${PIVOT_Y + 2.5} Z`}
          fill={`url(#${gid}-bar)`}
          strokeLinejoin="round"
        />
        <circle
          cx={PIVOT_X}
          cy={PIVOT_Y}
          r={7}
          fill={`url(#${gid}-knob)`}
          style={{ stroke: BRASS_LO }}
          strokeWidth={1}
        />
        <circle cx={PIVOT_X} cy={PIVOT_Y} r={2} style={{ fill: BRASS_LO }} />
        <g ref={leftRef} transform={initial.left}>
          {pan("pros")}
        </g>
        <g ref={rightRef} transform={initial.right}>
          {pan("cons")}
        </g>
      </g>
    </svg>
  );
}

function WeightDots({
  value,
  onChange,
  label,
}: {
  value: Weight;
  onChange: (weight: Weight) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (next: Weight) => {
    onChange(next);
    refs.current[next - 1]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={`Weight of ${label}`}
      className="flex shrink-0"
    >
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={["Light", "Medium", "Heavy"][n - 1]}
          tabIndex={value === n ? 0 : -1}
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            const step =
              e.key === "ArrowRight" || e.key === "ArrowUp"
                ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? -1
                  : 0;
            if (!step) return;
            e.preventDefault();
            choose(Math.min(3, Math.max(1, value + step)) as Weight);
          }}
          className="grid size-7 touch-manipulation place-items-center rounded-full outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
        >
          {/* Bigger dot, heavier weight: the row reads like the pan. */}
          <span
            className={cn(
              "rounded-full transition-[background-color] duration-150 ease-out",
              ["size-1.5", "size-2", "size-2.5"][n - 1],
              n <= value ? "bg-foreground" : "bg-foreground/15",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function Column({
  side,
  items,
  onChange,
  onAdd,
}: {
  side: Side;
  items: Reason[];
  onChange: (items: Reason[]) => void;
  onAdd: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [draft, setDraft] = useState("");
  const title = side === "pros" ? "Pros" : "Cons";
  const noun = side === "pros" ? "pro" : "con";
  const full = items.length >= MAX_ITEMS;

  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <h3 className="mb-1.5 flex items-baseline justify-between px-1 text-sm font-medium text-foreground">
        {title}
        <span className="text-muted tabular-nums">{total(items)}</span>
      </h3>
      <ul
        ref={listRef}
        // Stacked on a phone, a shorter list keeps both sides near the
        // scale; the half row showing says there is more to scroll.
        className="relative h-[140px] overflow-y-auto overscroll-contain sm:h-[168px]"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout="position"
              initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{
                opacity: 0,
                transition: { duration: 0.12, ease: "easeOut" },
              }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="flex h-10 items-center gap-0.5 rounded-lg pl-1"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {item.text}
              </span>
              <WeightDots
                label={item.text}
                value={item.weight}
                onChange={(weight) =>
                  onChange(
                    items.map((r) => (r.id === item.id ? { ...r, weight } : r)),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove ${item.text}`}
                onClick={() => {
                  onChange(items.filter((r) => r.id !== item.id));
                  inputRef.current?.focus();
                }}
                className="grid size-7 shrink-0 touch-manipulation place-items-center rounded-full text-muted outline-hidden transition-[scale,color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="m4.5 4.5 7 7m0-7-7 7" />
                </svg>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <input
        ref={inputRef}
        value={draft}
        maxLength={48}
        disabled={full}
        aria-label={`Add a ${noun}`}
        placeholder={full ? "This pan is full" : `Add a ${noun}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onAdd(text);
          setDraft("");
          // Show the new row; the list scrolls, never the page.
          requestAnimationFrame(() =>
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight }),
          );
        }}
        className="mt-2 h-10 w-full min-w-0 rounded-lg bg-background px-3 text-sm text-foreground shadow-raised outline-hidden transition-[box-shadow,opacity] duration-150 ease-out placeholder:text-muted focus:shadow-[0_0_0_1.5px_var(--foreground)] disabled:opacity-60 max-sm:text-[16px]"
      />
    </section>
  );
}

function verdictFor(pros: number, cons: number, empty: boolean) {
  if (empty) return "Add a pro or a con to start weighing";
  const diff = pros - cons;
  if (diff === 0) return "Perfectly balanced. Sleep on it.";
  const n = Math.abs(diff);
  return diff > 0
    ? `Leaning yes: pros outweigh cons by ${n}`
    : `Leaning no: cons outweigh pros by ${n}`;
}

export function BalanceScale({
  question,
  value,
  onChange,
  className,
}: {
  question: string;
  value: Ledger;
  onChange: (value: Ledger) => void;
  className?: string;
}) {
  const baseId = useId();
  const nextId = useRef(0);
  const pros = total(value.pros);
  const cons = total(value.cons);
  const verdict = verdictFor(
    pros,
    cons,
    !value.pros.length && !value.cons.length,
  );

  const setSide = (side: Side, items: Reason[]) =>
    onChange({ ...value, [side]: items });

  return (
    <div className={cn("w-[min(520px,100%)]", className)}>
      <h2 className="text-center text-[17px] font-semibold tracking-tight text-foreground">
        {question}
      </h2>
      <div className="mx-auto mt-1 w-[min(440px,100%)]">
        <Scale ledger={value} />
      </div>
      <span className="sr-only" aria-live="polite">
        {verdict}
      </span>
      <p
        aria-hidden
        className="relative mb-5 grid h-6 place-items-center text-center text-sm text-muted"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={verdict}
            initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{
              opacity: 0,
              transition: { duration: 0.12, ease: "easeOut" },
            }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="col-start-1 row-start-1"
          >
            {verdict}
          </motion.span>
        </AnimatePresence>
      </p>
      {/* Side by side from 640px; stacked on a phone, where two columns
          would cut every reason down to a few letters. */}
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        {(["pros", "cons"] as const).map((side) => (
          <Column
            key={side}
            side={side}
            items={value[side]}
            onChange={(items) => setSide(side, items)}
            onAdd={(text) =>
              setSide(side, [
                ...value[side],
                { id: `${baseId}-${nextId.current++}`, text, weight: 2 },
              ])
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function BalanceScaleDemo() {
  const [ledger, setLedger] = useState<Ledger>({
    pros: [
      { id: "p1", text: "Higher salary", weight: 3 },
      { id: "p2", text: "Sharper team", weight: 2 },
      { id: "p3", text: "New stack to learn", weight: 1 },
    ],
    cons: [
      { id: "c1", text: "Longer commute", weight: 2 },
      { id: "c2", text: "Less vacation", weight: 2 },
    ],
  });
  return (
    <BalanceScale
      question="Take the new offer?"
      value={ledger}
      onChange={setLedger}
    />
  );
}
