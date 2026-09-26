"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type ValueAnimationTransition,
} from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

type Phase = "compose" | "sending" | "sent";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
// Gravity: the note drops into the pocket and the envelope is flung away,
// so both gather speed rather than settle.
const EASE_IN = [0.55, 0, 1, 0.45] as const;

// Envelope geometry in px. The paper area is 200 tall, so a 168 tall
// envelope sits centered in it with 16px to spare above and below.
const PAPER_H = 200;
const ENV_W = 272;
const ENV_H = 168;
const ENV_TOP = (PAPER_H - ENV_H) / 2;
// The flap tip lands just past the pocket's V (92), so it fully covers it.
const FLAP_H = 96;
const POCKET_V = 92;
// The note shrinks to this width: 20px clear of each side of the envelope.
const NOTE_W = 232;
const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");

// Wax seal outline: a circle with 13 soft lobes, like wax squeezed out
// under the stamp. Built once at module load.
const SEAL_R = 17;
const SEAL_PATH =
  Array.from({ length: 52 }, (_, i) => {
    const a = (i / 52) * Math.PI * 2;
    const r = SEAL_R - 1.6 + Math.sin(a * 13) * 1.1 + Math.sin(a * 5 + 1) * 0.5;
    const x = (SEAL_R + Math.cos(a) * r).toFixed(2);
    const y = (SEAL_R + Math.sin(a) * r).toFixed(2);
    return `${i === 0 ? "M" : "L"}${x} ${y}`;
  }).join(" ") + " Z";

// Physical materials, not UI colors: sealing wax, and the red and blue of
// airmail borders and postage ink. Each pair is tuned per theme so the
// print sits on the paper instead of glowing on it.
const WAX = "light-dark(#b3261e, #c4382c)";
const WAX_LIGHT = "light-dark(#d9594b, #e06a5c)";
const AIR_RED = "light-dark(#d4483b, #d9594b)";
const AIR_BLUE = "light-dark(#2d5bb8, #5b85d6)";

const noop = () => () => {};
const readModifier = () =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export function EnvelopeSend({
  onSend,
  title = "Send feedback",
  description = "Tell us what to fix. We read every note.",
  placeholder = "What could be better?",
  className,
}: {
  onSend?: (message: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const modifier = useSyncExternalStore(noop, readModifier, () => "Ctrl");
  const fieldId = useId();
  const [phase, setPhase] = useState<Phase>("compose");
  const [message, setMessage] = useState("");
  const paperRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const running = useRef<AnimationPlaybackControls[]>([]);
  const svgId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [sentOn, setSentOn] = useState("");

  // The header and footer fade as one; the note, envelope and the group
  // they fly off in each get their own values so steps can overlap.
  const chrome = useMotionValue(1);
  const noteScale = useMotionValue(1);
  const noteY = useMotionValue(0);
  const envOpacity = useMotionValue(0);
  const envY = useMotionValue(16);
  // 180deg is fully open, folded up behind the note.
  const flap = useMotionValue(180);
  const seal = useMotionValue(0);
  const groupX = useMotionValue(0);
  const groupY = useMotionValue(0);
  const groupRotate = useMotionValue(0);
  const groupOpacity = useMotionValue(1);
  const groupBlur = useMotionValue(0);
  const groupFilter = useTransform(groupBlur, (b) =>
    b > 0.01 ? `blur(${b}px)` : "none",
  );
  // Open, the flap sits behind the note; past vertical it folds over it.
  const flapZ = useTransform(flap, (r) => (r > 90 ? 1 : 4));
  // Pressed down from above: the seal lands a little large and settles
  // flat, rather than growing out of nothing.
  const sealScale = useTransform(seal, [0, 1], [1.35, 1]);

  useEffect(() => {
    const list = running;
    return () => list.current.forEach((c) => c.stop());
  }, []);

  const play = (
    value: MotionValue<number>,
    to: number,
    transition: ValueAnimationTransition<number>,
  ) => {
    const controls = animate(value, to, transition);
    running.current.push(controls);
    return controls;
  };

  const finish = () => {
    running.current = [];
    setPhase("sent");
    // Wait a frame for the sent panel to lose inert before focusing it.
    requestAnimationFrame(() => againRef.current?.focus());
  };

  const send = async () => {
    const text = message.trim();
    const paper = paperRef.current;
    if (phase !== "compose" || !text || !paper) return;
    setPhase("sending");
    const now = new Date();
    setSentOn(`${now.getDate()} ${MONTHS[now.getMonth()]}`);
    onSend?.(text);

    if (reduceMotion) {
      chrome.jump(0);
      groupOpacity.jump(0);
      finish();
      return;
    }

    const scale = NOTE_W / paper.offsetWidth;
    const noteH = PAPER_H * scale;

    // 1. 240ms: the note shrinks and lifts over the envelope's mouth while
    // the envelope rises in beneath it.
    await Promise.all([
      play(chrome, 0, { duration: 0.15, ease: EASE_OUT }),
      play(noteScale, scale, { duration: 0.24, ease: EASE_IN_OUT }),
      play(noteY, ENV_TOP - noteH * 0.55, {
        duration: 0.24,
        ease: EASE_IN_OUT,
      }),
      play(envOpacity, 1, { duration: 0.18, ease: EASE_OUT }),
      play(envY, 0, { duration: 0.24, ease: EASE_OUT }),
    ]);
    // 2. 160ms: it drops into the pocket, 10px below the envelope's top.
    await play(noteY, ENV_TOP + 10, { duration: 0.16, ease: EASE_IN });
    // 3. 180ms: the flap folds shut over it.
    await play(flap, 0, { duration: 0.18, ease: EASE_IN_OUT });
    // 4 and 5. The wax presses on, holds for a beat so you see it land,
    // then the envelope is flung up and away. The flight runs 340ms, longer
    // than a UI transition, because it is the one-off payoff of the send.
    play(seal, 1, { type: "spring", duration: 0.3, bounce: 0.25 });
    const away = { duration: 0.34, ease: EASE_IN, delay: 0.22 };
    await Promise.all([
      play(groupX, 180, away),
      play(groupY, -60, away),
      play(groupRotate, -10, away),
      play(groupOpacity, 0, away),
    ]);
    finish();
  };

  const writeAnother = () => {
    setMessage("");
    setPhase("compose");
    // Everything resets out of sight, then the blank note fades back in.
    noteScale.jump(1);
    noteY.jump(0);
    envOpacity.jump(0);
    envY.jump(16);
    flap.jump(180);
    seal.jump(0);
    groupX.jump(0);
    groupRotate.jump(0);
    if (reduceMotion) {
      groupY.jump(0);
      groupOpacity.jump(1);
      chrome.jump(1);
    } else {
      groupY.jump(8);
      groupBlur.jump(4);
      const enter = { duration: 0.3, ease: EASE_OUT };
      play(groupY, 0, enter);
      play(groupBlur, 0, enter);
      play(groupOpacity, 1, enter);
      play(chrome, 1, enter);
    }
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const empty = message.trim() === "";
  const FLAP_PATH = `M1 1 L${ENV_W - 1} 1 L${ENV_W / 2 + 8} ${FLAP_H - 6} Q${ENV_W / 2} ${FLAP_H} ${ENV_W / 2 - 8} ${FLAP_H - 6} Z`;
  // Starts at the very corners (not 6px down) so no sliver of the note
  // shows between the closed flap and the pocket's slanted edges.
  const POCKET_PATH = `M0.5 0.5 L${ENV_W / 2} ${POCKET_V} L${ENV_W - 0.5} 0.5 L${ENV_W - 0.5} ${ENV_H - 6} Q${ENV_W - 0.5} ${ENV_H - 0.5} ${ENV_W - 6} ${ENV_H - 0.5} L6 ${ENV_H - 0.5} Q0.5 ${ENV_H - 0.5} 0.5 ${ENV_H - 6} Z`;
  const envelopeBox = {
    left: `calc(50% - ${ENV_W / 2}px)`,
    top: ENV_TOP,
    width: ENV_W,
  };

  return (
    <div
      className={cn(
        "relative h-[392px] w-[min(440px,100%)] rounded-[20px] bg-surface p-5 shadow-raised",
        className,
      )}
    >
      <div inert={phase !== "compose"} className="flex h-full flex-col">
        <motion.div style={{ opacity: chrome }}>
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </motion.div>

        <motion.div
          className="relative mt-4 shrink-0"
          style={{
            height: PAPER_H,
            x: groupX,
            y: groupY,
            rotate: groupRotate,
            opacity: groupOpacity,
            filter: groupFilter,
          }}
        >
          {/* Envelope back: the inside you see behind the note. */}
          <motion.svg
            aria-hidden
            viewBox={`0 0 ${ENV_W} ${ENV_H}`}
            className="pointer-events-none absolute z-[1] overflow-visible"
            style={{
              ...envelopeBox,
              height: ENV_H,
              opacity: envOpacity,
              y: envY,
            }}
          >
            <rect
              x="0.5"
              y="0.5"
              width={ENV_W - 1}
              height={ENV_H - 1}
              rx="6"
              className="fill-background stroke-foreground/15"
            />
            {/* A shade darker than the pocket, so the inside reads as
                being in shadow. */}
            <rect
              x="0.5"
              y="0.5"
              width={ENV_W - 1}
              height={ENV_H - 1}
              rx="6"
              className="fill-foreground/[0.06]"
            />
            <defs>
              {/* Airmail border: red and blue bars at 45deg with paper
                  between, the one print every letter recognises. */}
              <pattern
                id={`${svgId}-air`}
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="20" style={{ fill: AIR_RED }} />
                <rect x="10" width="6" height="20" style={{ fill: AIR_BLUE }} />
              </pattern>
            </defs>
          </motion.svg>

          {/* The flap hinges on the envelope's top edge. */}
          <motion.svg
            aria-hidden
            viewBox={`0 0 ${ENV_W} ${FLAP_H}`}
            className="pointer-events-none absolute overflow-visible"
            style={{
              ...envelopeBox,
              height: FLAP_H,
              opacity: envOpacity,
              y: envY,
              rotateX: flap,
              zIndex: flapZ,
              transformPerspective: 600,
              originY: 0,
            }}
          >
            <clipPath id={`${svgId}-flap`}>
              <path d={FLAP_PATH} />
            </clipPath>
            <path
              d={FLAP_PATH}
              strokeLinejoin="round"
              className="fill-background stroke-foreground/20"
            />
            {/* The airmail band along the top edge prints on the flap, so
                it stays unbroken once the flap is closed. */}
            <rect
              x="0"
              y="0"
              width={ENV_W}
              height={ENV_H}
              fill="none"
              stroke={`url(#${svgId}-air)`}
              strokeWidth="10"
              clipPath={`url(#${svgId}-flap)`}
              opacity="0.9"
            />
          </motion.svg>

          <motion.div
            ref={paperRef}
            className="absolute inset-0 z-[2] rounded-[12px] bg-background shadow-raised"
            style={{
              scale: noteScale,
              y: noteY,
              originY: 0,
              // Ruled writing lines under each 24px line of text: the first
              // sits 38px down, just under the first line's descenders.
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 23px, color-mix(in oklab, var(--foreground) 9%, transparent) 23px 24px)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "16px 15px",
              backgroundSize: "calc(100% - 32px) calc(100% - 30px)",
            }}
          >
            <Stamp className="pointer-events-none absolute top-3 right-3 rotate-[4deg]" />
            <label htmlFor={fieldId} className="sr-only">
              {title}
            </label>
            <textarea
              id={fieldId}
              ref={textRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              readOnly={phase !== "compose"}
              className="block size-full resize-none rounded-[12px] bg-transparent py-4 pr-[68px] pl-4 text-[15px] leading-6 text-foreground outline-hidden placeholder:text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
            />
          </motion.div>

          {/* Pocket front: covers everything but the V the note slides into. */}
          <motion.svg
            aria-hidden
            viewBox={`0 0 ${ENV_W} ${ENV_H}`}
            className="pointer-events-none absolute z-[3] overflow-visible"
            style={{
              ...envelopeBox,
              height: ENV_H,
              opacity: envOpacity,
              y: envY,
            }}
          >
            <clipPath id={`${svgId}-pocket`}>
              <path d={POCKET_PATH} />
            </clipPath>
            <path
              d={POCKET_PATH}
              strokeLinejoin="round"
              className="fill-background stroke-foreground/15"
            />
            <rect
              x="0"
              y="0"
              width={ENV_W}
              height={ENV_H}
              fill="none"
              stroke={`url(#${svgId}-air)`}
              strokeWidth="10"
              clipPath={`url(#${svgId}-pocket)`}
              opacity="0.9"
            />
            {/* The side folds meeting under the V. */}
            <path
              d={`M1 ${ENV_H - 1} L${ENV_W / 2 - 14} ${POCKET_V + 18} M${ENV_W - 1} ${ENV_H - 1} L${ENV_W / 2 + 14} ${POCKET_V + 18}`}
              className="fill-none stroke-foreground/10"
            />
          </motion.svg>

          <motion.svg
            aria-hidden
            viewBox={`0 0 ${SEAL_R * 2} ${SEAL_R * 2}`}
            className="pointer-events-none absolute z-[5] overflow-visible"
            style={{
              width: SEAL_R * 2,
              height: SEAL_R * 2,
              left: `calc(50% - ${SEAL_R}px)`,
              // Centered on the flap tip, where the seal holds it shut.
              top: ENV_TOP + FLAP_H - SEAL_R - 4,
              scale: sealScale,
              opacity: seal,
            }}
          >
            <path
              d={SEAL_PATH}
              style={{ fill: WAX }}
              className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]"
            />
            {/* The pressed ring and emboss catch light on their upper edge. */}
            <circle
              cx={SEAL_R}
              cy={SEAL_R}
              r={SEAL_R - 6}
              fill="none"
              strokeWidth="1.5"
              style={{ stroke: WAX_LIGHT }}
              opacity="0.7"
            />
            <path
              d={`M${SEAL_R - 5} ${SEAL_R + 0.5} l3.5 3.5 l6.5 -7`}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: WAX_LIGHT }}
            />
          </motion.svg>
        </motion.div>

        <motion.div
          className="mt-auto flex items-center justify-between gap-3"
          style={{ opacity: chrome }}
        >
          <span className="text-xs text-muted [@media(hover:none)]:invisible">
            <kbd className="font-sans">{modifier}</kbd>
            {" + "}
            <kbd className="font-sans">Enter</kbd> to send
          </span>
          <button
            type="button"
            onClick={send}
            disabled={empty}
            className="flex h-9 touch-manipulation items-center gap-1.5 rounded-full bg-foreground pr-4 pl-3.5 text-sm font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1.75" y="3.5" width="12.5" height="9" rx="1.5" />
              <path d="m2.25 4.25 5.75 4.25 5.75-4.25" />
            </svg>
            Send
          </button>
        </motion.div>
      </div>

      {/* Enters only after the envelope has gone; leaves quickly so writing
          another is never kept waiting. */}
      <div
        inert={phase !== "sent"}
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center text-center",
          "transition-[opacity,filter,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
          phase === "sent"
            ? "translate-y-0 opacity-100 filter-none duration-300"
            : "pointer-events-none translate-y-1.5 opacity-0 blur-[4px] duration-150 motion-reduce:translate-y-0 motion-reduce:filter-none",
        )}
      >
        <Postmark date={sentOn} />
        <p className="mt-4 text-lg font-medium text-foreground">
          On its way
        </p>
        <p className="mt-1 text-sm text-muted">
          Thanks for the note. We read every one.
        </p>
        <button
          ref={againRef}
          type="button"
          onClick={writeAnother}
          className="mt-5 h-9 touch-manipulation rounded-full bg-background px-4 text-sm font-medium text-foreground shadow-raised outline-hidden transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
        >
          Write another
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {phase === "sent" ? "Feedback sent" : ""}
      </span>
    </div>
  );
}

// A postage stamp: perforated edge, a printed scene in postage ink and
// its value. It rides into the envelope with the note.
function Stamp({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const W = 44;
  const H = 52;
  // Perforation holes every 6px around the edge, cut out with a mask.
  const holes: [number, number][] = [];
  for (let x = 3; x <= W - 3; x += 5.5) holes.push([x, 0], [x, H]);
  for (let y = 3; y <= H - 3; y += 5.5) holes.push([0, y], [W, y]);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={cn("drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.18)]", className)}
    >
      <mask id={`${id}-perf`}>
        <rect width={W} height={H} fill="white" />
        {holes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.9" fill="black" />
        ))}
      </mask>
      <g mask={`url(#${id}-perf)`}>
        <rect width={W} height={H} className="fill-background" />
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          className="fill-foreground/[0.04]"
        />
        {/* Printed area: sky, sun and two hills in postage ink. */}
        <rect x="5" y="5" width={W - 10} height={H - 10} rx="1" style={{ fill: AIR_BLUE }} opacity="0.9" />
        <circle cx="29" cy="17" r="4.5" style={{ fill: "light-dark(#f2c14e, #e8b73f)" }} />
        <path d={`M5 36 Q14 25 23 33 T39 29 V${H - 5} H5 Z`} style={{ fill: AIR_RED }} />
        <path d={`M5 41 Q17 33 39 38 V${H - 5} H5 Z`} className="fill-background" opacity="0.35" />
        <text
          x="8.5"
          y="15"
          fontSize="8"
          fontWeight="600"
          className="fill-background font-sans"
        >
          2c
        </text>
      </g>
    </svg>
  );
}

// Postmark stamped on the sent screen: a double ring with the day's date,
// and the wavy cancellation lines that run off to its right.
function Postmark({ date }: { date: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 150 76"
      className="h-[76px] w-[150px] -rotate-6 text-foreground"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="38" cy="38" r="35" strokeWidth="1.75" opacity="0.8" />
      <circle cx="38" cy="38" r="28" strokeWidth="1" opacity="0.5" />
      <text
        x="38"
        y="35"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        letterSpacing="1.5"
        className="fill-current font-sans"
        stroke="none"
      >
        SENT
      </text>
      <text
        x="38"
        y="50"
        textAnchor="middle"
        fontSize="12"
        className="fill-current font-sans tabular-nums"
        stroke="none"
        opacity="0.7"
      >
        {date}
      </text>
      {[22, 32, 42, 52].map((y) => (
        <path
          key={y}
          d={`M78 ${y} q8 -5 16 0 t16 0 t16 0 t16 0`}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.55"
        />
      ))}
    </svg>
  );
}

export default function EnvelopeSendDemo() {
  return <EnvelopeSend />;
}
