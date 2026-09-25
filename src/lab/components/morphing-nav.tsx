"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type NavLink = { title: string; description: string; icon: React.ReactNode };
export type NavSection = { label: string; columns?: 1 | 2; links: NavLink[] };

// Long enough that sweeping the cursor across the bar on the way somewhere
// else doesn't flash a panel open, short enough to feel immediate.
const OPEN_INTENT = 80;
// Grace before closing, so a cursor that clips the edge on its way into the
// panel doesn't lose it.
const CLOSE_GRACE = 180;
// How far the old and new content slide during a morph, in px.
const SLIDE = 48;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// One spring drives size, position and caret, so they arrive together.
// No bounce: an overshooting panel would uncover empty space.
const MORPH = { type: "spring", duration: 0.3, bounce: 0 } as const;
const INSTANT = { duration: 0 } as const;
const CARET = 16;

type Size = { w: number; h: number };
type Active = { index: number; center: number };

export function MorphingNav({
  sections,
  label = "Main",
  brand,
  action,
  className,
}: {
  sections: NavSection[];
  label?: string;
  brand?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const reduce = !!useReducedMotion();
  const navRef = useRef<HTMLElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const measures = useRef<(HTMLDivElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [direction, setDirection] = useState(1);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [navWidth, setNavWidth] = useState(0);
  // Each open gets a fresh panel, so reopening never morphs from a stale spot.
  const [session, setSession] = useState(0);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const focusFirst = useRef(false);
  const latest = useRef(active);
  const panelId = useId();

  useEffect(() => {
    latest.current = active;
  });

  const centerOf = (index: number) => {
    const nav = navRef.current?.getBoundingClientRect();
    const box = triggers.current[index]?.getBoundingClientRect();
    return nav && box ? box.left - nav.left + box.width / 2 : 0;
  };

  // Sizes come from hidden copies of every section, so the panel knows where
  // it's going before the new content has even rendered.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => {
      setNavWidth(nav.offsetWidth);
      setSizes(
        measures.current.map((m) => ({ w: m?.offsetWidth ?? 0, h: m?.offsetHeight ?? 0 })),
      );
      setActive((a) => a && { ...a, center: centerOf(a.index) });
    });
    observer.observe(nav);
    measures.current.forEach((m) => m && observer.observe(m));
    return () => observer.disconnect();
  }, [sections]);

  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );

  // Taps outside close it on touch, where there's no pointer to leave.
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

  // Only the incoming section: during a morph the outgoing copy is still in
  // the DOM, and keyboard focus must never land on links that are leaving.
  const liveLinks = () => {
    const index = latest.current?.index;
    return [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(`[data-section="${index}"] a`) ?? []),
    ];
  };

  useEffect(() => {
    if (!active || !focusFirst.current) return;
    focusFirst.current = false;
    liveLinks()[0]?.focus();
  }, [active]);

  const open = (index: number) => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    const current = latest.current;
    if (current?.index === index) return;
    if (current) setDirection(index > current.index ? 1 : -1);
    else setSession((s) => s + 1);
    const next = { index, center: centerOf(index) };
    latest.current = next;
    setActive(next);
  };

  const close = (refocus = false) => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    const current = latest.current;
    latest.current = null;
    setActive(null);
    if (refocus && current) triggers.current[current.index]?.focus();
  };

  const focusTrigger = (index: number) => {
    const count = sections.length;
    triggers.current[(index + count) % count]?.focus();
  };

  const onTriggerKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusFirst.current = true;
      if (active?.index === index) {
        focusFirst.current = false;
        liveLinks()[0]?.focus();
      } else open(index);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      focusTrigger(index + (e.key === "ArrowRight" ? 1 : -1));
    } else if (e.key === "Escape" && active) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab" && !e.shiftKey && active?.index === index) {
      // The panel sits after the whole bar in the DOM; Tab goes into it
      // from its own trigger, as if it followed the trigger directly.
      const first = liveLinks()[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!active) return;
    const links = liveLinks();
    const at = links.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      links[(at + step + links.length) % links.length]?.focus();
    } else if (e.key === "Tab" && e.shiftKey && at === 0) {
      e.preventDefault();
      triggers.current[active.index]?.focus();
    } else if (e.key === "Tab" && !e.shiftKey && at === links.length - 1) {
      const next = triggers.current[active.index + 1];
      const after = afterRef.current?.querySelector<HTMLElement>("a, button");
      if (next) {
        e.preventDefault();
        next.focus();
      } else if (after) {
        e.preventDefault();
        close();
        after.focus();
      } else close();
    }
  };

  const size = active ? sizes[active.index] : undefined;
  const width = size ? Math.min(size.w, navWidth) : 0;
  const x = active ? Math.max(0, Math.min(active.center - width / 2, navWidth - width)) : 0;
  // Keeps the caret off the rounded corners.
  const caretX = active
    ? Math.max(12, Math.min(active.center - x - CARET / 2, width - CARET - 12))
    : 0;
  const morph = reduce ? INSTANT : MORPH;

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className={cn("relative w-[min(600px,100%)]", className)}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") clearTimeout(closeTimer.current);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        clearTimeout(openTimer.current);
        if (latest.current) {
          clearTimeout(closeTimer.current);
          closeTimer.current = setTimeout(() => close(), CLOSE_GRACE);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      {/* 16 = 10 (trigger radius) + 6 (padding): concentric corners. */}
      <div className="flex min-h-[52px] items-center gap-1 rounded-2xl bg-background p-1.5 shadow-raised">
        {brand && <div className="flex shrink-0 items-center px-2.5 max-sm:hidden">{brand}</div>}
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 max-[400px]:grid max-[400px]:grid-cols-2">
          {sections.map((section, index) => {
            const on = active?.index === index;
            return (
              <li key={section.label}>
                <button
                  ref={(el) => {
                    triggers.current[index] = el;
                  }}
                  type="button"
                  aria-expanded={on}
                  aria-controls={on ? panelId : undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "touch") return;
                    clearTimeout(openTimer.current);
                    // Already open: follow the cursor at once. Closed: wait
                    // a beat to be sure the cursor means it.
                    if (latest.current) open(index);
                    else openTimer.current = setTimeout(() => open(index), OPEN_INTENT);
                  }}
                  onPointerLeave={() => {
                    if (!latest.current) clearTimeout(openTimer.current);
                  }}
                  onClick={(e) => {
                    // detail is 0 for Enter and Space; those toggle, like a tap.
                    const keyboardOrTouch =
                      e.detail === 0 ||
                      (e.nativeEvent as PointerEvent).pointerType === "touch";
                    if (on && keyboardOrTouch) close();
                    else open(index);
                  }}
                  onFocus={() => {
                    // With the panel open, focus moving along the bar moves it too.
                    if (latest.current && latest.current.index !== index) open(index);
                  }}
                  onKeyDown={(e) => onTriggerKeyDown(index, e)}
                  className={cn(
                    "flex h-10 touch-manipulation items-center gap-1 rounded-[10px] px-1 text-sm min-[400px]:px-2.5 whitespace-nowrap outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color] sm:px-3",
                    on
                      ? "bg-surface text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {section.label}
                  <svg
                    viewBox="0 0 12 12"
                    className={cn(
                      "size-3 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] max-sm:hidden motion-reduce:transition-none",
                      on && "rotate-180",
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m3 4.75 3 3 3-3" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
        {action && (
          <div ref={afterRef} className="shrink-0 max-sm:hidden">
            {action}
          </div>
        )}
      </div>

      <AnimatePresence>
        {active && size && (
          <motion.div
            key={session}
            className="absolute top-full left-0 mt-3"
            initial={{ opacity: 0, scale: 0.97, x, width, height: size.h }}
            animate={{ opacity: 1, scale: 1, x, width, height: size.h }}
            // Leaves faster and smaller than it came: the exit shouldn't hold the eye.
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE_OUT } }}
            transition={{
              default: morph,
              opacity: { duration: 0.2, ease: EASE_OUT },
              scale: { duration: reduce ? 0 : 0.2, ease: EASE_OUT },
            }}
            // Grows out of the caret, which points at the trigger.
            style={{ transformOrigin: `${caretX + CARET / 2}px 0px` }}
          >
            {/* Invisible bridge over the gap, so the cursor never "leaves"
                on its way down from the bar. */}
            <div aria-hidden className="absolute inset-x-0 -top-3 h-3" />
            <motion.svg
              aria-hidden
              viewBox="0 0 16 9"
              width={CARET}
              height={9}
              // Overlaps the panel by 1px to hide its ring under the caret.
              className="absolute -top-2 left-0 z-10 fill-background stroke-foreground/[0.08]"
              initial={{ x: caretX }}
              animate={{ x: caretX }}
              transition={morph}
            >
              <path d="M0 9 8 1l8 8" strokeWidth={1} />
            </motion.svg>
            <div
              ref={panelRef}
              id={panelId}
              onKeyDown={onPanelKeyDown}
              // 16 = 8 (link radius) + 8 (padding): concentric corners.
              className="relative size-full overflow-hidden rounded-2xl bg-background shadow-raised"
            >
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={active.index}
                  data-section={active.index}
                  custom={direction}
                  variants={reduce ? FADE : SLIDES}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="absolute top-0 left-0"
                  // Pinned to its final width so text never reflows mid-morph.
                  style={{ width }}
                >
                  <SectionLinks
                    section={sections[active.index]}
                    onNavigate={() => close()}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden copies, measured for their natural size. */}
      <div aria-hidden inert className="pointer-events-none invisible absolute top-0 left-0 w-full">
        {sections.map((section, index) => (
          <div
            key={section.label}
            ref={(el) => {
              measures.current[index] = el;
            }}
            className="absolute top-0 left-0 w-max max-w-full"
          >
            <SectionLinks section={section} />
          </div>
        ))}
      </div>
    </nav>
  );
}

const SLIDES = {
  enter: (dir: number) => ({ x: dir * SLIDE, opacity: 0, filter: "blur(4px)" }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.25, ease: EASE_OUT },
  },
  exit: (dir: number) => ({
    x: -dir * SLIDE,
    opacity: 0,
    filter: "blur(4px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  }),
};

const FADE = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } },
};

function SectionLinks({
  section,
  onNavigate,
}: {
  section: NavSection;
  onNavigate?: () => void;
}) {
  return (
    <ul className={cn("grid gap-0.5 p-2", section.columns === 2 && "sm:grid-cols-2")}>
      {section.links.map((link) => (
        <li key={link.title} className="min-w-0">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate?.();
            }}
            className="flex items-start gap-3 rounded-lg p-3 pr-4 outline-hidden transition-[background-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground hover:bg-surface"
          >
            <svg
              viewBox="0 0 24 24"
              // Nudged down to sit on the title's first line, not above it.
              className="mt-px size-[18px] shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {link.icon}
            </svg>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{link.title}</span>
              <span className="block truncate text-sm text-muted">{link.description}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const SECTIONS: NavSection[] = [
  {
    label: "Products",
    columns: 2,
    links: [
      {
        title: "Analytics",
        description: "Live dashboards for every metric",
        icon: <path d="M4.5 19.5v-6M9.5 19.5v-10M14.5 19.5v-7M19.5 19.5V5.5" />,
      },
      {
        title: "Automations",
        description: "Run workflows on any event",
        icon: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12Z" />,
      },
      {
        title: "Storage",
        description: "Files and backups in one place",
        icon: (
          <>
            <ellipse cx="12" cy="6.5" rx="7" ry="3" />
            <path d="M5 6.5v11c0 1.66 3.13 3 7 3s7-1.34 7-3v-11M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
          </>
        ),
      },
      {
        title: "Security",
        description: "Access control and audit logs",
        icon: <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6Z" />,
      },
    ],
  },
  {
    label: "Solutions",
    links: [
      {
        title: "Startups",
        description: "Launch fast with sensible defaults",
        icon: <path d="M12 20.5v-4M8 16.5l4-13 4 13ZM9.5 12.5h5" />,
      },
      {
        title: "Enterprise",
        description: "Scale with SSO and dedicated support",
        icon: (
          <>
            <path d="M4.5 20.5v-15h9v15M13.5 9.5h6v11M3 20.5h18" />
            <path d="M7.5 9h3M7.5 12.5h3M7.5 16h3M16.5 13h.01M16.5 16.5h.01" />
          </>
        ),
      },
      {
        title: "Agencies",
        description: "Manage every client from one account",
        icon: (
          <>
            <circle cx="9" cy="8.5" r="3" />
            <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 6M17.5 14.5a5.5 5.5 0 0 1 3 5" />
          </>
        ),
      },
    ],
  },
  {
    label: "Resources",
    columns: 2,
    links: [
      {
        title: "Docs",
        description: "Guides and API reference",
        icon: (
          <>
            <path d="M5.5 4.5h9l4 4v11h-13Z" />
            <path d="M14.5 4.5v4h4M8.5 12.5h7M8.5 16h5" />
          </>
        ),
      },
      {
        title: "Changelog",
        description: "What shipped this week",
        icon: (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </>
        ),
      },
      {
        title: "Community",
        description: "Ask questions, share builds",
        icon: <path d="M4.5 18.5v-11a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9Z" />,
      },
      {
        title: "Templates",
        description: "Starter projects to fork",
        icon: (
          <>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
          </>
        ),
      },
    ],
  },
  {
    label: "Pricing",
    links: [
      {
        title: "Plans",
        description: "Compare every tier side by side",
        icon: (
          <>
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
            <path d="M3.5 9.5h17M7 14.5h3" />
          </>
        ),
      },
      {
        title: "Calculator",
        description: "Estimate your monthly bill",
        icon: (
          <>
            <rect x="5.5" y="3.5" width="13" height="17" rx="2" />
            <path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
          </>
        ),
      },
    ],
  },
];

export default function MorphingNavDemo() {
  return (
    // The panel floats over this reserved space, so opening, morphing and
    // closing never change the demo's height.
    <div className="h-[340px] w-[min(600px,100%)]">
      <MorphingNav
        sections={SECTIONS}
        brand={
          <svg viewBox="0 0 20 20" className="size-5 text-foreground" aria-label="Home" role="img">
            <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth={1.5} />
            <circle cx="10" cy="10" r="2.5" fill="currentColor" />
          </svg>
        }
        action={
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex h-10 items-center rounded-[10px] bg-foreground px-3.5 text-sm font-medium text-background outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
          >
            Sign in
          </a>
        }
      />
    </div>
  );
}
