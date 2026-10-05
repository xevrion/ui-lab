"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

const subscribeNever = () => () => {};
// null on the server and during hydration, so the modifier label is only
// decided once we can read the platform.
function usePlatformIsMac() {
  return useSyncExternalStore<boolean | null>(
    subscribeNever,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => null,
  );
}

type KeyName = "mod" | "shift" | "alt" | string;

function matchesKey(k: KeyName, e: KeyboardEvent, isMac: boolean) {
  if (k === "mod") return e.key === (isMac ? "Meta" : "Control");
  if (k === "shift") return e.key === "Shift";
  if (k === "alt") return e.key === "Alt";
  // code, not key, so Shift or a non-Latin layout still lights the cap.
  return e.code === `Key${k.toUpperCase()}` || e.key?.toLowerCase() === k.toLowerCase();
}

function isHeld(k: KeyName, e: KeyboardEvent, isMac: boolean) {
  if (k === "mod") return isMac ? e.metaKey : e.ctrlKey;
  if (k === "shift") return e.shiftKey;
  if (k === "alt") return e.altKey;
  return matchesKey(k, e, isMac);
}

function labelFor(k: KeyName, isMac: boolean | null) {
  if (isMac === null && (k === "mod" || k === "shift" || k === "alt")) return "";
  if (k === "mod") return isMac ? "⌘" : "Ctrl";
  if (k === "shift") return isMac ? "⇧" : "Shift";
  if (k === "alt") return isMac ? "⌥" : "Alt";
  return k.toUpperCase();
}

function spokenFor(k: KeyName, isMac: boolean | null) {
  if (k === "mod") return isMac ? "Command" : "Control";
  if (k === "shift") return "Shift";
  if (k === "alt") return isMac ? "Option" : "Alt";
  return k.toUpperCase();
}

const DEFAULT_KEYS: KeyName[] = ["mod", "k"];

export type KeycapHintHandle = {
  /** Presses the chord on screen, as a hint or a demo. Calls onTrigger. */
  play: (opts?: { beat?: number; hold?: number }) => void;
  /** Lets go of every key and clears the confirmation. */
  reset: () => void;
};

export function KeycapHint({
  keys = DEFAULT_KEYS,
  action = "to search",
  confirmation = "Search opened",
  onTrigger,
  className,
  ref,
}: {
  keys?: KeyName[];
  action?: string;
  confirmation?: string;
  onTrigger?: () => void;
  className?: string;
  ref?: Ref<KeycapHintHandle>;
}) {
  const isMac = usePlatformIsMac();
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState<Set<number>>(() => new Set());
  const [confirmed, setConfirmed] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chordTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  });

  const setKey = (i: number, down: boolean) =>
    setPressed((prev) => {
      if (prev.has(i) === down) return prev;
      const next = new Set(prev);
      if (down) next.add(i);
      else next.delete(i);
      return next;
    });

  const confirm = () => {
    setConfirmed(true);
    onTriggerRef.current?.();
    clearTimeout(confirmTimer.current);
    // Long enough to register, short enough to be gone before the next try.
    confirmTimer.current = setTimeout(() => setConfirmed(false), 1400);
  };
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  });

  useEffect(() => {
    if (isMac === null) return;
    const down = (e: KeyboardEvent) => {
      keys.forEach((k, i) => {
        if (matchesKey(k, e, isMac)) setKey(i, true);
      });
      if (!e.repeat && keys.every((k) => isHeld(k, e, isMac))) {
        // Claim the chord so Ctrl+K doesn't jump to the browser's search.
        e.preventDefault();
        confirmRef.current();
      }
    };
    const up = (e: KeyboardEvent) => {
      // macOS never sends keyup for other keys while Command is held, so
      // letting go of Command has to release everything.
      if (isMac && e.key === "Meta") {
        setPressed(new Set());
        return;
      }
      keys.forEach((k, i) => {
        if (matchesKey(k, e, isMac)) setKey(i, false);
      });
    };
    // A keyup that lands in another window never arrives.
    const reset = () => setPressed(new Set());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, [isMac, keys]);

  useEffect(
    () => () => {
      clearTimeout(confirmTimer.current);
      chordTimers.current.forEach(clearTimeout);
    },
    [],
  );

  // A click (or Enter on the button) plays the chord the way hands would:
  // each key goes down a beat after the last, then they all come up.
  const playChord = ({ beat = 70, hold = 90 } = {}) => {
    chordTimers.current.forEach(clearTimeout);
    chordTimers.current = [];
    keys.forEach((_, i) =>
      chordTimers.current.push(setTimeout(() => setKey(i, true), i * beat)),
    );
    chordTimers.current.push(
      setTimeout(() => {
        setPressed(new Set());
        confirm();
      }, keys.length * beat + hold),
    );
  };

  useImperativeHandle(ref, () => ({
    play: playChord,
    reset: () => {
      chordTimers.current.forEach(clearTimeout);
      chordTimers.current = [];
      clearTimeout(confirmTimer.current);
      setPressed(new Set());
      setConfirmed(false);
    },
  }));

  const spoken = keys.map((k) => spokenFor(k, isMac)).join(" ");

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 text-sm text-muted",
        className,
      )}
    >
      <span>Press</span>
      <button
        type="button"
        aria-label={`${spoken}, ${action.replace(/^to /, "")}`}
        // Keyboard activation plays the chord; a mouse click already pressed
        // the cap under the pointer, so it only confirms.
        onClick={(e) => (e.detail === 0 ? playChord() : confirm())}
        className="-mx-1 flex touch-manipulation items-center gap-1 rounded-lg px-1 pt-0.5 pb-1.5 outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground"
      >
        {keys.map((k, i) => (
          <Keycap
            key={k + i}
            label={labelFor(k, isMac)}
            pressed={pressed.has(i)}
            reduceMotion={reduceMotion}
            onPress={(down) => setKey(i, down)}
          />
        ))}
      </button>
      <span className="relative">
        <span
          className={cn(
            "inline-block transition-[opacity,filter,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
            confirmed
              ? "-translate-y-1 opacity-0 blur-[3px] duration-150 motion-reduce:translate-y-0 motion-reduce:filter-none"
              : "translate-y-0 opacity-100 filter-none duration-200",
          )}
        >
          {action}
        </span>
        {/* Swaps in over the action text, out of flow so the row never
            changes width. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 inline-flex items-center gap-1.5 whitespace-nowrap text-foreground transition-[opacity,filter,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
            confirmed
              ? "translate-y-0 opacity-100 filter-none duration-200"
              : "translate-y-1 opacity-0 blur-[3px] duration-150 motion-reduce:translate-y-0 motion-reduce:filter-none",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
          {confirmation}
        </span>
      </span>
      <span className="sr-only" aria-live="polite">
        {confirmed ? confirmation : ""}
      </span>
    </span>
  );
}

function Keycap({
  label,
  pressed,
  reduceMotion,
  onPress,
}: {
  label: string;
  pressed: boolean;
  reduceMotion: boolean | null;
  onPress: (down: boolean) => void;
}) {
  return (
    <span
      onPointerDown={(e) => {
        if (e.button === 0) onPress(true);
      }}
      onPointerUp={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
      className={cn(
        // min-w keeps single letters square while "Ctrl" grows sideways.
        "relative inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-background px-1.5 font-sans text-[13px] leading-none font-medium text-foreground dark:bg-surface",
        // The skirt is a hard 3px shadow in the border color: the cap sits
        // on it at rest and drops onto it when pressed. The soft shadow
        // under it (raw black, it is a cast shadow) collapses with it.
        "shadow-[0_3px_0_0_var(--border),0_4px_8px_-3px_oklch(0_0_0/0.18)]",
        !reduceMotion && "transition-[translate,box-shadow]",
        pressed
          ? "translate-y-[3px] shadow-[0_0_0_0_var(--border),0_1px_2px_-1px_oklch(0_0_0/0.18)] duration-[40ms] ease-out"
          : // Springs back a touch slower than it goes down, like a real
            // switch returning.
            "translate-y-0 duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
        // Holds the label's space until the platform is known.
        label === "" && "invisible",
      )}
    >
      <span className={cn(label === "⌘" && "text-[15px]")}>{label}</span>
    </span>
  );
}

export default function KeycapHintDemo() {
  const play = usePreviewPlay();
  const hint = useRef<KeycapHintHandle>(null);

  // Index card hover: a hand presses the chord at an unhurried pace, then
  // again after the confirmation has come and gone.
  useEffect(() => {
    const h = hint.current;
    if (!play || !h) return;
    const press = () => h.play({ beat: 120, hold: 220 });
    const first = setTimeout(press, 250);
    const loop = setInterval(press, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(loop);
      h.reset();
    };
  }, [play]);

  return (
    <KeycapHint
      ref={hint}
      action="to search"
      // The card is sized to the resting row; the full confirmation would
      // run past its edge.
      confirmation={play === null ? undefined : "Opened"}
    />
  );
}
