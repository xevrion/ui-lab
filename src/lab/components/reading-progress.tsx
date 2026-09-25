"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Section = { heading?: string; paragraphs: string[] };

// A common average for silent reading of screen text.
const WORDS_PER_MINUTE = 220;
// Far enough in that it is clear the reader has left the top, and a jump
// back is worth a button.
const SHOW_TOP_AFTER = 0.3;
// Scroll positions land a few pixels short of the true end on some
// trackpads; this still counts as finished.
const END_SLACK = 4;
const SWAP = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

// Runs on the compositor where scroll-driven animations exist, so the bar
// never waits on the main thread. The inline scaleX(0) is the fallback's
// starting point; an animation outranks it where supported.
const BAR_CSS = `
@keyframes reading-progress-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@supports (animation-timeline: scroll()) {
  .reading-progress-bar { animation: reading-progress-fill linear both; animation-timeline: scroll(nearest block); }
}`;

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function label(minutes: number) {
  return minutes === 0 ? "Finished" : `${minutes} min left`;
}

export function ReadingProgress({
  title,
  sections,
  className,
}: {
  title: string;
  sections: Section[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const totalWords = sections.reduce(
    (sum, s) => sum + countWords([s.heading ?? "", ...s.paragraphs].join(" ")),
    0,
  );
  const [minutes, setMinutes] = useState(() => Math.ceil(totalWords / WORDS_PER_MINUTE));
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const native = CSS.supports("animation-timeline: scroll()");
    let frame = 0;
    // Batched to one read per frame. React only hears about it when the
    // rounded minutes or the button's visibility actually change.
    const update = () => {
      frame = 0;
      const range = el.scrollHeight - el.clientHeight;
      const progress = range > 0 ? el.scrollTop / range : 1;
      if (!native && bar.current) bar.current.style.transform = `scaleX(${progress})`;
      const done = el.scrollTop >= range - END_SLACK;
      setMinutes(done ? 0 : Math.max(1, Math.ceil((totalWords * (1 - progress)) / WORDS_PER_MINUTE)));
      setShowTop(progress > SHOW_TOP_AFTER);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [totalWords]);

  const backToTop = () => {
    scroller.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    // The button is about to hide, so hand focus to the start of the article
    // instead of letting it fall back to the page.
    heading.current?.focus({ preventScroll: true });
  };

  const text = label(minutes);

  return (
    <div
      className={cn(
        "relative h-[360px] w-[480px] max-w-full overflow-hidden rounded-2xl bg-surface shadow-raised",
        className,
      )}
    >
      <style>{BAR_CSS}</style>
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="Reading article"
        className="h-full overflow-y-auto overscroll-contain outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      >
        {/* Sticky inside the scroller, so scroll() finds this container as
            its nearest scroll ancestor. */}
        <div className="sticky top-0 z-10 bg-surface">
          <div
            ref={bar}
            aria-hidden
            style={{ transform: "scaleX(0)" }}
            className="reading-progress-bar h-0.5 origin-left bg-foreground"
          />
          <div className="flex h-11 items-center justify-between gap-4 border-b border-border px-6 text-[13px] text-muted">
            <span className="truncate">Design notes</span>
            <span className="relative flex justify-end tabular-nums whitespace-nowrap">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={text}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", y: 4 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  exit={
                    reduceMotion
                      ? { opacity: 0, transition: { duration: 0.12 } }
                      : { opacity: 0, filter: "blur(4px)", y: -4, transition: { duration: 0.12 } }
                  }
                  transition={SWAP}
                >
                  {text}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        </div>

        <article className="px-6 pt-5 pb-16 text-[15px] leading-relaxed text-pretty text-muted">
          <h2
            ref={heading}
            tabIndex={-1}
            className="rounded-sm text-xl font-semibold text-balance text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            {title}
          </h2>
          {sections.map((section, i) => (
            <section key={i}>
              {section.heading && (
                <h3 className="mt-6 text-base font-medium text-foreground">{section.heading}</h3>
              )}
              {section.paragraphs.map((p) => (
                <p key={p.slice(0, 24)} className="mt-3">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>

      {/* Outside the scroller, so it stays pinned to the corner. Comes in
          over 200ms and leaves in 150ms; while hidden it is inert, so it can
          never be tabbed to or clicked. */}
      <button
        type="button"
        onClick={backToTop}
        inert={!showTop}
        aria-label="Back to top"
        className={cn(
          "absolute right-4 bottom-4 flex size-10 touch-manipulation items-center justify-center rounded-full bg-background text-foreground shadow-raised outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]",
          "transition-[opacity,translate,scale] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0 motion-reduce:transition-[opacity]",
          showTop ? "translate-y-0 opacity-100 duration-200" : "translate-y-2 opacity-0 duration-150",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 12.5v-9M4 7l4-4 4 4" />
        </svg>
      </button>
    </div>
  );
}

const ARTICLE: Section[] = [
  {
    paragraphs: [
      "Most interface motion goes unnoticed, and that is the goal. When a menu opens from the button you pressed, or a toast leaves the way it came in, nobody stops to admire it. They simply understand what happened and carry on. Good motion answers a question before the user thinks to ask it.",
      "Bad motion is the opposite. It asks for attention it has not earned. A dialog that takes half a second to appear feels slow even when the network is instant, and a list that staggers in on every visit turns a quick glance into a small wait. The cost is paid every single time the thing happens.",
    ],
  },
  {
    heading: "Start from frequency",
    paragraphs: [
      "The first question is how often someone will see an animation. Something used a hundred times a day, like a command palette, should appear at once. Something seen a few times a day, like a drawer or a modal, can take around two hundred milliseconds. Something rare, like finishing onboarding, has room for a little delight.",
      "Easing matters as much as duration. An ease-out curve moves quickly at the start, so the interface responds the moment you act, then settles gently. An ease-in curve does the reverse and feels sluggish, because the slow part lands exactly when you are watching most closely.",
    ],
  },
  {
    heading: "Motion as explanation",
    paragraphs: [
      "The best animations explain structure. A panel that slides in from the right tells you it can be dismissed by sliding it back. A highlight that glides between tabs tells you the tabs belong together. Change the element without motion and you lose that small lesson about how the interface is built.",
      "Finally, motion should always be interruptible. People change their minds mid-gesture, click twice, or press Escape halfway through an opening. Transitions and springs can reverse from wherever they are; fixed keyframes restart from zero and feel broken. Build for the interruption and the rest tends to follow.",
    ],
  },
];

export default function ReadingProgressDemo() {
  return <ReadingProgress title="Motion people never notice" sections={ARTICLE} />;
}
