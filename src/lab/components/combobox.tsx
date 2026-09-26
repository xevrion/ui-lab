"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Person = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Every option row is h-12.
const ROW = 48;

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

export function Combobox({
  label,
  people,
  value,
  onChange,
  placeholder = "Search people",
  className,
}: {
  label: string;
  people: Person[];
  value: Person | null;
  onChange: (person: Person | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  // True once the highlight reflects intent (typing, arrows or the mouse),
  // so tabbing past a list opened by a click doesn't pick the first person.
  const engaged = useRef(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Only keyboard moves scroll the list; the mouse is already where it is.
  const scrollToActive = useRef(false);

  const needle = query.trim().toLowerCase();
  const results = needle
    ? people.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.email.toLowerCase().includes(needle),
      )
    : people;
  const highlighted = open ? results[active] : undefined;

  // One highlight for the whole list, gliding from row to row, so arrowing
  // down reads as a single thing moving rather than rows blinking on and off.
  const pillRef = useRef<HTMLLIElement>(null);
  // Set whenever the list is rebuilt (opened or filtered): the highlight
  // lands in place instead of sliding in from wherever it last was.
  const pillJump = useRef(true);
  // Scroll smoothly only for moves within a list that is already showing.
  const scrollJump = useRef(true);
  const slotRef = useRef<HTMLSpanElement>(null);
  // Where the chosen person's avatar was in the list, for the flight into
  // the field.
  const flight = useRef<DOMRect | null>(null);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    if (!scrollToActive.current || !highlighted) return;
    const jump = scrollJump.current;
    scrollJump.current = false;
    scrollToActive.current = false;
    document
      .getElementById(`${id}-${highlighted.id}`)
      ?.scrollIntoView({
        block: "nearest",
        behavior: jump || reduceMotion ? "instant" : "smooth",
      });
  }, [highlighted, id, reduceMotion]);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    const jump = pillJump.current || !!reduceMotion;
    pillJump.current = false;
    pill.style.transition = jump ? "none" : "";
    // Rows are a fixed 48px, so the index is the offset.
    pill.style.transform = `translateY(${active * ROW}px)`;
    if (jump) {
      // Commits the jump before the transition comes back.
      void pill.offsetHeight;
      pill.style.transition = "";
    }
  }, [active, open, query, reduceMotion]);

  // The avatar leaves its row and lands in the field's leading slot, scaling
  // from 32px down to 24px on the way: the pick is carried, not swapped.
  useLayoutEffect(() => {
    const from = flight.current;
    const el = slotRef.current;
    flight.current = null;
    if (!from || !el || !value) return;
    const to = el.getBoundingClientRect();
    const animation = el.animate(
      [
        {
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`,
        },
        { transform: "none" },
      ],
      // 280ms on the iOS drawer curve: long enough to follow a 100px trip,
      // settled before the next keystroke is likely.
      { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
    animation.onfinish = animation.oncancel = () => setFlying(false);
    return () => animation.cancel();
  }, [value]);

  const openList = (text = query) => {
    engaged.current = text.length > 0;
    // Starts on the chosen person when there is one and nothing typed.
    const start = text || !value ? 0 : Math.max(people.indexOf(value), 0);
    setActive(start);
    scrollToActive.current = true;
    scrollJump.current = true;
    pillJump.current = true;
    setOpen(true);
  };

  const choose = (person: Person) => {
    if (!reduceMotion && person.id !== value?.id) {
      const from = document
        .getElementById(`${id}-${person.id}`)
        ?.querySelector("[data-avatar]")
        ?.getBoundingClientRect();
      if (from) {
        flight.current = from;
        setFlying(true);
      }
    }
    onChange(person);
    setQuery("");
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  };

  const move = (delta: number) => {
    if (!open) return openList();
    if (results.length === 0) return;
    engaged.current = true;
    scrollToActive.current = true;
    setActive((i) => (i + delta + results.length) % results.length);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
      case "End":
        if (!open || results.length === 0) return;
        e.preventDefault();
        scrollToActive.current = true;
        setActive(e.key === "Home" ? 0 : results.length - 1);
        break;
      case "Enter":
        if (!highlighted) return;
        e.preventDefault();
        choose(highlighted);
        break;
      case "Tab":
        // Accepts and lets focus move on as usual.
        if (highlighted && engaged.current) choose(highlighted);
        else setOpen(false);
        break;
      case "Escape":
        e.preventDefault();
        // First press closes, the next one clears.
        if (open) setOpen(false);
        else if (query || value) clear();
        break;
    }
  };

  const text = value && !query ? value.name : query;
  const hasText = text.length > 0;

  return (
    <div className={cn("w-[360px] max-w-full", className)}>
      <label
        htmlFor={`${id}-input`}
        className="mb-2 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <div className="relative flex h-11 items-center rounded-xl bg-background shadow-raised transition-[box-shadow] duration-150 ease-out focus-within:shadow-[0_0_0_1.5px_var(--foreground)]">
          {/* Leading slot swaps the search icon for the chosen avatar. */}
          <span aria-hidden className="pointer-events-none grid size-11 shrink-0 place-items-center">
            <SwapSlot visible={!value} reduceMotion={reduceMotion}>
              <svg {...STROKE} className="size-4 text-muted">
                <circle cx="7.25" cy="7.25" r="4.5" />
                <path d="m10.5 10.5 3 3" />
              </svg>
            </SwapSlot>
            {/* A flying avatar is already visible, so it skips the pop in.
                z-30 carries it over the closing list (z-20) on the way up. */}
            <SwapSlot
              visible={!!value}
              reduceMotion={reduceMotion}
              instant={flying}
            >
              <span ref={slotRef} className="relative z-30 block origin-top-left">
                {value && <Avatar person={value} size="sm" />}
              </span>
            </SwapSlot>
          </span>
          <input
            ref={inputRef}
            id={`${id}-input`}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              highlighted ? `${id}-${highlighted.id}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              const next = e.target.value;
              // Editing the chosen name means searching again.
              if (value) onChange(null);
              setQuery(next);
              openList(next);
            }}
            onClick={() => {
              if (!open) openList();
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setOpen(false)}
            className="h-full min-w-0 flex-1 bg-transparent pr-11 text-[15px] text-foreground outline-hidden placeholder:text-muted max-sm:text-[16px]"
          />
          <button
            type="button"
            aria-label="Clear"
            inert={!hasText}
            // Keeps focus in the input, where typing continues.
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className={cn(
              "absolute right-1 grid size-9 place-items-center rounded-lg text-muted outline-hidden select-none",
              "transition-[scale,color,background-color] duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]",
            )}
          >
            <SwapSlot visible={hasText} reduceMotion={reduceMotion}>
              <svg aria-hidden {...STROKE} className="size-4">
                <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
              </svg>
            </SwapSlot>
          </button>
        </div>

        {/* Always mounted so it can fade out. Grows from its top edge, the
            side touching the input. Enters in 150ms, leaves in 100ms. */}
        <div
          className={cn(
            "absolute inset-x-0 top-full z-20 mt-2 origin-top rounded-xl bg-background p-1 shadow-raised",
            "transition-[opacity,scale,visibility] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity,visibility]",
            open
              ? "visible scale-100 opacity-100 duration-150"
              : "invisible scale-[0.97] opacity-0 duration-100 motion-reduce:scale-100",
          )}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            // Just under five 48px rows, so the clipped fifth shows it scrolls.
            className="relative max-h-[232px] overflow-y-auto overscroll-contain"
          >
            {/* Inside the scroller so it scrolls with the rows. 180ms
                ease-out: quick enough to keep up with held arrow keys. */}
            <li
              ref={pillRef}
              role="presentation"
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-12 rounded-lg bg-foreground/[0.06]",
                "transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)]",
                highlighted ? "opacity-100" : "opacity-0",
              )}
            />
            {results.map((person, i) => {
              const isActive = i === active;
              const isChosen = value?.id === person.id;
              return (
                <li
                  key={person.id}
                  id={`${id}-${person.id}`}
                  role="option"
                  aria-selected={isChosen}
                  // Keeps focus in the input so the list doesn't close
                  // before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(person)}
                  // Move rather than enter: scrolling the list under a
                  // resting cursor shouldn't steal the highlight.
                  onPointerMove={(e) => {
                    if (e.pointerType === "touch" || isActive) return;
                    engaged.current = true;
                    setActive(i);
                  }}
                  className="relative flex h-12 cursor-default items-center gap-3 rounded-lg px-2.5 select-none"
                >
                  <Avatar person={person} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      <Highlight text={person.name} needle={needle} />
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {person.email}
                    </span>
                  </span>
                  <svg
                    aria-hidden
                    {...STROKE}
                    className={cn(
                      "size-4 shrink-0 text-foreground",
                      !isChosen && "invisible",
                    )}
                  >
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                </li>
              );
            })}
          </ul>
          {results.length === 0 && (
            <p className="flex h-12 items-center px-2.5 text-sm text-muted">
              No one matches &ldquo;{query.trim()}&rdquo;
            </p>
          )}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {open
          ? results.length === 0
            ? "No results"
            : `${results.length} result${results.length === 1 ? "" : "s"}`
          : ""}
      </span>
    </div>
  );
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <span className="text-foreground">{text}</span>;
  // Dims the rest rather than bolding the match, so the name never
  // reflows as letters change weight.
  return (
    <span className="text-muted">
      {text.slice(0, at)}
      <mark className="bg-transparent text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </span>
  );
}

function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-6" : "size-8";
  return person.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny local SVGs gain nothing from next/image.
    <img
      data-avatar
      src={person.avatar}
      alt=""
      className={cn(
        box,
        // The line art is black, so it keeps a light plate in both themes.
        "shrink-0 rounded-full bg-[oklch(0.97_0_0)] outline-1 -outline-offset-1 outline-[oklch(0_0_0/0.1)] dark:outline-[oklch(1_0_0/0.1)]",
      )}
    />
  ) : (
    <span
      data-avatar
      aria-hidden
      className={cn(
        box,
        "grid shrink-0 place-items-center rounded-full bg-foreground/[0.08] font-medium text-foreground",
        size === "sm" ? "text-[10px]" : "text-xs",
      )}
    >
      {initials(person.name)}
    </span>
  );
}

function SwapSlot({
  visible,
  reduceMotion,
  instant = false,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean | null;
  instant?: boolean;
  children: React.ReactNode;
}) {
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
  return (
    <motion.span
      className="col-start-1 row-start-1 grid place-items-center"
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={instant ? { duration: 0 } : ICON_SWAP}
    >
      {children}
    </motion.span>
  );
}

const STROKE = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PEOPLE: Person[] = [
  { id: "ava", name: "Ava Moreno", email: "ava@acme.dev", avatar: "/avatars/ava.svg" },
  { id: "ben", name: "Ben Okafor", email: "ben@acme.dev", avatar: "/avatars/ben.svg" },
  { id: "cara", name: "Cara Lindqvist", email: "cara@acme.dev", avatar: "/avatars/cara.svg" },
  { id: "dev", name: "Dev Raman", email: "dev@acme.dev", avatar: "/avatars/dev.svg" },
  { id: "fay", name: "Fay Nakamura", email: "fay@acme.dev", avatar: "/avatars/fay.svg" },
  { id: "hugo", name: "Hugo Brandt", email: "hugo@acme.dev" },
  { id: "isla", name: "Isla Carvalho", email: "isla@acme.dev" },
  { id: "jonah", name: "Jonah Weiss", email: "jonah@acme.dev" },
];

export default function ComboboxDemo() {
  const [assignee, setAssignee] = useState<Person | null>(null);
  return <Combobox label="Assign to" people={PEOPLE} value={assignee} onChange={setAssignee} />;
}
