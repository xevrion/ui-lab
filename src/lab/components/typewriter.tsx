"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { usePreviewPlay } from "@/lab/preview-play";

// Per-character typing delay: a base plus up to this much jitter, which lands
// around 8 to 14 keys a second, the pace of someone who knows the word.
const TYPE_BASE = 62;
const TYPE_JITTER = 64;
// Long enough to read the finished sentence once.
const HOLD = 1800;
// How long the word sits selected before the first key replaces it: the
// beat where a person decides on the new word. Includes the 220ms sweep.
const SELECTED_FOR = 620;
// Reduced motion swaps whole words on this interval instead of typing.
const SWAP_EVERY = 2800;

// A macOS-length blink with short fades, rather than a hard on/off flash.
// The caret goes solid while keys move and disappears while a selection is
// up, as it does in a real text field.
// The selection sweeps in from the word's end (shift + option + left) in
// 220ms, but vanishes the instant a key replaces it: an editor never fades
// a selection out.
// Each new letter lands with a 140ms ink-in (opacity and a 2px blur) so a
// keystroke reads as struck rather than popped in.
const CSS = `
@keyframes typewriter-caret {
  0%, 45% { opacity: 1; }
  55%, 95% { opacity: 0; }
  100% { opacity: 1; }
}
.typewriter-caret { animation: typewriter-caret 1.06s linear infinite; }
[data-typing="true"] .typewriter-caret { animation: none; }
[data-selecting="true"] .typewriter-caret { visibility: hidden; }
.typewriter-selection {
  scale: 0 1;
  transform-origin: right;
  transition: scale 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
[data-selecting="false"] .typewriter-selection { transition: none; }
[data-selecting="true"] .typewriter-selection { scale: 1 1; }
@keyframes typewriter-ink {
  from { opacity: 0; filter: blur(2px); }
}
.typewriter-letter { animation: typewriter-ink 140ms cubic-bezier(0.23, 1, 0.32, 1); }
@media (prefers-reduced-motion: reduce) {
  .typewriter-selection { transition: none; }
  .typewriter-letter { animation: none; }
}
`;

// Deterministic, and smooth from key to key: a slow wave carries a rhythm
// through the word and a small hash roughens it, so delays vary the way a
// hand does instead of jumping between extremes.
function jitter(word: number, char: number) {
  const wave = Math.sin(char * 1.9 + word * 2.7) * 0.5 + 0.5;
  const n = Math.sin(char * 12.9898 + word * 78.233) * 43758.5453;
  return wave * 0.7 + (n - Math.floor(n)) * 0.3;
}

export function Typewriter({
  prefix,
  words,
  className,
}: {
  prefix: string;
  words: string[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const rootRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [swapIndex, setSwapIndex] = useState(0);

  // Typing writes straight to the DOM, so a keystroke never re-renders React.
  useEffect(() => {
    if (reduceMotion || play === false) return;
    const root = rootRef.current;
    const text = textRef.current;
    if (!root || !text || words.length === 0) return;

    let word = 0;
    let length = words[0].length;
    let timer: ReturnType<typeof setTimeout>;

    const strike = (char: string) => {
      const letter = document.createElement("span");
      letter.className = "typewriter-letter";
      letter.textContent = char;
      text.append(letter);
    };

    const type = () => {
      const target = words[word];
      if (length < target.length) {
        strike(target[length]);
        length++;
      }
      const finished = length === target.length;
      // Solid while keys are moving, blinking while it waits.
      root.dataset.typing = String(!finished);
      timer = finished
        ? setTimeout(select, HOLD)
        : setTimeout(type, TYPE_BASE + jitter(word, length) * TYPE_JITTER);
    };

    // Rewrites the way people do: select the word, then type over it. The
    // first key replaces the whole selection at once.
    const select = () => {
      if (words.length < 2) return;
      root.dataset.selecting = "true";
      timer = setTimeout(() => {
        word = (word + 1) % words.length;
        length = 0;
        text.textContent = "";
        root.dataset.selecting = "false";
        type();
      }, SELECTED_FOR);
    };

    // Starts on the finished first word, which is also what the server
    // rendered, so nothing flashes empty before hydration.
    root.dataset.typing = "false";
    timer = setTimeout(select, HOLD);
    return () => {
      clearTimeout(timer);
      // Leaves the DOM as React rendered it, so a words change or remount
      // starts clean instead of from a half typed, selected word.
      text.textContent = words[0] ?? "";
      root.dataset.typing = "false";
      root.dataset.selecting = "false";
    };
  }, [reduceMotion, words, play]);

  useEffect(() => {
    if (!reduceMotion || words.length < 2 || play === false) return;
    const id = setInterval(
      () => setSwapIndex((i) => (i + 1) % words.length),
      SWAP_EVERY,
    );
    return () => clearInterval(id);
  }, [reduceMotion, words.length, play]);

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
  const sentence = `${prefix} ${new Intl.ListFormat("en", {
    type: "disjunction",
  }).format(words)}.`;

  return (
    <span className={cn("inline-grid whitespace-pre", className)}>
      <style href="typewriter" precedence="default">
        {CSS}
      </style>
      <span className="sr-only">{sentence}</span>
      {/* Reserves the widest state, so the line is laid out once and the
          prefix never moves as the word grows to the right. */}
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {prefix} {longest}
        <Caret />
      </span>
      <span
        ref={rootRef}
        aria-hidden
        data-typing="false"
        data-selecting="false"
        className="col-start-1 row-start-1 text-left"
      >
        {prefix}{" "}
        {reduceMotion ? (
          <span className="inline-grid">
            {words.map((w, i) => (
              <span
                key={w}
                // Slower than UI feedback on purpose: nothing was clicked,
                // so a gentle crossfade reads as ambient, not as a response.
                className={cn(
                  "col-start-1 row-start-1 transition-[opacity] duration-500 ease-in-out",
                  i !== swapIndex && "opacity-0",
                )}
              >
                {w}
              </span>
            ))}
          </span>
        ) : (
          <>
            <span className="relative inline-block">
              {/* A text selection highlight: the ink stays, a tinted block
                  sits behind it. Slightly taller than the glyphs, like the
                  line box a browser paints. */}
              <span className="typewriter-selection absolute -inset-x-px -inset-y-[0.06em] rounded-[3px] bg-foreground/15 dark:bg-foreground/25" />
              <span ref={textRef} className="relative">
                {words[0]}
              </span>
            </span>
            <Caret />
          </>
        )}
      </span>
    </span>
  );
}

function Caret() {
  return (
    <span className="typewriter-caret ml-0.5 inline-block h-[1.1em] w-[2px] rounded-full bg-foreground align-[-0.18em]" />
  );
}

const WORDS = ["right", "fast", "alive", "effortless"];

export default function TypewriterDemo() {
  return (
    <p className="text-xl font-medium tracking-tight text-foreground">
      <Typewriter prefix="Build interfaces that feel" words={WORDS} />
    </p>
  );
}
