"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { usePreviewPlay } from "@/lab/preview-play";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// A gentle start that keeps moving to the end, like something taking off.
const LIFT = [0.4, 0, 0.6, 1] as const;

export function BackToTop({
  target,
  showAfter = 0.12,
  jump,
  className,
}: {
  // The element that scrolls; the page itself when left out.
  target?: React.RefObject<HTMLElement | null>;
  // How far through (0 to 1) before the button offers itself.
  showAfter?: number;
  // Changing this number sends the reader to the top, as a click would.
  jump?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  // Set once the arrow has lifted off: it stays gone while the page rises and
  // the button fades, and only returns if the trip is cut short.
  const [launched, setLaunched] = useState(false);
  const ring = useRef<SVGCircleElement | null>(null);
  // Kept outside the ring, which only exists while the button shows, so a
  // freshly shown button starts at the right fill instead of empty.
  const progress = useRef(0);
  // True while heading up: the button stays to show the ring draining, and
  // bows out only once you've arrived.
  const returning = useRef(false);
  const trip_ = useRef<ReturnType<typeof animate> | undefined>(undefined);
  const setRing = (el: SVGCircleElement | null) => {
    ring.current = el;
    el?.style.setProperty("stroke-dashoffset", String(1 - progress.current));
  };

  // The ring follows the scroll directly, a style write per frame at most,
  // so reading never re-renders anything; only crossing the threshold does.
  useEffect(() => {
    const el = target?.current;
    const scroller: HTMLElement | Window = el ?? window;
    let frame = 0;
    const read = () => {
      frame = 0;
      const top = el ? el.scrollTop : window.scrollY;
      const room = el
        ? el.scrollHeight - el.clientHeight
        : document.documentElement.scrollHeight - innerHeight;
      const p = room > 0 ? Math.min(1, Math.max(0, top / room)) : 0;
      progress.current = p;
      ring.current?.style.setProperty("stroke-dashoffset", String(1 - p));
      if (returning.current) {
        if (p > 0) return;
        returning.current = false;
      }
      setVisible(p > showAfter);
      // Hidden again: the next time it shows, it brings its arrow.
      if (p <= showAfter) setLaunched(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [target, showAfter]);

  // Driven here rather than by the browser's smooth scroll, whose speed
  // varies wildly: longer trips take a little longer, never more than 0.9s.
  // Any wheel or touch on the way hands control straight back.
  const go = () => {
    const el = target?.current;
    const read = () => (el ? el.scrollTop : window.scrollY);
    const write = (v: number) => (el ?? window).scrollTo(0, v);
    setLaunched(true);
    trip_.current?.stop();
    const from = read();
    if (reduceMotion) return write(0);
    returning.current = true;
    const scroller: HTMLElement | Window = el ?? window;
    const stop = () => {
      trip_.current?.stop();
      returning.current = false;
      setLaunched(false);
    };
    scroller.addEventListener("wheel", stop, { once: true, passive: true });
    scroller.addEventListener("touchstart", stop, {
      once: true,
      passive: true,
    });
    trip_.current = animate(from, 0, {
      duration: Math.min(0.9, 0.45 + from / 4000),
      ease: [0.65, 0, 0.35, 1],
      onUpdate: write,
      onComplete: () => {
        scroller.removeEventListener("wheel", stop);
        scroller.removeEventListener("touchstart", stop);
      },
    });
  };
  useEffect(() => () => trip_.current?.stop(), []);

  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  const lastJump = useRef(jump);
  useEffect(() => {
    if (jump === lastJump.current) return;
    lastJump.current = jump;
    goRef.current();
  }, [jump]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          aria-label="Back to top"
          onClick={go}
          initial={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{
            opacity: 0,
            scale: 0.85,
            filter: "blur(4px)",
            transition: { duration: 0.15 },
          }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.25, ease: EASE_OUT }
          }
          className={cn(
            "group/top relative grid size-11 place-items-center overflow-hidden rounded-full bg-background text-foreground shadow-raised outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]",
            className,
          )}
        >
          {/* How far you've read, drawn around the edge. */}
          <svg
            viewBox="0 0 44 44"
            className="pointer-events-none absolute inset-0 size-full -rotate-90"
            fill="none"
            aria-hidden
          >
            <circle
              cx="22"
              cy="22"
              r="20.5"
              strokeWidth="1.5"
              className="stroke-border"
            />
            <circle
              ref={setRing}
              cx="22"
              cy="22"
              r="20.5"
              strokeWidth="1.5"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset="1"
              className="stroke-foreground"
            />
          </svg>
          <AnimatePresence initial={false}>
            {!launched && (
              <motion.svg
                key="arrow"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                initial={{ y: 10, opacity: 0, filter: "blur(2px)" }}
                animate={{
                  y: 0,
                  opacity: 1,
                  filter: "blur(0px)",
                  transition: reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.3, ease: EASE_OUT },
                }}
                // Lifts off the way you're about to go: eases away rather
                // than snapping, softening as it leaves.
                exit={{
                  y: -20,
                  opacity: 0,
                  filter: "blur(2px)",
                  transition: reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.4, ease: LIFT },
                }}
                className="absolute size-4 transition-[translate] duration-150 ease-out group-hover/top:-translate-y-0.5"
              >
                <path d="M8 12.5v-9M4 7l4-4 4 4" />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

const ESSAY = [
  "Most tools try to do everything. The ones I keep coming back to do one thing, and they do it the same way every time.",
  "A good pencil doesn't ask what you want to draw. It gets out of the way, and the line comes out where your hand meant it to.",
  "Software rarely works like that. Every release adds a setting, every setting adds a question, and after a while the tool is mostly questions.",
  "The alternative isn't fewer features for their own sake. It's deciding what the thing is for, and letting that answer most of the questions before anyone has to ask them.",
  "When a tool knows what it's for, the details start to line up. The button is where your thumb already is. The default is the choice you would have made.",
  "None of this shows up in a feature list. It shows up as the absence of friction, which is hard to sell and easy to feel.",
  "It also shows up in what doesn't happen. No dialog asking if you're sure, because the action can be undone. No empty state, because the first screen already has something in it.",
  "Restraint like this is slow work. Adding is quick and feels like progress; taking away means knowing the thing well enough to see what it doesn't need.",
  "That's why the simplest tools are so often the oldest. They've had time to lose everything that wasn't carrying weight.",
  "So the next time something feels simple, look closer. Somebody probably spent a long time deciding what to leave out.",
];

export default function BackToTopDemo() {
  const play = usePreviewPlay();
  const scroller = useRef<HTMLDivElement>(null);
  const [jump, setJump] = useState(0);

  // The card's hover show: read about two thirds of the way down, pause,
  // then head back up.
  useEffect(() => {
    const el = scroller.current;
    if (play !== true || !el) return;
    let timer: ReturnType<typeof setTimeout>;
    let scroll: ReturnType<typeof animate> | undefined;
    const loop = () => {
      scroll = animate(
        el.scrollTop,
        (el.scrollHeight - el.clientHeight) * 0.7,
        {
          duration: 2.2,
          ease: [0.45, 0, 0.55, 1],
          onUpdate: (v) => (el.scrollTop = v),
        },
      );
      timer = setTimeout(() => {
        setJump((j) => j + 1);
        timer = setTimeout(loop, 1900);
      }, 3000);
    };
    timer = setTimeout(loop, 300);
    return () => {
      clearTimeout(timer);
      scroll?.stop();
      el.scrollTop = 0;
    };
  }, [play]);

  return (
    <div className="relative h-[440px] w-[min(400px,100%)] overflow-hidden rounded-[20px] bg-background shadow-raised">
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="Back to top article"
        className="h-full overflow-y-auto overscroll-contain px-7 pt-8 pb-20 [scrollbar-width:none] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground [&::-webkit-scrollbar]:hidden"
      >
        <p className="text-[12px] text-muted">Essay · 4 min read</p>
        <h3 className="mt-2 text-[20px] leading-tight font-semibold tracking-tight text-balance text-foreground">
          Notes on doing one thing well
        </h3>
        <div className="mt-5 flex flex-col gap-4 text-[15px] leading-relaxed text-pretty text-foreground/80">
          {ESSAY.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
      {/* Text slips under the button instead of colliding with it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      <div className="absolute right-4 bottom-4">
        <BackToTop target={scroller} jump={jump} />
      </div>
    </div>
  );
}
