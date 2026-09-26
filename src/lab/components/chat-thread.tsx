"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type ChatMessage = { id: number; from: "me" | "them"; text: string };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ENTER = { duration: 0.25, ease: EASE_OUT };
const LEAVE = { duration: 0.15, ease: EASE_OUT };
const INSTANT = { duration: 0 };
// Within this distance of the end still counts as "reading the latest", so
// a few pixels of drift never stops the thread from following along.
const NEAR_BOTTOM = 64;
// A beat before the dots show, as if the reply is being read first, then
// long enough typing to register without making anyone wait.
const READ_DELAY = 500;
const TYPING_TIME = 1200;
// Bubble corners: open 20px, and 6px where two bubbles from the same sender
// meet, so a run reads as one grouped block.
const OPEN = 20;
const JOINED = 6;

const CSS = `
.chat-dot {
  /* Symmetric ease so each dot rises and falls like a bounce, not a tick. */
  animation: chat-bounce 1.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
.chat-dot:nth-child(2) { animation-delay: 150ms; }
.chat-dot:nth-child(3) { animation-delay: 300ms; }
@keyframes chat-bounce {
  0%, 60%, 100% { translate: 0 0; opacity: 0.4; }
  30% { translate: 0 -4px; opacity: 1; }
}
@keyframes chat-fade {
  0%, 60%, 100% { opacity: 0.4; }
  30% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .chat-dot { animation-name: chat-fade; }
}
`;

function radius(from: ChatMessage["from"], prevSame: boolean, nextSame: boolean) {
  const top = prevSame ? JOINED : OPEN;
  const bottom = nextSame ? JOINED : OPEN;
  // Corners go top-left, top-right, bottom-right, bottom-left; only the
  // side the bubbles hang from gets tightened.
  return from === "me"
    ? `${OPEN}px ${top}px ${bottom}px ${OPEN}px`
    : `${top}px ${OPEN}px ${OPEN}px ${bottom}px`;
}

export function ChatThread({
  name,
  initialMessages,
  replies,
  className,
}: {
  name: string;
  initialMessages: ChatMessage[];
  replies: string[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = useState(initialMessages);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [unseen, setUnseen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(initialMessages.length);
  const nextReply = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Decided before each update, while the old scroll position still says
  // whether the user was following the thread.
  const follow = useRef(false);

  const nearBottom = () => {
    const el = scrollerRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
  };

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    const el = scrollerRef.current;
    el?.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages, typing, reduceMotion]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    // Sending is a deliberate act, so your own message always scrolls into
    // view, even from far up the thread.
    follow.current = true;
    setMessages((m) => [...m, { id: nextId.current++, from: "me", text }]);
    setDraft("");
    // Typing again means they're reading again; the dots come back after.
    setTyping(false);
    inputRef.current?.focus();

    // A burst of messages gets one reply, timed from the last of them.
    // Mutated in place so the unmount cleanup always sees the live timers.
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
    timers.current.push(
      setTimeout(() => {
        follow.current = nearBottom();
        setTyping(true);
      }, READ_DELAY),
      setTimeout(() => {
        const reply = replies[nextReply.current++ % replies.length];
        follow.current = nearBottom();
        if (!follow.current) setUnseen(true);
        setTyping(false);
        setMessages((m) => [
          ...m,
          { id: nextId.current++, from: "them", text: reply },
        ]);
        setAnnouncement(`${name}: ${reply}`);
      }, READ_DELAY + TYPING_TIME),
    );
  };

  const toEnd = () => {
    const el = scrollerRef.current;
    el?.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const enter = (from: ChatMessage["from"]) =>
    reduceMotion
      ? { opacity: 0 }
      : from === "me"
        ? // Rises out of the composer it was typed into.
          { opacity: 0, y: 16, scale: 0.95 }
        : { opacity: 0, scale: 0.98, filter: "blur(4px)" };

  return (
    // 28px corners around the composer's 8px padding leave 20px, matching
    // the fully rounded 40px input.
    <div
      className={cn(
        "flex h-[440px] w-[min(400px,100%)] flex-col overflow-hidden rounded-[28px] bg-background shadow-raised",
        className,
      )}
    >
      <style href="chat-thread" precedence="default">
        {CSS}
      </style>

      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-foreground/10 text-sm font-medium text-foreground"
        >
          {name[0]}
        </span>
        <div className="flex flex-col">
          <span className="text-[15px] leading-5 font-medium text-foreground">
            {name}
          </span>
          <span className="text-[13px] leading-4 text-muted">Online</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <motion.div
          ref={scrollerRef}
          layoutScroll
          onScroll={() => {
            if (nearBottom()) setUnseen(false);
          }}
          className="h-full overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-width:thin]"
        >
          <ul aria-label={`Conversation with ${name}`} className="relative flex flex-col">
            <AnimatePresence mode="popLayout" initial={false}>
              {messages.map((m, i) => {
                const prevSame = messages[i - 1]?.from === m.from;
                const nextSame = messages[i + 1]?.from === m.from;
                return (
                  <motion.li
                    key={m.id}
                    // Rows only ever change place, never size, so
                    // "position" keeps the text from stretching.
                    layout="position"
                    initial={enter(m.from)}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ ...ENTER, layout: reduceMotion ? INSTANT : ENTER }}
                    style={{
                      transformOrigin:
                        m.from === "me" ? "bottom right" : "bottom left",
                    }}
                    className={cn(
                      "flex",
                      m.from === "me" ? "justify-end" : "justify-start",
                      i > 0 && (prevSame ? "mt-0.5" : "mt-3"),
                    )}
                  >
                    <p
                      style={{ borderRadius: radius(m.from, prevSame, nextSame) }}
                      className={cn(
                        // A message joining a run tightens the corner of the
                        // one above it; easing that keeps the join soft.
                        "max-w-[78%] px-3.5 py-2 text-[15px] leading-5 break-words whitespace-pre-wrap transition-[border-radius] duration-200 ease-out",
                        m.from === "me"
                          ? "bg-foreground text-background"
                          : "bg-surface text-foreground",
                      )}
                    >
                      <span className="sr-only">
                        {m.from === "me" ? "You: " : `${name}: `}
                      </span>
                      {m.text}
                    </p>
                  </motion.li>
                );
              })}
              {typing && (
                <motion.li
                  key="typing"
                  layout="position"
                  initial={
                    reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  // Fades out under the reply that takes its place, so the
                  // swap reads as the dots turning into words.
                  exit={{ opacity: 0, transition: LEAVE }}
                  transition={{ ...ENTER, layout: reduceMotion ? INSTANT : ENTER }}
                  style={{ transformOrigin: "bottom left" }}
                  className={cn(
                    "flex",
                    messages.length > 0 &&
                      (messages[messages.length - 1].from === "them"
                        ? "mt-0.5"
                        : "mt-3"),
                  )}
                >
                  <span className="sr-only">{name} is typing</span>
                  <span className="flex h-9 items-center gap-1 rounded-[20px] bg-surface px-3.5">
                    <span className="chat-dot size-1.5 rounded-full bg-foreground" />
                    <span className="chat-dot size-1.5 rounded-full bg-foreground" />
                    <span className="chat-dot size-1.5 rounded-full bg-foreground" />
                  </span>
                </motion.li>
              )}
            </AnimatePresence>
          </ul>
        </motion.div>

        {/* A reply that lands while you're reading older messages doesn't
            yank the thread down; it offers a way there instead. */}
        <button
          type="button"
          onClick={toEnd}
          inert={!unseen}
          className={cn(
            "absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 touch-manipulation items-center gap-1.5 rounded-full bg-background pr-3 pl-2.5 text-[13px] font-medium text-foreground shadow-raised outline-hidden select-none",
            "transition-[opacity,translate,scale] ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[opacity]",
            unseen
              ? "translate-y-0 opacity-100 duration-200"
              : "translate-y-1 opacity-0 duration-150 motion-reduce:translate-y-0",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M8 3v10M3.75 8.75 8 13l4.25-4.25" />
          </svg>
          New message
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex shrink-0 items-end gap-2 border-t border-border p-2"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          aria-label={`Message ${name}`}
          placeholder="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter keeps the newline, and a key that
            // confirms an IME composition is left alone.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          // Grows with its content up to five lines, then scrolls.
          className="max-h-[120px] min-h-10 flex-1 resize-none rounded-[20px] bg-surface px-4 py-2.5 text-[15px] leading-5 text-foreground outline-hidden [field-sizing:content] placeholder:text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-0 focus-visible:outline-foreground max-sm:text-[16px]"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim()}
          className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-foreground text-background outline-hidden transition-[scale,opacity] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] disabled:opacity-30 disabled:active:scale-100 motion-reduce:transition-[opacity]"
        >
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M8 13V3M3.75 7.25 8 3l4.25 4.25" />
          </svg>
        </button>
      </form>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

const SEED: ChatMessage[] = [
  { id: 0, from: "them", text: "Hey! Did the new build go out?" },
  { id: 1, from: "them", text: "Design wants to see the drawer changes." },
  { id: 2, from: "me", text: "Just shipped it" },
  { id: 3, from: "me", text: "The spring on the sheet feels a lot better now" },
  { id: 4, from: "them", text: "Nice, checking it on my phone" },
];

const REPLIES = [
  "Oh that's so much smoother",
  "Can you send me the link again?",
  "Ha, fair enough",
  "Let's go over it tomorrow morning",
  "Looks great on my end",
];

export default function ChatThreadDemo() {
  return <ChatThread name="Maya" initialMessages={SEED} replies={REPLIES} />;
}
