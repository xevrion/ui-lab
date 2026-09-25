import Link from "next/link";
import { site } from "@/lib/site";
import { Arrow } from "./arrow";
import { SignatureMark } from "./signature-mark";

const COLUMNS = [
  {
    title: "Lab",
    links: [
      { label: "Everything", href: "/#lab" },
      { label: "Source code", href: site.repo, out: true },
    ],
  },
  {
    title: "Elsewhere",
    links: [
      { label: "xevrion.dev", href: "https://xevrion.dev", out: true },
      { label: "GitHub", href: "https://github.com/xevrion", out: true },
      { label: "X", href: "https://x.com/xevrion_the1", out: true },
    ],
  },
];

const linkClass =
  "group/out inline-flex items-center gap-0.5 rounded-sm text-muted outline-hidden transition-[color] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground";

// Signed, not stamped: the handwritten mark is the footer's one flourish,
// written once when you first reach it. The page ends on the same dotted
// stage it began on.
export function SiteFooter() {
  return (
    <footer className="relative isolate mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-border pt-12 pb-12 sm:grid-cols-[1fr_auto_auto] sm:gap-16">
        <div className="col-span-2 sm:col-span-1">
          <Link
            href="/"
            prefetch={false}
            scroll={false}
            className="inline-flex items-baseline gap-2 rounded-sm outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground"
          >
            <span className="text-[15px] font-semibold tracking-tight">
              ui lab
            </span>
            <span className="text-[13px] text-muted">by xevrion</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-pretty text-muted">
            Small things I made because I liked how they felt.
          </p>
          <div className="mt-6">
            <SignatureMark />
          </div>
        </div>
        {COLUMNS.map(({ title, links }) => (
          <nav key={title} aria-label={title}>
            <p className="text-[13px] font-medium text-foreground">{title}</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {links.map(({ label, href, out }) => (
                <li key={label}>
                  {out ? (
                    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
                      {label}
                      <Arrow
                        direction="up-right"
                        className="size-3 transition-[translate] duration-150 ease-out group-hover/out:translate-x-0.5 group-hover/out:-translate-y-0.5 motion-reduce:transition-none"
                      />
                    </a>
                  ) : (
                    <Link href={href} prefetch={false} className={linkClass}>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-border py-6 text-xs text-muted sm:flex-row sm:justify-between">
        <p className="tabular-nums">© 2026 {site.author.name}</p>
        <p>Made with Next.js, Motion and Tailwind CSS</p>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_11%,transparent)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_60%_100%_at_50%_100%,black,transparent)]"
      />
    </footer>
  );
}
