"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// The repo's live star count. The page renders with the number saved at
// the last deploy (so first paint is never empty), then the browser asks
// GitHub for the current one and rolls the digits to it if it moved.
//
// Cached in localStorage for five minutes: GitHub allows 60 anonymous
// requests an hour per visitor, and clicking between pages shouldn't spend
// one each time. Offline, rate-limited or blocked, the saved number stays.
// The same approach as the breakscale site (sys-sim's useGithubStars).

const STORAGE_KEY = "lab-stars";
const STALE_MS = 5 * 60 * 1000;

type Cached = { count: number; fetchedAt: number };

function readCache(): Cached | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return typeof parsed?.count === "number" && typeof parsed?.fetchedAt === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

// The cache is the store: the fetch writes it and announces the change,
// and every mounted count (and other tabs, via "storage") reads it back.
const CHANGED = "lab-stars-changed";

function writeCache(count: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, fetchedAt: Date.now() }));
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
const cachedCount = () => readCache()?.count ?? null;

export function useGithubStars(repo: string, saved: number) {
  // The server (and the first client render) show the saved number; the
  // cached one takes over right after hydration.
  const cached = useSyncExternalStore(subscribe, cachedCount, () => null);

  useEffect(() => {
    const fresh = readCache();
    if (fresh && Date.now() - fresh.fetchedAt < STALE_MS) return;

    let cancelled = false;
    fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stargazers_count?: unknown } | null) => {
        if (cancelled || typeof data?.stargazers_count !== "number") return;
        writeCache(data.stargazers_count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repo]);

  return cached ?? saved;
}

// Rolls up when the live count is higher, down if it dropped.
export function StarCount({ repo, saved }: { repo: string; saved: number }) {
  const count = useGithubStars(repo, saved);
  const reduceMotion = useReducedMotion();
  const [seen, setSeen] = useState({ n: count, dir: 1 });
  if (seen.n !== count) setSeen({ n: count, dir: count > seen.n ? 1 : -1 });
  const dir = seen.n !== count ? (count > seen.n ? 1 : -1) : seen.dir;

  return (
    <span className="relative inline-flex overflow-hidden tabular-nums">
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.span
          key={count}
          custom={dir}
          variants={{
            enter: (d: number) => ({ y: d * 10, opacity: 0 }),
            center: { y: 0, opacity: 1 },
            exit: (d: number) => ({ y: d * -10, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }
          }
        >
          {count}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
