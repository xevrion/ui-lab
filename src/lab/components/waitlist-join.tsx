"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import Image from "next/image";
import { cn } from "@/lib/cn";

export type QueuePerson = { id: string; name: string; avatar?: string };

// Nine faces fill the strip on a desktop. On a phone the front few slide
// under the left fade, which reads as the line carrying on.
const SLOTS = 9;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// People shuffling along a line: slower than a UI transition so the eye can
// follow who moved where, with a little settle as each one stops.
const SHUFFLE = { type: "spring", visualDuration: 0.45, bounce: 0.15 } as const;
// Your face drops into its slot and lands with a small bounce.
const DROP = { type: "spring", visualDuration: 0.4, bounce: 0.3 } as const;
// Long enough to show a real request is in flight, short enough not to wait on.
const JOIN_MS = 650;


function problem(raw: string) {
  const email = raw.trim();
  if (!email) return "Enter your email to join.";
  if (/\s/.test(email)) return "Emails cannot contain spaces.";
  const at = email.lastIndexOf("@");
  if (at === -1) return "Add an @ and a domain, like sam@studio.com.";
  if (at === 0) return "Add your name before the @.";
  const domain = email.slice(at + 1);
  if (!domain) return "Add the domain after the @, like gmail.com.";
  if (!/\.[^.]{2,}$/.test(domain)) {
    return `Finish the domain, like @${domain.replace(/\.+$/, "")}.com.`;
  }
  return "";
}

// A short, stable referral link from the address, no server needed.
function referral(email: string, base: string) {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  let hash = 0;
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `${base}/${local.slice(0, 12) || "friend"}-${hash.toString(36).slice(0, 3)}`;
}

const format = (n: number) => n.toLocaleString("en-US");

// A slot machine for the position: each digit column starts on 0 and rolls
// to its value, left to right, the first time it shows. Later changes roll
// from wherever it was.
function Roll({ value }: { value: number }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const text = format(value);
  let digit = 0;
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {[...text].map((char, i) => {
        const place = text.length - i;
        if (!/\d/.test(char)) return <span key={`s${place}`}>{char}</span>;
        const order = digit++;
        return (
          <span
            key={`d${place}`}
            // Fades the neighbours peeking in above and below mid-roll; at
            // rest the digit sits inside the clear middle.
            className="relative inline-block h-[1lh] overflow-hidden [mask-image:linear-gradient(transparent,black_20%,black_80%,transparent)]"
          >
            <span
              // The reveal happens once, so it can take its time: 700ms plus
              // an 80ms stagger reads as the number being drawn for you.
              className="flex flex-col transition-[translate] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{
                translate: `0 ${armed ? -Number(char) * 10 : 0}%`,
                transitionDelay: `${order * 80}ms`,
              }}
            >
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className="h-[1lh]">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Face({ person }: { person: QueuePerson }) {
  return (
    <span
      title={person.name}
      className={cn(
        // Every face sits on the same light circle in both themes, like a
        // printed photo, with the faint image outline for an edge.
        "flex size-9 items-end justify-center overflow-hidden rounded-full bg-[oklch(0.97_0_0)] shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]",
      )}
    >
      {person.avatar ? (
        <Image
          src={person.avatar}
          alt=""
          width={36}
          height={36}
          unoptimized
          draggable={false}
          className="size-full"
        />
      ) : (
        // No photo: a plain head and shoulders in the same light circle, so
        // the strip reads as one set of people rather than faces and
        // letters. Grey on the fixed light circle, so fixed greys.
        <svg viewBox="0 0 36 36" aria-hidden className="size-full">
          <circle cx="18" cy="14.5" r="6.5" fill="oklch(0.84 0 0)" />
          <path d="M5 36c1.5-8 6.5-12 13-12s11.5 4 13 12Z" fill="oklch(0.84 0 0)" />
        </svg>
      )}
    </span>
  );
}

const fade = {
  initial: { opacity: 0, y: 4, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -2, filter: "blur(2px)", transition: { duration: 0.12 } },
  transition: { duration: 0.24, ease: EASE_OUT },
} as const;

export function WaitlistJoin({
  product = "Parcel",
  waiting,
  queue,
  skip = 5,
  linkBase = "parcel.so/i",
  onJoin,
  className,
}: {
  product?: string;
  // How many people are already in line.
  waiting: number;
  // The last few people in line, front first. Only the tail is shown.
  queue: QueuePerson[];
  // Spots a share moves you up.
  skip?: number;
  linkBase?: string;
  onJoin?: (email: string) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "joining" | "joined">("idle");
  const [bumped, setBumped] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const error = touched ? problem(email) : "";
  const joined = status === "joined";
  // Your face only stays in view if the skip leaves someone in front of you.
  const hop = Math.min(skip, SLOTS - 2);
  const position = waiting + 1 - (bumped ? skip : 0);
  const me: QueuePerson = {
    id: "me",
    name: "You",
  };

  const line = joined
    ? (() => {
        const rest = queue.slice(-(SLOTS - 1));
        rest.splice(rest.length - (bumped ? hop : 0), 0, me);
        return rest;
      })()
    : queue.slice(-SLOTS);

  const join = () => {
    setTouched(true);
    if (problem(email) || status !== "idle") {
      inputRef.current?.focus();
      return;
    }
    setStatus("joining");
    timers.current.push(
      window.setTimeout(() => {
        setStatus("joined");
        onJoin?.(email.trim());
        timers.current.push(
          window.setTimeout(() => copyRef.current?.focus(), 50),
        );
      }, JOIN_MS),
    );
  };

  const link = referral(email.trim(), linkBase);

  const copy = () => {
    navigator.clipboard?.writeText(`https://${link}`).catch(() => {});
    setCopied(true);
    setBumped(true);
    timers.current.push(window.setTimeout(() => setCopied(false), 1800));
  };

  const reset = () => {
    setStatus("idle");
    setBumped(false);
    setCopied(false);
    setTouched(false);
    setEmail("");
    timers.current.push(
      window.setTimeout(() => inputRef.current?.focus(), 50),
    );
  };

  const initial = email.trim()[0]?.toUpperCase() ?? "Y";
  const motionFade = reduceMotion
    ? { ...fade, initial: { opacity: 0 }, exit: { opacity: 0 } }
    : fade;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "w-[min(440px,100%)] rounded-[20px] bg-background p-6 shadow-raised",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between">
        <p className="text-[13px] text-muted">{product} · Private beta</p>
        <AnimatePresence initial={false}>
          {joined && (
            <motion.button
              {...motionFade}
              type="button"
              onClick={reset}
              className="-mr-2 h-8 rounded-lg px-2 text-[13px] text-muted outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
            >
              Not you?
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <h2
        id={`${id}-title`}
        className="relative mt-2 h-8 text-2xl font-semibold text-foreground"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {joined ? (
            <motion.span key="spot" {...motionFade} className="absolute inset-0">
              You&rsquo;re #<Roll value={position} />
              <span className="sr-only">{format(position)} in line</span>
            </motion.span>
          ) : (
            <motion.span key="ask" {...motionFade} className="absolute inset-0">
              Join the waitlist
            </motion.span>
          )}
        </AnimatePresence>
      </h2>
      <p className="mt-2 min-h-10 text-sm text-pretty text-muted">
        {joined
          ? "The next 200 people get in on Friday. You will hear from us the moment you do."
          : `${product} lets in 200 new people every Friday. Save your spot in line.`}
      </p>

      {/* The line: front on the left, fading out because it keeps going. */}
      <div className="mt-5 rounded-[16px] bg-surface p-3.5">
        <ol
          aria-label={
            joined
              ? `Queue, you are number ${format(position)}`
              : `Queue, ${format(waiting)} people waiting`
          }
          // Padded and pulled back by 8px so the "You" badge is not clipped.
          className="-my-2 flex justify-end gap-2 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_56px)]"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {line.map((person) => {
              const isMe = person.id === "me";
              return (
                <motion.li
                  key={person.id}
                  layout="position"
                  aria-label={isMe ? "You" : person.name}
                  className={cn(
                    "relative flex w-9 shrink-0 justify-center",
                    isMe && "z-10",
                  )}
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -20, filter: "blur(4px)" }
                  }
                  animate={{
                    opacity: 1,
                    // Cutting the line: a small hop over the people you pass.
                    y: isMe && bumped && !reduceMotion ? [0, -10, 0] : 0,
                    filter: "blur(0px)",
                  }}
                  exit={{
                    opacity: 0,
                    x: reduceMotion ? 0 : -12,
                    filter: "blur(2px)",
                    transition: { duration: 0.2, ease: EASE_OUT },
                  }}
                  transition={{
                    ...DROP,
                    layout: SHUFFLE,
                    y: isMe && bumped ? { duration: 0.45, ease: [0.77, 0, 0.175, 1] } : DROP,
                  }}
                >
                  {isMe ? (
                    <>
                      <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                        {initial}
                      </span>
                      {/* A name badge pinned to the bottom of your circle,
                          inside the strip's padding so nothing shifts. */}
                      <span
                        aria-hidden
                        className="absolute -bottom-2 rounded-full bg-background px-1.5 text-[12px] leading-4 font-medium text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.15)]"
                      >
                        You
                      </span>
                    </>
                  ) : (
                    <Face person={person} />
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
        <span className="flex items-center gap-1">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
          </svg>
          Front of the line
        </span>
        <span className="relative tabular-nums">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={`${joined}-${position}`} {...motionFade} className="block">
              {joined
                ? `${format(position - 1)} ahead of you`
                : `${format(waiting)} waiting`}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      {/* The form and the share row share one slot, so the page never jumps. */}
      <div className="relative mt-5 h-11">
        <AnimatePresence initial={false} mode="popLayout">
          {joined ? (
            <motion.div
              key="share"
              {...motionFade}
              className="absolute inset-0 flex items-center gap-2 rounded-[12px] bg-surface pr-1 pl-3.5"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
                {link}
              </span>
              <button
                ref={copyRef}
                type="button"
                onClick={copy}
                aria-describedby={`${id}-note`}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-foreground px-3 text-[13px] font-medium text-background outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
              >
                <span className="relative size-3.5">
                  <AnimatePresence initial={false}>
                    <motion.svg
                      key={copied ? "check" : "copy"}
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="absolute inset-0 size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={
                        reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
                      }
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
                      }
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      {copied ? (
                        <path d="m3.5 8.5 3 3 6-7" />
                      ) : (
                        <>
                          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                          <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
                        </>
                      )}
                    </motion.svg>
                  </AnimatePresence>
                </span>
                {copied ? "Copied" : "Copy link"}
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              {...motionFade}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
              className="absolute inset-0 flex gap-2"
            >
              <label htmlFor={`${id}-email`} className="sr-only">
                Email
              </label>
              <input
                ref={inputRef}
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@studio.com"
                value={email}
                disabled={status === "joining"}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-note`}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => {
                  if (email.trim()) setTouched(true);
                }}
                className={cn(
                  "h-11 min-w-0 flex-1 rounded-[12px] bg-surface px-3.5 text-[15px] text-foreground outline-hidden transition-[box-shadow] duration-150 ease-out placeholder:text-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground max-sm:text-[16px]",
                  error && "shadow-[inset_0_0_0_1px_var(--color-danger)]",
                )}
              />
              <button
                type="submit"
                aria-busy={status === "joining" || undefined}
                className="relative flex h-11 w-[84px] shrink-0 items-center justify-center rounded-[12px] bg-foreground text-sm font-medium text-background outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
              >
                <span
                  className={cn(
                    "transition-[opacity,filter] duration-150 ease-out",
                    status === "joining" ? "opacity-0 blur-[2px]" : "opacity-100",
                  )}
                >
                  Join
                </span>
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className={cn(
                    "absolute size-4 animate-spin transition-[opacity] duration-150 ease-out motion-reduce:animate-none",
                    status === "joining" ? "opacity-100" : "opacity-0",
                  )}
                  fill="none"
                >
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
                  <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="sr-only">
                  {status === "joining" ? "Joining" : ""}
                </span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
      <p
        id={`${id}-note`}
        aria-live="polite"
        className={cn(
          // Two lines tall for the longest note on a phone; every note fits
          // one line at the full 440px.
          "relative mt-2 h-10 text-[13px] leading-5 sm:h-5",
          error ? "text-danger" : "text-muted",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={error || (joined ? (bumped ? "bumped" : "share") : "idle")}
            {...motionFade}
            className="absolute inset-0 text-pretty"
          >
            {error ||
              (joined
                ? bumped
                  ? `You jumped ${skip} spots. Every friend who joins moves you up again.`
                  : `Skip ahead by sharing: your link moves you up ${skip} spots.`
                : "One email when your invite is ready. Nothing else.")}
          </motion.span>
        </AnimatePresence>
      </p>
    </section>
  );
}

// Faces are "Notionists" by Zoish, CC0 1.0, stored in public/avatars. The
// people further up the line are plain silhouettes: too far off to make
// out, and never a face mixed in among letters.
const QUEUE: QueuePerson[] = [
  { id: "q0", name: "Priya Nair" },
  { id: "q1", name: "Hugo Laurent" },
  { id: "q2", name: "Noah Fischer" },
  { id: "q3", name: "Lena Park" },
  { id: "q4", name: "Omar Haddad" },
  { id: "q5", name: "Amara Okafor", avatar: "/avatars/ava.svg" },
  { id: "q6", name: "Jonas Weber", avatar: "/avatars/ben.svg" },
  { id: "q7", name: "Mei Tanaka", avatar: "/avatars/cara.svg" },
  { id: "q8", name: "Rafael Costa", avatar: "/avatars/dev.svg" },
  { id: "q9", name: "Sara Lindqvist", avatar: "/avatars/fay.svg" },
];

export default function WaitlistJoinDemo() {
  return <WaitlistJoin waiting={1283} queue={QUEUE} />;
}
