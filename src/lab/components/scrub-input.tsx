"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Below this the press is a click on the label (which focuses the field),
// not the start of a scrub.
const DRAG_THRESHOLD = 3;
// Spacing of the tape's minor ticks; majors land every fifth.
const TICK = 6;

type Scrub = {
  id: number;
  startX: number;
  lastX: number;
  // Unrounded running value, so slow fine drags accumulate instead of
  // rounding every sub-step away.
  raw: number;
  start: number;
  sent: number;
  moved: boolean;
};

function decimalsOf(n: number) {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

// Shift is a coarse gear, Alt/Option a fine one, like Figma.
function gear(e: { shiftKey: boolean; altKey: boolean }) {
  return e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
}

export function ScrubInput({
  label,
  name,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  // One more decimal than the step, so the fine gear has room to land.
  precision = decimalsOf(step) + 1,
  pixelsPerStep = 1,
  suffix = "",
  lockPointer = false,
  className,
}: {
  label: React.ReactNode;
  name: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  pixelsPerStep?: number;
  suffix?: string;
  // Opt-in: browsers announce pointer lock with a banner, which is too loud
  // for a quick nudge but worth it for long scrubs past the screen edge.
  lockPointer?: boolean;
  className?: string;
}) {
  const id = useId();
  const labelRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useRef<Scrub | null>(null);
  const suppressClick = useRef(false);
  const skipCommit = useRef(false);
  const selectNext = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  // What the user is typing; null means the field shows the live value.
  const [draft, setDraft] = useState<string | null>(null);

  // The tape pattern repeats every major tick, so only the remainder
  // matters, which also keeps huge values from losing precision.
  const period = TICK * 5;
  const tape = ((((value / step) * pixelsPerStep) % period) + period) % period;

  const clamp = (n: number) => Math.min(Math.max(n, min), max);
  const round = (n: number) => Number(n.toFixed(precision));
  const format = (n: number) => `${round(n)}${suffix}`;
  const parse = (text: string) => {
    const trimmed = (suffix ? text.replace(suffix, "") : text).trim();
    const n = Number(trimmed);
    return trimmed === "" || Number.isNaN(n) ? null : clamp(round(n));
  };

  // Re-selects after React writes the new value, which would otherwise
  // drop the caret at the end.
  useLayoutEffect(() => {
    if (!selectNext.current) return;
    selectNext.current = false;
    inputRef.current?.select();
  }, [draft]);

  const endScrub = () => {
    if (document.pointerLockElement === labelRef.current) {
      document.exitPointerLock();
    }
    document.documentElement.style.removeProperty("cursor");
    suppressClick.current = scrub.current?.moved ?? false;
    scrub.current = null;
    setScrubbing(false);
  };

  // Escape mid-scrub puts the value back where the drag started. Only
  // subscribed while scrubbing.
  useEffect(() => {
    if (!scrubbing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !scrub.current) return;
      onChange(scrub.current.start);
      endScrub();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(
    () => () => {
      if (!scrub.current) return;
      if (document.pointerLockElement) document.exitPointerLock();
      document.documentElement.style.removeProperty("cursor");
    },
    [],
  );

  const commit = () => {
    if (draft === null) return value;
    const next = parse(draft);
    if (next !== null && next !== value) onChange(next);
    return next ?? value;
  };

  const stepBy = (delta: number) => {
    const base = draft === null ? value : (parse(draft) ?? value);
    const next = clamp(round(base + delta));
    if (next !== value) onChange(next);
    selectNext.current = true;
    setDraft(format(next));
  };

  return (
    <div
      className={cn(
        "relative flex h-10 items-center overflow-hidden rounded-lg bg-background outline-foreground has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-solid",
        className,
      )}
    >
      {/* A tape measure surfaces along the bottom edge while scrubbing and
          runs under a fixed needle, higher values arriving from the right,
          like the dial on a lens. One step of value is one pixel of tape
          (at the normal gear), so the ticks travel exactly as far as the
          pointer does: the number changing is visibly the tape moving. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-2 text-muted",
          "transition-[opacity,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0",
          scrubbing
            ? "translate-y-0 opacity-100 duration-150"
            : "translate-y-1 opacity-0 duration-200",
        )}
        style={{
          // Fades the tape out toward both ends, so it reads as endless.
          maskImage:
            "linear-gradient(to right, transparent, #000 30%, #000 70%, transparent)",
        }}
      >
        <span
          className="absolute inset-0"
          style={{
            // Minor ticks every 6px, a taller major tick every 30px.
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to right, currentColor 1px, transparent 1px)",
            backgroundSize: `${TICK}px 3px, ${TICK * 5}px 6px`,
            backgroundRepeat: "repeat-x",
            backgroundPositionY: "bottom",
            backgroundPositionX: `calc(50% - ${tape}px)`,
          }}
        />
        <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-foreground" />
      </span>
      <label
        ref={labelRef}
        htmlFor={id}
        className={cn(
          "flex h-full w-9 shrink-0 cursor-ew-resize touch-none items-center justify-center text-sm text-muted transition-[color] duration-150 ease-out select-none hover:text-foreground",
          scrubbing && "text-foreground",
        )}
        onPointerDown={(e) => {
          // Ignores a second finger rather than letting it hijack the drag.
          if (e.button !== 0 || scrub.current) return;
          // Keeps the press from selecting text or moving focus yet.
          e.preventDefault();
          let start = value;
          if (document.activeElement === inputRef.current) {
            start = commit();
            skipCommit.current = true;
            inputRef.current?.blur();
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = {
            id: e.pointerId,
            startX: e.clientX,
            lastX: e.clientX,
            raw: start,
            start,
            sent: start,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const s = scrub.current;
          if (!s || e.pointerId !== s.id) return;
          if (!s.moved) {
            if (Math.abs(e.clientX - s.startX) < DRAG_THRESHOLD) return;
            s.moved = true;
            setScrubbing(true);
            // Keeps the resize cursor once the pointer leaves the label.
            document.documentElement.style.cursor = "ew-resize";
            if (lockPointer && e.pointerType === "mouse") {
              // Older browsers return nothing, newer ones a promise that
              // rejects when lock is refused. Either way the captured
              // pointer below keeps scrubbing.
              Promise.resolve(e.currentTarget.requestPointerLock?.()).catch(
                () => {},
              );
            }
          }
          // A locked pointer stays put, so only movementX reports travel.
          const locked = document.pointerLockElement === e.currentTarget;
          const dx = locked ? e.movementX : e.clientX - s.lastX;
          s.lastX = e.clientX;
          s.raw = clamp(s.raw + (dx / pixelsPerStep) * step * gear(e));
          const next = round(s.raw);
          // Renders only when the shown number changes, not every pixel.
          if (next === s.sent) return;
          s.sent = next;
          onChange(next);
        }}
        onPointerUp={(e) => {
          if (scrub.current?.id === e.pointerId) endScrub();
        }}
        onPointerCancel={(e) => {
          if (scrub.current?.id === e.pointerId) endScrub();
        }}
        onClick={(e) => {
          // The click that ends a scrub shouldn't also drop you into typing.
          if (suppressClick.current) e.preventDefault();
          suppressClick.current = false;
        }}
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="spinbutton"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={name}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        value={draft ?? format(value)}
        className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-sm text-foreground tabular-nums outline-hidden max-sm:text-[16px]"
        onFocus={(e) => {
          setDraft(format(value));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!skipCommit.current) commit();
          skipCommit.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Stays in the field with the result selected, so the next
            // edit is one keystroke away.
            const next = commit();
            selectNext.current = true;
            setDraft(format(next));
          } else if (e.key === "Escape") {
            skipCommit.current = true;
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            stepBy((e.key === "ArrowUp" ? step : -step) * gear(e));
          }
        }}
      />
    </div>
  );
}

function AngleIcon() {
  return (
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
      <path d="M3 3v10h10" />
      <path d="M3 7.5a5.5 5.5 0 0 1 5.5 5.5" />
    </svg>
  );
}

export default function ScrubInputDemo() {
  const [x, setX] = useState(120);
  const [y, setY] = useState(48);
  const [rotation, setRotation] = useState(0);

  return (
    // 18px outer radius over 10px padding keeps the 8px fields concentric.
    <div className="w-[380px] max-w-full rounded-[18px] bg-surface p-2.5 shadow-raised">
      <div className="px-2 pt-0.5 pb-2.5 text-sm font-medium text-foreground">
        Transform
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <ScrubInput label="X" name="X position" value={x} onChange={setX} />
        <ScrubInput label="Y" name="Y position" value={y} onChange={setY} />
        <ScrubInput
          label={<AngleIcon />}
          name="Rotation"
          value={rotation}
          onChange={setRotation}
          min={-180}
          max={180}
          suffix="°"
        />
      </div>
    </div>
  );
}
