import Link from "next/link";
import { groups } from "@/lab/order";
import { SidebarLink } from "./sidebar-link";

// The list itself, shared by the desktop column and the phone menu.
export function SidebarNav() {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="mb-1.5 flex items-baseline justify-between px-3 text-xs font-medium text-muted">
            {g.label}
            <span className="font-normal tabular-nums">
              {g.items.length}
            </span>
          </p>
          <ul className="flex flex-col">
            {g.items.map((e) => (
              <li key={e.slug}>
                <SidebarLink slug={e.slug} name={e.name} isNew={e.isNew} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// A real column on wide screens: full height, its own scroll, one hairline
// between it and the work.
export function LabSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border lg:flex">
      <Link
        href="/"
        prefetch={false}
        scroll={false}
        className="flex h-14 shrink-0 items-baseline gap-2 border-b border-border px-6 pt-[19px] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      >
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          ui lab
        </span>
        <span className="text-[13px] text-muted">by xevrion</span>
      </Link>
      <nav
        aria-label="Everything in the lab"
        // Fades at both ends, so the list reads as continuing out of view
        // rather than being cut.
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-6 pb-12 [mask-image:linear-gradient(to_bottom,transparent,black_20px,black_calc(100%-40px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <SidebarNav />
      </nav>
    </aside>
  );
}
