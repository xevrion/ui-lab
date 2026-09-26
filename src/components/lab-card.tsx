"use client";

import { useEffect, useRef, useState } from "react";
import { PreviewPlayContext } from "@/lab/preview-play";
import { previews } from "@/lab/previews";
import { cn } from "@/lib/cn";

// An index card that tells its preview when it's hovered or focused, so the
// demo inside can act itself out. Card titles stay server-rendered while
// previews below the first rows mount when they approach the viewport.
export function LabCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [play, setPlay] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  // Phones have no hover, so there a card plays whenever it's mostly on
  // screen: scrolling the index brings each one to life as it arrives. A
  // phone screen fits two or three cards, so only those few ever run.
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(hover: none)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => setPlay(entry.isIntersecting && entry.intersectionRatio >= 0.6),
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <li
      ref={ref}
      className={className}
      // Touch is handled by the observer above; a tap opens the piece.
      onPointerEnter={(e) => e.pointerType !== "touch" && setPlay(true)}
      onPointerLeave={(e) => e.pointerType !== "touch" && setPlay(false)}
      onFocus={() => setPlay(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPlay(false);
      }}
    >
      <PreviewPlayContext value={play}>{children}</PreviewPlayContext>
    </li>
  );
}

export function LabPreview({
  slug,
  eager,
  scale,
  crop,
}: {
  slug: string;
  eager: boolean;
  scale?: number;
  crop?: boolean;
}) {
  const [ready, setReady] = useState(eager);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (ready || !el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setReady(true);
        observer.disconnect();
      },
      // About two rows ahead, so previews are ready before scrolling into view.
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  const Preview = previews[slug];
  return (
    <div
      ref={ref}
      inert
      className={cn(
        "flex h-56 justify-center overflow-hidden rounded-xl bg-surface transition-[background-color] duration-150 ease-out [content-visibility:auto] group-hover/preview:bg-background",
        crop
          ? "items-start pt-4 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          : "items-center",
      )}
    >
      {ready && (
        <div
          className="flex shrink-0 justify-center"
          style={{
            scale: scale && String(scale),
            transformOrigin: crop ? "top" : undefined,
            width: `${100 / (scale ?? 1)}%`,
          }}
        >
          <Preview />
        </div>
      )}
    </div>
  );
}
