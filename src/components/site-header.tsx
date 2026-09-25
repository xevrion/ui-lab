import Link from "next/link";
import { siGithub, siX } from "simple-icons";
import repo from "@/lib/repo.json";
import { site } from "@/lib/site";
import { StarCount } from "./github-stars";
import { HeaderSearch } from "./header-search";
import { SidebarNav } from "./lab-sidebar";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

// Sticks to the top of the page column, with a hairline under it matching
// the sidebar's brand row, so the two read as one frame.
export function SiteHeader({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <MobileNav>
          <SidebarNav />
        </MobileNav>
        <Link
          href="/"
          // The index restores its own scroll position, so Next shouldn't
          // jump to the top first.
          scroll={false}
          className={
            title
              ? "shrink-0 text-muted transition-[color] duration-150 ease-out hover:text-foreground"
              : "font-medium"
          }
        >
          {/* On wide screens the sidebar already carries the name. */}
          <span className="lg:hidden">ui lab</span>
          <span className="hidden lg:inline">Lab</span>
        </Link>
        {title && (
          <>
            <span aria-hidden className="text-border">
              /
            </span>
            <span className="truncate font-medium">{title}</span>
          </>
        )}
      </nav>
      <div className="flex shrink-0 items-center gap-1.5">
        <HeaderSearch />
        <a
          href={site.repo}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          className="group/gh flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] max-sm:w-9 max-sm:justify-center max-sm:px-0"
        >
          <BrandIcon path={siGithub.path} />
          {repo.stars > 0 && (
            <span className="hidden items-center gap-1 text-muted tabular-nums transition-[color] duration-150 ease-out group-hover/gh:text-foreground sm:flex">
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="currentColor">
                <path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.6Z" />
              </svg>
              {/* Starts at the count saved at deploy, then updates live. */}
              <StarCount repo={repo.repo} saved={repo.stars} />
            </span>
          )}
        </a>
        <a
          href={`https://x.com/${site.author.twitter.slice(1)}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`${site.author.handle} on X`}
          className="hidden size-9 items-center justify-center rounded-full text-foreground outline-hidden transition-[scale,background-color] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] sm:flex"
        >
          <BrandIcon path={siX.path} className="size-3.5" />
        </a>
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <ThemeToggle />
      </div>
    </header>
  );
}

function BrandIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className ?? "size-4"} fill="currentColor">
      <path d={path} />
    </svg>
  );
}
