"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; href: string };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Segments slide over to close the gap at UI speed, with no bounce: a trail
// that overshoots reads as unstable.
const SLIDE = { type: "spring", visualDuration: 0.25, bounce: 0 } as const;
const INSTANT = { duration: 0 } as const;
const ENTER = { duration: 0.2, ease: EASE_OUT };
// Leaving segments go faster than arriving ones, so the gap they leave is
// already closing by the time the eye looks for it.
const EXIT = { duration: 0.12, ease: EASE_OUT };
const MENU_ENTER = { duration: 0.18, ease: EASE_OUT };
const MENU_EXIT = { duration: 0.1, ease: EASE_OUT };

/*
 * Fitting works off a hidden copy of the full trail, so the widths never
 * depend on what is currently folded and the decision can't oscillate.
 * The first segment and the current page always stay; middle segments fold
 * into the menu from the left, so the nearest parents stay visible longest.
 */
export function Breadcrumbs({
  items,
  onNavigate,
  className,
}: {
  items: readonly Crumb[];
  onNavigate?: (item: Crumb, index: number) => void;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const navRef = useRef<HTMLElement>(null);
  const rulerRef = useRef<HTMLOListElement>(null);
  // Index of the first segment shown after the fold. 1 means none hidden.
  const [start, setStart] = useState(1);

  useEffect(() => {
    const nav = navRef.current;
    const ruler = rulerRef.current;
    if (!nav || !ruler) return;

    const fit = () => {
      const widths = [...ruler.children].map(
        (n) => n.getBoundingClientRect().width,
      );
      const fold = widths.pop() ?? 0;
      const n = widths.length;
      const available = nav.clientWidth;
      let next = Math.max(n - 1, 1);
      let tail = widths.slice(1).reduce((a, b) => a + b, 0);
      for (let k = 1; k < n; k++) {
        // Half a pixel of slack absorbs subpixel rounding between the ruler
        // and the live row.
        if (widths[0] + (k > 1 ? fold : 0) + tail <= available + 0.5) {
          next = k;
          break;
        }
        tail -= widths[k];
      }
      // Bails out when unchanged, so a continuous resize costs no renders.
      setStart(next);
    };

    const observer = new ResizeObserver(fit);
    observer.observe(nav);
    observer.observe(ruler);
    let alive = true;
    // Webfonts can land after the first measure and change every width.
    document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [items]);

  const last = items.length - 1;
  const folded = Math.min(start, Math.max(last, 1));
  const hidden = items.slice(1, folded);
  const layout = reduce ? INSTANT : SLIDE;
  const reveal = {
    initial: { opacity: 0, filter: reduce ? "blur(0px)" : "blur(4px)" },
    animate: { opacity: 1, filter: "blur(0px)", transition: ENTER },
    exit: { opacity: 0, filter: "blur(0px)", transition: EXIT },
    transition: { layout },
    layout: "position" as const,
    // Only a fold change moves segments, so other re-renders (opening the
    // menu) skip the layout measure entirely.
    layoutDependency: folded,
  };

  const segments: React.ReactNode[] = [];
  items.forEach((item, index) => {
    if (index !== 0 && index < folded) return;
    segments.push(
      <motion.li
        key={item.href}
        {...reveal}
        className={cn(
          "flex items-center",
          index === last ? "min-w-0" : "shrink-0",
        )}
      >
        {index > 0 && <Separator />}
        {index === last ? (
          // The current page is text, not a link: it can't take you anywhere.
          <span
            aria-current="page"
            className="block truncate px-1.5 text-sm font-medium text-foreground"
          >
            {item.label}
          </span>
        ) : (
          <a
            href={item.href}
            onClick={(e) => {
              if (!onNavigate) return;
              e.preventDefault();
              onNavigate(item, index);
            }}
            className="inline-flex h-9 touch-manipulation items-center rounded-md px-1.5 text-sm whitespace-nowrap text-muted underline decoration-transparent underline-offset-4 outline-hidden transition-[color,text-decoration-color,scale] duration-150 ease-out select-none hover:text-foreground hover:decoration-foreground/40 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,text-decoration-color]"
          >
            {item.label}
          </a>
        )}
      </motion.li>,
    );
    if (index === 0 && hidden.length > 0) {
      segments.push(
        <motion.li key="fold" {...reveal} className="flex shrink-0 items-center">
          <Separator />
          <FoldMenu items={hidden} onNavigate={onNavigate} />
        </motion.li>,
      );
    }
  });

  return (
    <nav
      ref={navRef}
      aria-label="Folder breadcrumb"
      className={cn("relative w-full min-w-0", className)}
    >
      <ol
        ref={rulerRef}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center whitespace-nowrap"
      >
        {items.map((item, index) => (
          <li key={item.href} className="flex shrink-0 items-center">
            {index > 0 && <Separator />}
            <span
              className={cn("px-1.5 text-sm", index === last && "font-medium")}
            >
              {item.label}
            </span>
          </li>
        ))}
        <li className="flex shrink-0 items-center">
          <Separator />
          <span className="block w-9" />
        </li>
      </ol>

      <ol className="relative flex h-9 min-w-0 items-center">
        <AnimatePresence initial={false} mode="popLayout">
          {segments}
        </AnimatePresence>
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0 text-muted/50"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M10 3 6 13" />
    </svg>
  );
}

function FoldMenu({
  items,
  onNavigate,
}: {
  items: readonly Crumb[];
  onNavigate?: (item: Crumb, index: number) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const focusFirst = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (focusFirst.current) itemRefs.current[0]?.focus({ preventScroll: true });
    else menuRef.current?.focus({ preventScroll: true });
  }, [open]);

  const count = items.length;

  const openMenu = (first: boolean) => {
    focusFirst.current = first;
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const focusAt = (index: number) =>
    itemRefs.current[(index + count) % count]?.focus({ preventScroll: true });

  const move = (step: number) => {
    const at = itemRefs.current.indexOf(
      document.activeElement as HTMLAnchorElement,
    );
    focusAt(at === -1 ? (step > 0 ? 0 : -1) : at + step);
  };

  return (
    <span ref={rootRef} className="relative flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Show ${count} hidden ${count === 1 ? "folder" : "folders"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={(e) => {
          if (open) close(false);
          // detail is 0 for keyboard and assistive tech clicks, which want
          // focus on the first item rather than on the menu itself.
          else openMenu(e.detail === 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openMenu(true);
          }
        }}
        className={cn(
          "flex h-8 w-9 touch-manipulation items-center justify-center rounded-md text-muted outline-hidden transition-[color,background-color,scale] duration-150 ease-out select-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]",
          open && "bg-foreground/[0.06] text-foreground",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-4"
          fill="currentColor"
        >
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <Menu
            ref={menuRef}
            id={`${id}-menu`}
            reduce={reduce}
            onKeyDown={(e) => {
              switch (e.key) {
                case "ArrowDown":
                  e.preventDefault();
                  move(1);
                  return;
                case "ArrowUp":
                  e.preventDefault();
                  move(-1);
                  return;
                case "Home":
                  e.preventDefault();
                  focusAt(0);
                  return;
                case "End":
                  e.preventDefault();
                  focusAt(-1);
                  return;
                case "Escape":
                  e.preventDefault();
                  close(true);
                  return;
                case "Tab":
                  // Focus moves on as usual; the menu just gets out of the way.
                  close(false);
              }
            }}
            onBlur={(e) => {
              // Covers clicking outside, tabbing away and leaving the window.
              if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
                close(false);
              }
            }}
          >
            {items.map((item, i) => (
              <a
                key={item.href}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                href={item.href}
                role="menuitem"
                tabIndex={-1}
                onPointerMove={(e) => {
                  if (e.pointerType === "touch") return;
                  if (document.activeElement !== e.currentTarget) {
                    e.currentTarget.focus({ preventScroll: true });
                  }
                }}
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    // Hidden segments start right after the first one.
                    onNavigate(item, i + 1);
                  }
                  close(true);
                }}
                // No transition on the highlight: it follows every hover, so
                // any easing reads as lag.
                className="flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm text-foreground outline-hidden select-none focus:bg-foreground/[0.06]"
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-4 shrink-0 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                >
                  <path d="M2.25 4.5c0-.69.56-1.25 1.25-1.25h2.6l1.4 1.5h5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-9c-.69 0-1.25-.56-1.25-1.25Z" />
                </svg>
                <span className="truncate">{item.label}</span>
              </a>
            ))}
          </Menu>
        )}
      </AnimatePresence>
    </span>
  );
}

function Menu({
  ref,
  id,
  reduce,
  onKeyDown,
  onBlur,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  id: string;
  reduce: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: (e: React.FocusEvent) => void;
  children: React.ReactNode;
}) {
  // A closing menu stops taking pointer input at once, so it never blocks
  // the next click while it fades.
  const isPresent = useIsPresent();
  return (
    <motion.div
      ref={ref}
      id={id}
      role="menu"
      aria-label="Hidden folders"
      tabIndex={-1}
      initial={{ opacity: 0, transform: reduce ? "scale(1)" : "scale(0.95)" }}
      animate={{ opacity: 1, transform: "scale(1)", transition: MENU_ENTER }}
      exit={{
        opacity: 0,
        transform: reduce ? "scale(1)" : "scale(0.97)",
        transition: MENU_EXIT,
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      // Grows out of the dots: 18px is the centre of the 36px trigger.
      style={{ transformOrigin: "18px 0" }}
      // 12px radius around 4px padding keeps the 8px items concentric.
      className={cn(
        "absolute top-full left-0 z-50 mt-1.5 w-48 rounded-xl bg-surface p-1 shadow-raised outline-hidden",
        !isPresent && "pointer-events-none",
      )}
    >
      {children}
    </motion.div>
  );
}

const PATH: Crumb[] = [
  { label: "Workspace", href: "/workspace" },
  { label: "Projects", href: "/workspace/projects" },
  { label: "ui-lab", href: "/workspace/projects/ui-lab" },
  { label: "src", href: "/workspace/projects/ui-lab/src" },
  { label: "lab", href: "/workspace/projects/ui-lab/src/lab" },
  { label: "components", href: "/workspace/projects/ui-lab/src/lab/components" },
  {
    label: "button.tsx",
    href: "/workspace/projects/ui-lab/src/lab/components/button.tsx",
  },
];

// Narrow enough to fold everything, wide enough that the current page still
// reads in full.
const MIN_WIDTH = 220;
const KEY_STEP = 16;

export default function BreadcrumbsDemo() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);

  // Written straight to the DOM: resizing is continuous, and only a fold
  // change inside the trail needs React.
  const resize = (width: number) => {
    const frame = frameRef.current;
    const max = wrapRef.current?.clientWidth ?? width;
    if (!frame) return;
    const next = Math.round(Math.min(Math.max(width, MIN_WIDTH), max));
    frame.style.width = `${next}px`;
    handleRef.current?.setAttribute("aria-valuenow", String(next));
    handleRef.current?.setAttribute("aria-valuemax", String(Math.round(max)));
  };

  useEffect(() => {
    // Syncs the slider's range with the real width on narrow screens.
    const max = wrapRef.current?.clientWidth ?? 0;
    handleRef.current?.setAttribute("aria-valuemax", String(Math.round(max)));
    handleRef.current?.setAttribute("aria-valuenow", String(Math.round(max)));
  }, []);

  const stop = () => {
    drag.current = null;
  };

  return (
    <div ref={wrapRef} className="flex w-[min(520px,100%)] flex-col gap-4">
      <div
        ref={frameRef}
        className="relative flex h-14 max-w-full items-center rounded-2xl bg-background px-2.5 shadow-raised"
      >
        <Breadcrumbs items={PATH} onNavigate={() => {}} />
        <div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label="Container width"
          aria-orientation="horizontal"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={520}
          aria-valuenow={520}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              width: frameRef.current?.offsetWidth ?? 0,
            };
          }}
          onPointerMove={(e) => {
            const from = drag.current;
            if (from) resize(from.width + e.clientX - from.x);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onKeyDown={(e) => {
            const width = frameRef.current?.offsetWidth ?? 0;
            const next = {
              ArrowLeft: width - KEY_STEP,
              ArrowDown: width - KEY_STEP,
              ArrowRight: width + KEY_STEP,
              ArrowUp: width + KEY_STEP,
              PageDown: width - KEY_STEP * 4,
              PageUp: width + KEY_STEP * 4,
              Home: MIN_WIDTH,
              End: Infinity,
            }[e.key];
            if (next === undefined) return;
            e.preventDefault();
            resize(next);
          }}
          // A 24px wide hit area around a 6px grip, centred on the edge.
          className="group absolute top-1/2 -right-3 flex h-10 w-6 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
        >
          <span className="h-6 w-1.5 rounded-full bg-border transition-[background-color,scale] duration-150 ease-out group-hover:bg-muted group-active:scale-y-[1.15] group-active:bg-foreground motion-reduce:transition-[background-color]" />
        </div>
      </div>
      <p className="px-1 text-[13px] text-muted">
        Drag the edge to resize. Folded folders live behind the dots.
      </p>
    </div>
  );
}
