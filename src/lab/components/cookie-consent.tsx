"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Consent = {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

type Category = keyof Consent;

export const COOKIE_CATEGORIES: {
  key: Category;
  name: string;
  description: string;
}[] = [
  {
    key: "functional",
    name: "Functional",
    description: "Remembers your language, theme and text size.",
  },
  {
    key: "analytics",
    name: "Analytics",
    description: "Counts page visits so we know what to fix. No ad networks.",
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Tells our ads on other sites that you have been here.",
  },
];

const NONE: Consent = { functional: false, analytics: false, marketing: false };
const ALL: Consent = { functional: true, analytics: true, marketing: true };

// Accept or reject all changes the cookie, then the banner closes. This is
// long enough to see the bites mostly land or heal; the tail plays under
// the content's fade out.
const SETTLE_MS = 240;

// The cookie is drawn in a 120 unit box: a 50 unit dough disc in the middle.
const CENTER = 60;
const RADIUS = 50;
// Each bite is a 34 unit circle whose middle sits 66 from the center, so it
// takes an 18 unit deep mouthful. Deep enough to read as a bite at 24px in
// the pill, shallow enough that three of them (the default, everything off)
// still leave something that is plainly a cookie.
const BITE_RADIUS = 34;
const BITE_REACH = 66;
// Far enough out that the bite, teeth and all, clears the dough completely.
const BITE_AWAY = 44;
// Angles in degrees, clockwise from 3 o'clock, one per category above.
const BITES: Record<Category, number> = {
  functional: 205,
  analytics: -30,
  marketing: 95,
};
// Three small circles along each bite's inner rim leave scalloped tooth
// marks instead of a clean arc.
const TEETH = [-34, 0, 34];

// Chips sit mostly where bites land, so eating a bite eats chips. The one
// near the middle survives everything.
const CHIPS = [
  { x: 57, y: 60, r: 5.5, t: 20 },
  { x: 84, y: 36, r: 4.5, t: -30 },
  { x: 95, y: 58, r: 3.5, t: 10 },
  { x: 72, y: 88, r: 4.5, t: 40 },
  { x: 48, y: 96, r: 3.5, t: -15 },
  { x: 27, y: 58, r: 4.5, t: 60 },
  { x: 36, y: 34, r: 3.5, t: 0 },
  { x: 62, y: 24, r: 3.5, t: 35 },
];

const rad = (deg: number) => (deg * Math.PI) / 180;

// Baked goods are a physical material: dough and chocolate keep their own
// colors in both themes, dimmed a touch for dark mode so they do not glow.
const CRUST = "stroke-[light-dark(#c08845,#a8773f)]";
const CHOC = "fill-[light-dark(#4b2d18,#3d2413)]";
// Baked color: pale in the middle, browner toward the edge that saw more
// heat.
const DOUGH_MID = "light-dark(#e8bd80, #cf9d62)";
const DOUGH_EDGE = "light-dark(#cf9552, #b17c42)";
// Darker flecks of brown sugar in the dough.
const SPECKS = [
  [44, 46],
  [70, 50],
  [52, 76],
  [80, 72],
  [38, 70],
  [66, 38],
  [60, 90],
  [88, 48],
  [30, 48],
];
const CRUMB = "bg-[light-dark(#dcab6b,#c8945a)]";

export function Cookie({
  consent,
  size = 80,
  className,
}: {
  consent: Consent;
  size?: number;
  className?: string;
}) {
  // useId's colons are not safe inside url(#...).
  const maskId = `cookie-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden
      className={cn("block overflow-visible", className)}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
          <rect width="120" height="120" fill="white" />
          {(Object.keys(BITES) as Category[]).map((key) => {
            const angle = rad(BITES[key]);
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            const cx = CENTER + ux * BITE_REACH;
            const cy = CENTER + uy * BITE_REACH;
            const away = consent[key] ? BITE_AWAY : 0;
            return (
              <g
                key={key}
                style={{ transform: `translate(${ux * away}px, ${uy * away}px)` }}
                // Biting is quick and decisive; healing is a softer ease so
                // it reads as the cookie filling back in. Classes rather
                // than a JS reduced motion check, which differs between the
                // server and the first client render.
                className={cn(
                  "motion-reduce:[transition:none]",
                  consent[key]
                    ? "[transition:transform_280ms_cubic-bezier(0.77,0,0.175,1)]"
                    : "[transition:transform_220ms_cubic-bezier(0.23,1,0.32,1)]",
                )}
              >
                <circle cx={cx} cy={cy} r={BITE_RADIUS} fill="black" />
                {TEETH.map((offset) => {
                  const a = angle + Math.PI + rad(offset);
                  return (
                    <circle
                      key={offset}
                      cx={cx + Math.cos(a) * (BITE_RADIUS - 2)}
                      cy={cy + Math.sin(a) * (BITE_RADIUS - 2)}
                      r={6.5}
                      fill="black"
                    />
                  );
                })}
              </g>
            );
          })}
        </mask>
        <radialGradient id={`${maskId}-bake`} cx="0.45" cy="0.42" r="0.6">
          <stop offset="0.55" style={{ stopColor: DOUGH_MID }} />
          <stop offset="1" style={{ stopColor: DOUGH_EDGE }} />
        </radialGradient>
      </defs>
      <g mask={`url(#${maskId})`}>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS - 1.5}
          strokeWidth={3}
          fill={`url(#${maskId}-bake)`}
          className={CRUST}
        />
        {SPECKS.map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={1.1}
            className={CHOC}
            opacity={0.35}
          />
        ))}
        {CHIPS.map((chip) => (
          <ellipse
            key={`${chip.x}-${chip.y}`}
            cx={chip.x}
            cy={chip.y}
            rx={chip.r}
            ry={chip.r * 0.8}
            transform={`rotate(${chip.t} ${chip.x} ${chip.y})`}
            className={CHOC}
          />
        ))}
        {/* A glint on each chip's upper left, where the light hits the
            melted chocolate. */}
        {CHIPS.map((chip) => (
          <circle
            key={`g-${chip.x}-${chip.y}`}
            cx={chip.x - chip.r * 0.35}
            cy={chip.y - chip.r * 0.3}
            r={chip.r * 0.3}
            fill="white"
            opacity={0.22}
          />
        ))}
      </g>
    </svg>
  );
}

// Shared by every banner on the page, so opening settings in one place and
// saving in another stays in sync.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readStored(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function parse(raw: string | null): Consent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Consent>;
    return {
      functional: !!value.functional,
      analytics: !!value.analytics,
      marketing: !!value.marketing,
    };
  } catch {
    return null;
  }
}

function Switch({
  id,
  on,
  onToggle,
  describedBy,
}: {
  id: string;
  on: boolean;
  onToggle: () => void;
  describedBy: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full outline-hidden transition-[background-color,scale] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]",
        // A 48x40 hit area around the 40x24 track.
        "after:absolute after:-inset-x-1 after:-inset-y-2",
        on ? "bg-foreground" : "bg-foreground/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow-[0_1px_2px_oklch(0_0_0/0.2)] transition-[translate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          on ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

// The pill is h-10, so its fully rounded ends have a 20px radius: the same
// radius as the banner's corners, which lets one rounded clip be both.
const PILL_H = 40;

/* How the banner and the pill are one surface: the banner is always laid
   out, and a clip-path cuts it down to the pill's box in its bottom left
   corner. Opening transitions the clip back to the whole banner. Only
   clip-path, transform and opacity change, so nothing is laid out or
   re-rasterized per frame, and a CSS transition retargets from wherever it
   is, so reopening mid-close just turns around. A clip would cut off a
   box-shadow, so the lift lives on a plate underneath that scales from the
   pill's box to the banner's on the same curve, and the hairline edge is a
   second clip one pixel bigger all round. */
const MORPH = "ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:duration-0";
// Opening is what the eye is on; closing just gets out of the way.
const morphTime = (open: boolean) => (open ? "duration-[240ms]" : "duration-[180ms]");

export function CookieConsent({
  storageKey,
  contained = false,
  onChange,
  className,
}: {
  // Opt in to remembering the choice in localStorage under this key. Left
  // out, the choice lasts for this page view only.
  storageKey?: string;
  // Positions the banner inside its nearest positioned parent instead of the
  // viewport, for previews like the demo below.
  contained?: boolean;
  onChange?: (consent: Consent) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const stored = useSyncExternalStore(
    subscribe,
    () => (storageKey ? readStored(storageKey) : null),
    // With storage, nothing renders on the server: the choice lives in the
    // browser, and a banner flashing for people who already chose is worse
    // than a beat of nothing. Without it, the banner is known up front.
    () => (storageKey ? undefined : null),
  );
  // When storage is blocked the choice still holds for this visit.
  const [memory, setMemory] = useState<Consent | null>(null);
  const saved = parse(stored ?? null) ?? memory;
  const [reopened, setReopened] = useState(false);
  const [draft, setDraft] = useState<Consent>(NONE);
  const rootRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLElement>(null);
  const cookieRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const settling = useRef(false);
  const effects = useRef(new Set<Animation>());
  const focusPill = useRef(false);

  const ready = stored !== undefined;
  const open = ready && (saved === null || reopened);

  useEffect(() => {
    const running = effects.current;
    return () => {
      window.clearTimeout(timer.current);
      running.forEach((a) => a.cancel());
    };
  }, []);

  // The clip and the plate need the pill's box relative to the banner's.
  // Written straight to CSS variables, never state: it only changes when
  // the banner reflows (a narrower screen wraps its text).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const banner = bannerRef.current;
    const pill = pillRef.current;
    if (!root || !banner || !pill) return;
    const measure = () => {
      const w = banner.offsetWidth;
      const h = banner.offsetHeight;
      const pw = pill.offsetWidth;
      if (!w || !h) return;
      root.style.setProperty("--pill-w", `${pw}px`);
      root.style.setProperty("--sx", String(pw / w));
      root.style.setProperty("--sy", String(PILL_H / h));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    observer.observe(pill);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    if (open) {
      if (reopened) headingRef.current?.focus();
    } else if (focusPill.current) {
      focusPill.current = false;
      pillRef.current?.focus();
    }
  }, [open, reopened]);

  // A bite shakes a few crumbs loose from where the teeth went in, and the
  // cookie flinches. One-shots, so WAAPI rather than state.
  const crunch = (key: Category) => {
    const wrap = cookieRef.current;
    if (!wrap || reduceMotion) return;
    const scale = wrap.offsetWidth / 120;
    const angle = rad(BITES[key]);
    const edge = BITE_REACH - BITE_RADIUS + 6;
    const flinch = wrap.animate(
      { rotate: ["0deg", `${Math.cos(angle) > 0 ? -5 : 5}deg`, "0deg"] },
      { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    effects.current.add(flinch);
    flinch.onfinish = flinch.oncancel = () => effects.current.delete(flinch);
    for (let i = 0; i < 4; i++) {
      const crumb = document.createElement("span");
      const size = 3 + (i % 2) * 2;
      crumb.className = cn(
        "pointer-events-none absolute rounded-[1px]",
        CRUMB,
      );
      crumb.style.width = `${size}px`;
      crumb.style.height = `${size}px`;
      const spread = rad((i - 1.5) * 16);
      const px = (CENTER + Math.cos(angle + spread) * (edge + 22)) * scale;
      const py = (CENTER + Math.sin(angle + spread) * (edge + 22)) * scale;
      crumb.style.left = `${px}px`;
      crumb.style.top = `${py}px`;
      wrap.appendChild(crumb);
      // Crumbs fall under gravity: a slow start, a long drop, a fade at
      // the bottom. Physical, so longer than a UI transition.
      const fall = crumb.animate(
        {
          translate: [
            "0 0",
            `${Math.cos(angle) * 8 + (i - 1.5) * 4}px ${26 + i * 7}px`,
          ],
          rotate: ["0deg", `${(i % 2 ? 1 : -1) * 140}deg`],
          opacity: [1, 1, 0],
        },
        { duration: 620 + i * 60, easing: "cubic-bezier(0.55, 0, 1, 0.45)" },
      );
      effects.current.add(fall);
      fall.onfinish = fall.oncancel = () => {
        effects.current.delete(fall);
        crumb.remove();
      };
    }
  };

  const change = (next: Consent) => {
    for (const { key } of COOKIE_CATEGORIES) {
      if (draft[key] && !next[key]) crunch(key);
    }
    setDraft(next);
  };

  const finish = (next: Consent) => {
    settling.current = false;
    try {
      if (!storageKey) throw new Error("no storage");
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ ...next, savedAt: new Date().toISOString() }),
      );
    } catch {
      setMemory(next);
    }
    listeners.forEach((l) => l());
    focusPill.current = true;
    setReopened(false);
    onChange?.(next);
  };

  const save = (next: Consent) => {
    if (settling.current) return;
    const changed = COOKIE_CATEGORIES.some((c) => draft[c.key] !== next[c.key]);
    change(next);
    // Accept or reject all plays out on the cookie before the banner
    // closes, just long enough to see the bites land or heal. When nothing
    // changes (reject all on a fresh banner), there is nothing to wait for.
    if (!changed || reduceMotion) return finish(next);
    settling.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => finish(next), SETTLE_MS);
  };

  // Escape backs out of a reopened banner, keeping what was saved. On a
  // first visit there is nothing to fall back to, so it asks for a choice.
  const dismiss = () => {
    if (saved === null || settling.current) return;
    focusPill.current = true;
    setReopened(false);
  };

  const shown = open ? draft : (saved ?? NONE);
  const turnedOff = COOKIE_CATEGORIES.filter((c) => !draft[c.key]).length;

  if (!ready) return null;

  return (
    <div
      className={cn(
        "pointer-events-none flex items-end",
        contained ? "absolute inset-x-3 bottom-3" : "fixed inset-x-4 bottom-4 z-50",
        className,
      )}
    >
      <div ref={rootRef} className="relative w-[min(500px,100%)]">
        {/* Everything that morphs. Once closed it hides for good, so the
            pill's press can shrink it without showing the surface behind. */}
        <div
          className={cn(
            "relative transition-opacity duration-0",
            open ? "opacity-100" : "opacity-0 delay-[180ms] motion-reduce:delay-0",
          )}
        >
          {/* The lift. Scaled rather than clipped so its shadow survives;
              the same curve keeps its box on the clip's box every frame. */}
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 origin-bottom-left rounded-[20px] transition-[transform,opacity]",
              // shadow-raised minus its hairline, which the edge below draws.
              "shadow-[0_1px_2px_light-dark(oklch(0_0_0/0.06),oklch(0_0_0/0.4)),0_6px_16px_-6px_light-dark(oklch(0_0_0/0.12),oklch(0_0_0/0.6))]",
              MORPH,
              morphTime(open),
              open
                ? "[transform:scale(1,1)] opacity-100"
                : "[transform:scale(var(--sx,1),var(--sy,1))] opacity-0",
            )}
          />
          {/* The hairline edge: the surface's clip plus a pixel all round. */}
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 bg-foreground/[0.07] [transition-property:clip-path] dark:bg-foreground/[0.09]",
              MORPH,
              morphTime(open),
              open
                ? "[clip-path:inset(-1px_-1px_-1px_-1px_round_21px)]"
                : "[clip-path:inset(calc(100%-41px)_calc(100%-var(--pill-w,100%)-1px)_-1px_-1px_round_21px)]",
            )}
          />
          <section
            ref={bannerRef}
            aria-labelledby={`${id}-title`}
            inert={!open}
            onKeyDown={(e) => {
              if (e.key === "Escape") dismiss();
            }}
            className={cn(
              "relative rounded-[20px] bg-background p-5 [transition-property:clip-path]",
              MORPH,
              morphTime(open),
              open
                ? "pointer-events-auto [clip-path:inset(0_0_0_0_round_20px)]"
                : "[clip-path:inset(calc(100%-40px)_calc(100%-var(--pill-w,100%))_0_0_round_20px)]",
            )}
          >
            {/* The content fades rather than scales: text stays crisp and
                the clip does the moving. Out fast before the clip crops it,
                in just behind the clip so it lands on a settled surface. */}
            <div
              className={cn(
                "transition-[opacity,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0",
                open
                  ? "translate-y-0 opacity-100 delay-[30ms] duration-[210ms]"
                  : "translate-y-1 opacity-0 duration-[90ms]",
              )}
            >
              <div className="flex items-center gap-4">
                <div ref={cookieRef} className="relative shrink-0">
                  <Cookie consent={draft} size={80} />
                </div>
                <div className="min-w-0">
                  <h2
                    ref={headingRef}
                    id={`${id}-title`}
                    tabIndex={-1}
                    className="text-[15px] font-semibold text-balance text-foreground outline-hidden"
                  >
                    We bake a few cookies
                  </h2>
                  <p className="mt-1 text-sm text-pretty text-muted">
                    Only the ones you allow. Switch one on and its bite bakes
                    back in. Leave it off and the bite stays.
                  </p>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-border border-y border-border">
                <li className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Essential</p>
                    <p className="text-[13px] text-pretty text-muted">
                      Sign-in, your cart and security. The site breaks without
                      these.
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] text-muted">Always on</span>
                </li>
                {COOKIE_CATEGORIES.map((category) => (
                  <li key={category.key} className="flex items-center gap-4 py-3">
                    {/* The whole text is the switch's label, so a click on
                        the name or the note flips it too. */}
                    <label
                      htmlFor={`${id}-${category.key}`}
                      className="min-w-0 flex-1 cursor-pointer select-none"
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {category.name}
                      </span>
                      <span
                        id={`${id}-${category.key}-desc`}
                        className="block text-[13px] text-pretty text-muted"
                      >
                        {category.description}
                      </span>
                    </label>
                    <Switch
                      id={`${id}-${category.key}`}
                      on={draft[category.key]}
                      describedBy={`${id}-${category.key}-desc`}
                      onToggle={() =>
                        change({ ...draft, [category.key]: !draft[category.key] })
                      }
                    />
                  </li>
                ))}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
                {(
                  [
                    ["Reject all", NONE],
                    ["Accept all", ALL],
                  ] as const
                ).map(([label, next]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => save(next)}
                    className="h-10 rounded-[10px] bg-surface px-4 text-sm font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-foreground/[0.08] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] sm:flex-1"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => save(draft)}
                  className="col-span-2 h-10 rounded-[10px] bg-foreground px-4 text-sm font-medium text-background outline-hidden transition-[scale,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] sm:flex-1"
                >
                  Save choices
                </button>
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {turnedOff === 0
                ? "All cookies allowed."
                : `${turnedOff} of 3 optional cookie types turned off.`}
            </p>
          </section>
        </div>

        <button
          ref={pillRef}
          type="button"
          inert={open}
          onClick={() => {
            setDraft(saved ?? NONE);
            setReopened(true);
          }}
          className={cn(
            "absolute bottom-0 left-0 flex h-10 origin-bottom-left items-center gap-2 rounded-full bg-background pr-4 pl-2 text-sm font-medium whitespace-nowrap text-foreground shadow-raised outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]",
            // The pill dissolves into the surface growing out of it, and
            // comes back as the clip lands on its box. Its press stays
            // instant either way, so the delay is on opacity only.
            open
              ? "opacity-0 [transition:opacity_90ms_ease-out,scale_150ms_ease-out]"
              : "pointer-events-auto opacity-100 [transition:opacity_140ms_cubic-bezier(0.23,1,0.32,1)_60ms,scale_150ms_ease-out] motion-reduce:[transition:opacity_140ms_ease-out,scale_150ms_ease-out]",
          )}
        >
          {/* The small cookie keeps the bites you chose. */}
          <Cookie consent={shown} size={24} />
          Cookie settings
        </button>
      </div>
    </div>
  );
}

export default function CookieConsentDemo() {
  return (
    // A stand-in page, so the banner has something to sit on top of.
    // Taller on phones, where the category notes wrap to two lines: tall
    // enough that the banner stops below the article's headline.
    <div className="relative h-[750px] w-[min(560px,100%)] overflow-hidden rounded-[20px] bg-surface sm:h-[560px]">
      <article className="px-7 pt-7">
        <p className="text-[13px] text-muted">Field Notes · 6 min read</p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">
          Cold brew at home, without the sludge
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Grind coarse, steep for eighteen hours in the fridge, and filter
          twice. The second pass through a paper filter is what takes it from
          muddy to clean, and it costs you five minutes.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          A ratio of one to eight makes a concentrate you can cut with water or
          milk. Stronger than that and the bitterness creeps back in.
        </p>
      </article>
      {/* No storageKey: the demo opens on the full banner every visit. */}
      <CookieConsent contained />
    </div>
  );
}
