"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type UndoItem = { id: string; name: string; meta: string };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Survivors slide over 250ms while the leaver is gone in 150ms, so the gap
// never stands empty. Exits are softer and faster than entrances.
const SLIDE = { duration: 0.25, ease: EASE_OUT };
const LEAVE = { duration: 0.15, ease: EASE_OUT };
// A restored row waits 50ms for its neighbours to open the gap first.
const RESTORE = { duration: 0.25, ease: EASE_OUT, delay: 0.05 };
const INSTANT = { duration: 0 };
// r=8 in a 20px box leaves room for the 2px stroke; 2 * PI * 8.
const RING = 50.27;

const CSS = `
.undo-ring {
  stroke-dasharray: ${RING};
  animation-name: undo-countdown;
  /* Linear because it is a clock: every second must look the same. */
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes undo-countdown {
  to { stroke-dashoffset: ${RING}; }
}
/* The ring is the timer itself, so pausing it pauses the delete. Focus
   pauses it too, so keyboard users are never raced. */
.undo-snackbar:focus-within .undo-ring,
[data-hidden] .undo-ring { animation-play-state: paused; }
@media (hover: hover) {
  .undo-snackbar:hover .undo-ring { animation-play-state: paused; }
}
`;

function isEditable(el: EventTarget | null) {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA")
  );
}

function shortcutName() {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "Command Z" : "Control Z";
}

export function UndoToast({
  items,
  // Long enough to notice the mistake and reach for Undo, short enough that
  // the snackbar doesn't linger over the list.
  duration = 5000,
  onDelete,
  className,
}: {
  items: UndoItem[];
  duration?: number;
  onDelete?: (items: UndoItem[]) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  // Deleted but still undoable. A second delete stacks into this batch
  // instead of replacing it: replacing would make the first delete permanent
  // without the user ever seeing its timer run out.
  const [pending, setPending] = useState<string[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  // Bumped on every delete: restarts the ring and crossfades the message.
  const [batch, setBatch] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  // Stored rather than derived, so the snackbar keeps its last words while
  // it fades out instead of flashing "0 items deleted".
  const [message, setMessage] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const deleteRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTarget = useRef<string | null>(null);

  const visible = items.filter(
    (i) => !pending.includes(i.id) && !gone.includes(i.id),
  );
  const pendingItems = items.filter((i) => pending.includes(i.id));

  const focusInside = () =>
    !!rootRef.current?.contains(document.activeElement);

  const remove = (item: UndoItem) => {
    // Hand focus to a neighbour so it isn't dropped on the body when the
    // focused button unmounts.
    if (focusInside()) {
      const index = visible.findIndex((i) => i.id === item.id);
      const next = visible[index + 1] ?? visible[index - 1];
      focusTarget.current = next ? next.id : "undo";
    }
    setPending((p) => [...p, item.id]);
    setBatch((b) => b + 1);
    setMessage(
      pending.length === 0
        ? `Deleted \u2018${item.name}\u2019`
        : `${pending.length + 1} items deleted`,
    );
    setAnnouncement(
      `Deleted ${item.name}. Press Undo or ${shortcutName()} to restore.`,
    );
  };

  const undo = () => {
    if (pending.length === 0) return;
    if (focusInside()) focusTarget.current = pending[0];
    setPending([]);
    setAnnouncement(
      pending.length === 1 ? "Restored" : `Restored ${pending.length} items`,
    );
  };

  const commit = () => {
    if (pending.length === 0) return;
    if (focusInside()) focusTarget.current = visible[0]?.id ?? null;
    setGone((g) => [...g, ...pending]);
    setPending([]);
    onDelete?.(pendingItems);
  };

  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    (target === "undo"
      ? undoRef.current
      : deleteRefs.current.get(target)
    )?.focus();
  }, [pending, gone]);

  // Ctrl/Cmd+Z undoes while the snackbar shows, unless a text field wants
  // the shortcut for its own undo. Same animation as clicking Undo: this is
  // an occasional action, not a constant one.
  useEffect(() => {
    if (pending.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey || isEditable(e.target)) return;
      // Inert copies, like the index preview, stay quiet.
      if (rootRef.current?.closest("[inert]")) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A hidden tab pauses the countdown, so nobody comes back to an undo that
  // expired unseen. Set on the DOM directly to skip a re-render.
  useEffect(() => {
    const sync = () =>
      rootRef.current?.toggleAttribute("data-hidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const empty = visible.length === 0 && pending.length === 0;

  return (
    <div
      ref={rootRef}
      className={cn("flex w-[min(440px,100%)] flex-col gap-3", className)}
    >
      <style href="undo-toast" precedence="default">
        {CSS}
      </style>

      {/* Fixed height, so deleting and restoring never resize the demo.
          24px radius around 8px padding leaves 16px for the rows. */}
      <div className="relative h-60 rounded-[24px] bg-surface p-2 shadow-raised">
        <ul aria-label="Files" className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((item) => (
              <motion.li
                key={item.id}
                // Rows only change place, never size, so "position" keeps the
                // text from stretching as they slide.
                layout="position"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.98, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={
                  reduceMotion
                    ? { opacity: 0, transition: LEAVE }
                    : { opacity: 0, scale: 0.98, transition: LEAVE }
                }
                transition={{
                  ...RESTORE,
                  layout: reduceMotion ? INSTANT : SLIDE,
                }}
                className="flex h-14 items-center gap-3 rounded-2xl pr-2.5 pl-3.5 transition-[background-color] duration-150 ease-out hover:bg-background"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] leading-5 font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="truncate text-[13px] leading-5 text-muted">
                    {item.meta}
                  </span>
                </div>
                <button
                  ref={(el) => {
                    if (el) deleteRefs.current.set(item.id, el);
                    else deleteRefs.current.delete(item.id);
                  }}
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => remove(item)}
                  className="flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]"
                >
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
                    <path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4 4.25l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1M6.75 7v3.75M9.25 7v3.75" />
                  </svg>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <AnimatePresence initial={false}>
          {empty && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: INSTANT }}
              transition={RESTORE}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
            >
              <span className="text-[15px] text-muted">No files left</span>
              <button
                type="button"
                onClick={() => setGone([])}
                className="h-9 touch-manipulation rounded-full bg-background px-4 text-sm font-medium text-foreground shadow-raised outline-hidden transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
              >
                Restore demo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reserved slot, so the snackbar appearing never moves the list. */}
      <div className="relative h-12">
        <AnimatePresence initial={false}>
          {pending.length > 0 && (
            <motion.div
              key="snackbar"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.25, ease: EASE_OUT },
              }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: LEAVE }
                  : { opacity: 0, y: 6, transition: LEAVE }
              }
              className="undo-snackbar absolute inset-0 flex items-center gap-3 rounded-full bg-foreground pr-1.5 pl-3.5 text-background shadow-raised"
            >
              <svg
                viewBox="0 0 20 20"
                className="size-5 shrink-0 -rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <circle cx="10" cy="10" r="8" className="opacity-20" />
                <circle
                  // A fresh element restarts the CSS animation from full.
                  key={batch}
                  cx="10"
                  cy="10"
                  r="8"
                  strokeLinecap="round"
                  className="undo-ring"
                  style={{ animationDuration: `${duration}ms` }}
                  onAnimationEnd={(e) => {
                    if (e.animationName === "undo-countdown") commit();
                  }}
                />
              </svg>

              {/* Old and new messages share this cell and crossfade, so a
                  second delete reads as an update, not a new toast. */}
              <span className="relative flex min-w-0 flex-1 items-center">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={batch}
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 4, filter: "blur(4px)" }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                      transition: { duration: 0.2, ease: EASE_OUT },
                    }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    className="truncate text-[15px] font-medium"
                  >
                    {message}
                  </motion.span>
                </AnimatePresence>
              </span>

              {/* 36px inside a 48px pill with 6px padding: both fully round,
                  so the radii stay concentric. */}
              <button
                ref={undoRef}
                type="button"
                onClick={undo}
                aria-keyshortcuts="Control+Z Meta+Z"
                className="h-9 shrink-0 touch-manipulation rounded-full px-3.5 text-[15px] font-semibold outline-hidden transition-[scale,background-color] duration-150 ease-out select-none hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-background active:scale-[0.96] motion-reduce:transition-[background-color]"
              >
                Undo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

const FILES: UndoItem[] = [
  { id: "roadmap", name: "Q3 roadmap.pdf", meta: "2.4 MB, edited 2h ago" },
  { id: "invoice", name: "Invoice 0142.pdf", meta: "86 KB, edited yesterday" },
  { id: "offsite", name: "Team offsite.jpg", meta: "4.1 MB, edited Monday" },
  { id: "notes", name: "Interview notes.md", meta: "12 KB, edited Aug 29" },
];

export default function UndoToastDemo() {
  return <UndoToast items={FILES} />;
}
