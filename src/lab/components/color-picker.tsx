"use client";

import { useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

type Hsva = { h: number; s: number; v: number; a: number };

// Wide enough for a useful history, narrow enough to stay one row at 320px.
const MAX_RECENT = 8;
const DEFAULT_RECENT = ["#E5484D", "#F5A524", "#30A46C", "#0090FF", "#8E4EC6"];
const SWATCH = { type: "spring", duration: 0.3, bounce: 0 } as const;
const SWATCH_EXIT = { duration: 0.15, ease: [0.23, 1, 0.32, 1] } as const;
const HUE_GRADIENT =
  "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
// Tokens, not raw greys, so transparency reads correctly in both themes.
const CHECKER = {
  backgroundImage:
    "repeating-conic-gradient(var(--border) 0 25%, var(--background) 0 50%)",
  backgroundSize: "8px 8px",
};
// Half the 20px thumb: the rail stops here so the thumb never overhangs.
const THUMB_RADIUS = 10;
const HAIRLINE =
  "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]";

const clamp = (n: number) => Math.min(Math.max(n, 0), 1);

function hsvToRgb(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)] as const;
}

// Grey has no hue and black no saturation, so both keep what the user had
// instead of snapping to 0. That is what stops the hue thumb jumping home
// when a hex like #808080 or #000 comes in.
function rgbToHsv(r: number, g: number, b: number, prev: Hsva) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = prev.h;
  if (d !== 0) {
    const sector =
      max === R
        ? ((G - B) / d) % 6
        : max === G
          ? (B - R) / d + 2
          : (R - G) / d + 4;
    h = (sector * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? prev.s : d / max, v: max };
}

function parseHex(input: string) {
  const hex = input.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
  const byte = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return {
    r: byte(0),
    g: byte(2),
    b: byte(4),
    a: full.length === 8 ? byte(6) / 255 : 1,
  };
}

function toHex({ h, s, v, a }: Hsva) {
  const pair = (n: number) => n.toString(16).padStart(2, "0");
  const alpha = Math.round(a * 255);
  return (
    "#" +
    hsvToRgb(h, s, v).map(pair).join("") +
    (alpha < 255 ? pair(alpha) : "")
  ).toUpperCase();
}

function fromHex(hex: string, prev: Hsva): Hsva | null {
  const rgba = parseHex(hex);
  if (!rgba) return null;
  return { ...rgbToHsv(rgba.r, rgba.g, rgba.b, prev), a: rgba.a };
}

// Pointer capture keeps the drag alive outside the element, and only the
// first pointer counts, so a second finger can't make the handle jump.
function useDrag({
  onPoint,
  onEnd,
  inset = 0,
}: {
  onPoint: (x: number, y: number) => void;
  onEnd: () => void;
  inset?: number;
}) {
  const pointer = useRef<number | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const point = (e: React.PointerEvent) => {
    const r = rect.current;
    if (!r) return;
    onPoint(
      clamp((e.clientX - r.left - inset) / (r.width - inset * 2)),
      clamp((e.clientY - r.top) / r.height),
    );
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    onEnd();
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (pointer.current !== null) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      // Read once per drag rather than on every move.
      rect.current = e.currentTarget.getBoundingClientRect();
      point(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerId === pointer.current) point(e);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

// Arrows move one step, Shift or the Page keys ten, Home and End jump to
// the ends.
function keyStep(e: React.KeyboardEvent, step: number) {
  const big = step * 10;
  const unit = e.shiftKey ? big : step;
  switch (e.key) {
    case "ArrowRight":
    case "ArrowUp":
      return unit;
    case "ArrowLeft":
    case "ArrowDown":
      return -unit;
    case "PageUp":
      return big;
    case "PageDown":
      return -big;
    case "Home":
      return -Infinity;
    case "End":
      return Infinity;
  }
  return null;
}

export function ColorPicker({
  defaultValue = "#5B8DEF",
  recent: initialRecent = DEFAULT_RECENT,
  onChange,
  className,
}: {
  defaultValue?: string;
  recent?: string[];
  onChange?: (hex: string) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [initial] = useState<Hsva>(
    () =>
      fromHex(defaultValue, { h: 0, s: 0, v: 0, a: 1 }) ?? {
        h: 220,
        s: 0.6,
        v: 0.9,
        a: 1,
      },
  );
  // The color lives in motion values, not React state, so a drag repaints
  // only the few styles that depend on it and never re-renders the tree.
  const h = useMotionValue(initial.h);
  const s = useMotionValue(initial.s);
  const v = useMotionValue(initial.v);
  const a = useMotionValue(initial.a);
  const read = (): Hsva => ({ h: h.get(), s: s.get(), v: v.get(), a: a.get() });

  const [recent, setRecent] = useState(() =>
    initialRecent.map((c) => c.toUpperCase()),
  );
  const [active, setActive] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const hexRef = useRef<HTMLInputElement>(null);

  const rgbOf = () => hsvToRgb(h.get(), s.get(), v.get()).join(" ");
  const rgb = useTransform(() => `rgb(${rgbOf()})`);
  const rgba = useTransform(() => `rgb(${rgbOf()} / ${a.get()})`);
  const alphaTrack = useTransform(
    () => `linear-gradient(to right, rgb(${rgbOf()} / 0), rgb(${rgbOf()}))`,
  );
  const hueColor = useTransform(h, (x) => `hsl(${x} 100% 50%)`);
  const hueFraction = useTransform(h, (x) => x / 360);
  const alphaLabel = useTransform(a, (x) => `${Math.round(x * 100)}%`);

  // The field is uncontrolled so a drag never re-renders it. It follows the
  // color except while you're typing in it.
  const syncHex = () => {
    const input = hexRef.current;
    if (input && document.activeElement !== input)
      input.value = toHex(read()).slice(1);
  };
  useMotionValueEvent(h, "change", syncHex);
  useMotionValueEvent(s, "change", syncHex);
  useMotionValueEvent(v, "change", syncHex);
  useMotionValueEvent(a, "change", syncHex);

  const update = (patch: Partial<Hsva>) => {
    if (patch.h !== undefined) h.set(patch.h);
    if (patch.s !== undefined) s.set(patch.s);
    if (patch.v !== undefined) v.set(patch.v);
    if (patch.a !== undefined) a.set(patch.a);
    const hex = toHex(read());
    // Once it is null this bails out without rendering.
    setActive((current) => (current === hex ? current : null));
    onChange?.(hex);
  };

  // Recents update when a change settles, so a drag adds one swatch rather
  // than one per frame.
  const commit = () => {
    const hex = toHex(read());
    setRecent((list) =>
      list[0] === hex
        ? list
        : [hex, ...list.filter((c) => c !== hex)].slice(0, MAX_RECENT),
    );
    setActive(hex);
  };

  const applyHex = (leaving: boolean) => {
    const input = hexRef.current;
    if (!input) return;
    const next = fromHex(input.value, read());
    if (!next) {
      // Enter keeps the text so it can be fixed. Leaving the field puts the
      // real value back rather than stranding a broken one.
      if (leaving) input.value = toHex(read()).slice(1);
      setInvalid(!leaving);
      return;
    }
    setInvalid(false);
    const changed = toHex(next) !== toHex(read());
    update(next);
    input.value = toHex(next).slice(1);
    if (changed) commit();
  };

  return (
    // 20px outer radius around 8px controls with 12px padding: concentric.
    <div
      className={cn(
        "flex w-[min(320px,100%)] flex-col gap-3 rounded-[20px] bg-background p-3 shadow-raised",
        className,
      )}
    >
      <Pad
        s={s}
        v={v}
        hueColor={hueColor}
        rgb={rgb}
        onChange={update}
        onCommit={commit}
      />

      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Channel
            label="Hue"
            max={360}
            fraction={hueFraction}
            track={HUE_GRADIENT}
            thumb={hueColor}
            valueText={(f) => `${Math.round(f * 360)} degrees`}
            onChange={(f) => update({ h: f * 360 })}
            onCommit={commit}
            step={1 / 360}
          />
          <Channel
            label="Opacity"
            max={100}
            fraction={a}
            track={alphaTrack}
            thumb={rgba}
            checker
            valueText={(f) => `${Math.round(f * 100)}%`}
            onChange={(f) => update({ a: f })}
            onCommit={commit}
            step={0.01}
          />
        </div>
        <span
          aria-hidden
          className="relative size-11 shrink-0 overflow-hidden rounded-lg"
          style={CHECKER}
        >
          <motion.span
            className={cn("absolute inset-0 rounded-lg", HAIRLINE)}
            style={{ backgroundColor: rgba }}
          />
        </span>
      </div>

      <div className="flex gap-2">
        <label
          htmlFor={`${id}-hex`}
          className={cn(
            "flex h-9 flex-1 cursor-text items-center rounded-lg border bg-background px-2.5 font-mono text-sm text-foreground transition-[border-color] duration-150 ease-out focus-within:outline-2 focus-within:outline-solid focus-within:-outline-offset-1",
            invalid
              ? "border-danger focus-within:outline-danger"
              : "border-border focus-within:outline-foreground",
          )}
        >
          <span
            className={cn(
              "transition-[color] duration-150 ease-out select-none",
              invalid ? "text-danger" : "text-muted",
            )}
          >
            #
          </span>
          <input
            ref={hexRef}
            id={`${id}-hex`}
            aria-label="Hex color"
            aria-invalid={invalid}
            defaultValue={toHex(initial).slice(1)}
            maxLength={9}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            className="min-w-0 flex-1 bg-transparent pl-0.5 uppercase outline-hidden max-sm:text-[16px]"
            onFocus={(e) => e.currentTarget.select()}
            onChange={() => {
              if (invalid) setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyHex(false);
              if (e.key === "Escape") {
                e.currentTarget.value = toHex(read()).slice(1);
                setInvalid(false);
              }
            }}
            onBlur={() => applyHex(true)}
          />
        </label>
        <motion.span
          aria-hidden
          className="flex h-9 w-14 items-center justify-center rounded-lg border border-border font-mono text-sm text-muted tabular-nums select-none"
        >
          {alphaLabel}
        </motion.span>
        <span className="sr-only" aria-live="polite">
          {invalid ? "Not a valid hex color" : ""}
        </span>
      </div>

      <div className="border-t border-border pt-3">
        <p
          id={`${id}-recent`}
          className="mb-2 text-xs text-muted select-none"
        >
          Recent
        </p>
        <div
          role="group"
          aria-labelledby={`${id}-recent`}
          className="relative flex h-7 gap-2"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {recent.map((hex) => (
              <motion.button
                key={hex}
                type="button"
                layout={reduceMotion ? false : "position"}
                aria-label={`Use ${hex}`}
                aria-pressed={active === hex}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.6, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  ...(reduceMotion ? {} : { scale: 0.6, filter: "blur(4px)" }),
                  transition: SWATCH_EXIT,
                }}
                transition={SWATCH}
                onClick={() => {
                  const next = fromHex(hex, read());
                  if (!next) return;
                  // Applies without reordering, so the swatch under the
                  // cursor stays exactly where it is.
                  update(next);
                  setActive(hex);
                  setInvalid(false);
                }}
                className={cn(
                  "relative size-7 shrink-0 touch-manipulation rounded-full ring-offset-2 ring-offset-background outline-hidden transition-[scale,box-shadow] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[box-shadow]",
                  // A 36px hit area; with the 8px gap neighbours meet but
                  // never overlap.
                  "after:absolute after:-inset-1 after:rounded-full",
                  active === hex ? "ring-2 ring-foreground" : "ring-0",
                )}
                style={CHECKER}
              >
                <span
                  className={cn("absolute inset-0 rounded-full", HAIRLINE)}
                  style={{ backgroundColor: hex }}
                />
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Pad({
  s,
  v,
  hueColor,
  rgb,
  onChange,
  onCommit,
}: {
  s: MotionValue<number>;
  v: MotionValue<number>;
  hueColor: MotionValue<string>;
  rgb: MotionValue<string>;
  onChange: (patch: Partial<Hsva>) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const drag = useDrag({
    onPoint: (x, y) => onChange({ s: x, v: 1 - y }),
    onEnd: onCommit,
  });
  // left/top on one small absolute element rather than a translated
  // full-size layer, which would overhang the pad and widen the page.
  const left = useTransform(s, (x) => `${x * 100}%`);
  const top = useTransform(v, (x) => `${(1 - x) * 100}%`);

  const text = () =>
    `Saturation ${Math.round(s.get() * 100)}%, brightness ${Math.round(v.get() * 100)}%`;
  const syncAria = () => {
    ref.current?.setAttribute(
      "aria-valuenow",
      String(Math.round(s.get() * 100)),
    );
    ref.current?.setAttribute("aria-valuetext", text());
  };
  useMotionValueEvent(s, "change", syncAria);
  useMotionValueEvent(v, "change", syncAria);

  return (
    <motion.div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-roledescription="2D slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(s.get() * 100)}
      aria-valuetext={text()}
      {...drag}
      onKeyDown={(e) => {
        const delta = keyStep(e, 0.01);
        if (delta === null) return;
        e.preventDefault();
        dirty.current = true;
        // Left and right move saturation, the rest brightness, matching the
        // axes on screen.
        if (e.key === "ArrowLeft" || e.key === "ArrowRight")
          onChange({ s: clamp(s.get() + delta) });
        else onChange({ v: clamp(v.get() + delta) });
      }}
      onBlur={() => {
        if (dirty.current) onCommit();
        dirty.current = false;
      }}
      className="group relative h-44 cursor-crosshair touch-none rounded-lg outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
      style={{
        backgroundColor: hueColor,
        backgroundImage:
          "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-0 rounded-lg",
          HAIRLINE,
        )}
      />
      <Thumb left={left} top={top} fill={rgb} />
    </motion.div>
  );
}

function Channel({
  label,
  max,
  fraction,
  track,
  thumb,
  checker,
  valueText,
  onChange,
  onCommit,
  step,
}: {
  label: string;
  max: number;
  fraction: MotionValue<number>;
  track: string | MotionValue<string>;
  thumb: MotionValue<string>;
  checker?: boolean;
  valueText: (fraction: number) => string;
  onChange: (fraction: number) => void;
  onCommit: () => void;
  step: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const drag = useDrag({
    onPoint: (x) => onChange(x),
    onEnd: onCommit,
    inset: THUMB_RADIUS,
  });
  const left = useTransform(fraction, (f) => `${f * 100}%`);

  useMotionValueEvent(fraction, "change", (f) => {
    ref.current?.setAttribute("aria-valuenow", String(Math.round(f * max)));
    ref.current?.setAttribute("aria-valuetext", valueText(f));
  });

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(fraction.get() * max)}
      aria-valuetext={valueText(fraction.get())}
      {...drag}
      onKeyDown={(e) => {
        const delta = keyStep(e, step);
        if (delta === null) return;
        e.preventDefault();
        dirty.current = true;
        onChange(clamp(fraction.get() + delta));
      }}
      onBlur={() => {
        if (dirty.current) onCommit();
        dirty.current = false;
      }}
      className="group relative h-7 cursor-pointer touch-none rounded-full outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground"
    >
      <span
        className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full"
        style={checker ? CHECKER : undefined}
      >
        <motion.span
          className={cn("absolute inset-0 rounded-full", HAIRLINE)}
          style={{ backgroundImage: track }}
        />
      </span>
      <span
        className="pointer-events-none absolute inset-y-0"
        style={{ left: THUMB_RADIUS, right: THUMB_RADIUS }}
      >
        <Thumb left={left} top="50%" fill={thumb} checker={checker} />
      </span>
    </div>
  );
}

function Thumb({
  left,
  top,
  fill,
  checker,
}: {
  left: MotionValue<string>;
  top: MotionValue<string> | string;
  fill: MotionValue<string>;
  checker?: boolean;
}) {
  return (
    <motion.span
      // Raw black and white on purpose: the thumb sits on arbitrary colors,
      // so it needs a ring that contrasts with all of them, not a theme.
      // It grows a touch while held so you can tell you've got hold of it.
      className="pointer-events-none absolute size-5 -translate-1/2 overflow-hidden rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.3)] transition-[scale] duration-150 ease-out group-active:scale-110 motion-reduce:transition-none"
      style={{ left, top, ...(checker ? CHECKER : {}) }}
    >
      <motion.span className="absolute inset-0" style={{ backgroundColor: fill }} />
    </motion.span>
  );
}

export default function ColorPickerDemo() {
  return <ColorPicker />;
}
