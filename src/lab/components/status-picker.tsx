"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { usePreviewPlay } from "@/lab/preview-play";
import { cn } from "@/lib/cn";

export type Status = "online" | "away" | "dnd" | "invisible";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const TURN = { type: "spring", duration: 0.45, bounce: 0.25 } as const;

const STATUSES: { id: Status; label: string; hint?: string }[] = [
  { id: "online", label: "Online" },
  { id: "away", label: "Away" },
  { id: "dnd", label: "Do not disturb", hint: "Mutes notifications" },
  { id: "invisible", label: "Invisible", hint: "Appear offline" },
];

// Each status has its own shape, not just its own colour, so it reads at
// a glance and for colour-blind eyes too. Presence colours are data, so
// raw values.
function Badge({ status, className }: { status: Status; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("size-3", className)} aria-hidden>
      {status === "online" && <circle cx="6" cy="6" r="5" fill="oklch(0.7 0.16 150)" />}
      {status === "away" && (
        <path d="M6.6 1.05A5 5 0 1 0 10.95 5.4 4 4 0 0 1 6.6 1.05Z" fill="oklch(0.78 0.15 75)" />
      )}
      {status === "dnd" && (
        <>
          <circle cx="6" cy="6" r="5" fill="oklch(0.62 0.2 25)" />
          <rect x="3" y="5.1" width="6" height="1.8" rx="0.9" fill="#fff" />
        </>
      )}
      {status === "invisible" && (
        <circle cx="6" cy="6" r="3.9" fill="none" stroke="oklch(0.65 0 0)" strokeWidth="2.2" />
      )}
    </svg>
  );
}

export function StatusPicker({
  name,
  initials,
  status,
  onStatusChange,
  demo,
  className,
}: {
  name: string;
  initials: string;
  status: Status;
  onStatusChange: (next: Status) => void;
  // Drives the menu from outside (the card preview) without focus.
  demo?: { open: boolean; active: number } | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [openState, setOpen] = useState(false);
  const [activeState, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const usingKeys = useRef(false);

  const open = demo ? demo.open : openState;
  const active = demo ? demo.active : activeState;
  const current = STATUSES.find((s) => s.id === status)!;

  const show = () => {
    const i = STATUSES.findIndex((s) => s.id === status);
    setActive(i);
    setOpen(true);
    if (usingKeys.current) requestAnimationFrame(() => items.current[i]?.focus());
  };
  const hide = () => {
    setOpen(false);
    if (usingKeys.current) trigger.current?.focus();
  };
  const choose = (next: Status) => {
    onStatusChange(next);
    hide();
  };

  // Closes on a press anywhere else.
  useEffect(() => {
    if (!openState) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openState]);

  const turn = reduceMotion ? { duration: 0 } : TURN;
  const fade = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT };

  return (
    <div
      ref={root}
      className={cn("relative", className)}
      onPointerDownCapture={() => (usingKeys.current = false)}
      onKeyDownCapture={() => (usingKeys.current = true)}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={`${name}, ${current.label}. Change status`}
        onClick={() => (open ? hide() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            show();
          }
        }}
        className={cn(
          "flex items-center gap-3 rounded-2xl py-2 pr-4 pl-2 text-left outline-hidden transition-[background-color,scale] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.98]",
          open && "bg-surface",
        )}
      >
        <span className="relative shrink-0">
          <span className="grid size-10 place-items-center rounded-full bg-foreground text-[13px] font-semibold text-background">
            {initials}
          </span>
          {/* The badge sits in a cut-out ring; its shape turns into the
              next status, the old one spinning out as the new spins in. */}
          <span className="absolute -right-0.5 -bottom-0.5 grid size-[18px] place-items-center overflow-hidden rounded-full bg-background">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={status}
                className="grid place-items-center"
                initial={{ scale: 0.3, rotate: 120, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.3, rotate: -120, opacity: 0, transition: { duration: 0.15 } }}
                transition={turn}
              >
                <Badge status={status} />
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-foreground">{name}</span>
          <span className="relative block h-[18px] text-[13px] text-muted">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={status}
                className="block whitespace-nowrap"
                initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -4, filter: "blur(3px)", transition: { duration: 0.12 } }}
                transition={fade}
              >
                {current.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-menu`}
            role="menu"
            aria-label="Set status"
            initial={{ opacity: 0, scale: 0.96, y: -4, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.12 } }}
            transition={fade}
            onKeyDown={(e) => {
              const n = STATUSES.length;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const next = (active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
                setActive(next);
                items.current[next]?.focus();
              } else if (e.key === "Escape" || e.key === "Tab") {
                e.preventDefault();
                hide();
              }
            }}
            // Grows out of the avatar it belongs to.
            style={{ transformOrigin: "24px 0px" }}
            className="absolute top-full left-0 z-10 mt-2 w-60 rounded-2xl bg-background p-1.5 shadow-raised"
          >
            {STATUSES.map((s, i) => (
              <button
                key={s.id}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={s.id === status}
                tabIndex={i === active ? 0 : -1}
                onClick={() => choose(s.id)}
                onPointerMove={() => !demo && i !== active && setActive(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-hidden transition-[background-color] duration-100",
                  i === active && "bg-surface",
                )}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  <Badge status={s.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-foreground">{s.label}</span>
                  {s.hint && <span className="block text-[12px] text-muted">{s.hint}</span>}
                </span>
                {s.id === status && (
                  <svg
                    viewBox="0 0 16 16"
                    className="size-4 shrink-0 text-foreground"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3.5 8.25l3 3 6-6.5" />
                  </svg>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StatusPickerDemo() {
  const play = usePreviewPlay();
  const [status, setStatus] = useState<Status>("online");
  const [demo, setDemo] = useState<{ open: boolean; active: number } | null>(null);

  // The card's hover show: step away, then go do-not-disturb, then back.
  useEffect(() => {
    if (play !== true) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const pick = (base: number, from: number, to: number, next: Status) => {
      at(base, () => setDemo({ open: true, active: from }));
      for (let i = from + 1, t = base + 450; i <= to; i++, t += 220) {
        const a = i;
        at(t, () => setDemo({ open: true, active: a }));
      }
      at(base + 450 + (to - from) * 220 + 250, () => {
        setStatus(next);
        setDemo({ open: false, active: to });
      });
    };
    const run = () => {
      pick(300, 0, 1, "away");
      pick(2100, 1, 2, "dnd");
      at(3900, () => setDemo({ open: true, active: 2 }));
      at(4350, () => setDemo({ open: true, active: 1 }));
      at(4570, () => setDemo({ open: true, active: 0 }));
      at(4900, () => {
        setStatus("online");
        setDemo({ open: false, active: 0 });
      });
      at(6200, run);
    };
    run();
    return () => {
      timers.forEach(clearTimeout);
      setDemo(null);
      setStatus("online");
    };
  }, [play]);

  return (
    <div className="flex h-72 w-[min(260px,100%)] items-start justify-center pt-4">
      <StatusPicker
        name="Maya Ruiz"
        initials="MR"
        status={status}
        onStatusChange={setStatus}
        demo={play === true ? demo ?? { open: false, active: 0 } : null}
      />
    </div>
  );
}
