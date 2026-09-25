"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

export type Status = "ready" | "building" | "error" | "queued";

export type Deployment = {
  id: string;
  name: string;
  status: Status;
  branch: string;
  // Seconds, so sorting compares numbers rather than formatted strings.
  duration: number;
  date: string;
};

type Key = "name" | "status" | "branch" | "duration" | "date";
type Sort = { key: Key; dir: "asc" | "desc" } | null;

const COLUMNS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Project" },
  { key: "status", label: "Status" },
  { key: "branch", label: "Branch" },
  { key: "duration", label: "Duration", numeric: true },
  { key: "date", label: "Deployed", numeric: true },
];

// Orders by how much attention a status needs, not alphabetically.
const STATUS_RANK: Record<Status, number> = {
  error: 0,
  building: 1,
  queued: 2,
  ready: 3,
};
const STATUS_LABEL: Record<Status, string> = {
  ready: "Ready",
  building: "Building",
  error: "Error",
  queued: "Queued",
};

// No bounce: rows that overshoot would briefly sit in the wrong order.
const REORDER = { type: "spring", duration: 0.3, bounce: 0 } as const;
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const formatDuration = (s: number) =>
  s === 0
    ? "0s"
    : s < 60
      ? `${s}s`
      : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
// Fixed to UTC so the server and every viewer print the same day.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function compare(a: Deployment, b: Deployment, key: Key) {
  if (key === "duration") return a.duration - b.duration;
  if (key === "status") return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  return a[key].localeCompare(b[key]);
}

export function DataTable({
  rows,
  onDelete,
  onExport,
  className,
}: {
  rows: Deployment[];
  onDelete?: (ids: string[]) => void;
  onExport?: (ids: string[]) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [sort, setSort] = useState<Sort>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [scrolled, setScrolled] = useState(false);
  const [exported, setExported] = useState(false);
  // Holds the last count while the bar slides away, so it never reads "0".
  const [shownCount, setShownCount] = useState(0);
  const exportTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(exportTimer.current), []);

  // Ignores ids whose rows the parent has since removed.
  const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const count = ids.length;
  const all = count > 0 && count === rows.length;
  const some = count > 0 && !all;
  const open = count > 0;

  if (open && count !== shownCount) setShownCount(count);

  // indeterminate only exists as a DOM property, never as an attribute.
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = some;
  }, [some]);

  const sorted = sort
    ? [...rows].sort(
        (a, b) => compare(a, b, sort.key) * (sort.dir === "asc" ? 1 : -1),
      )
    : rows;

  // Ascending, descending, then back to the original order.
  const cycle = (key: Key) =>
    setSort((s) =>
      s?.key !== key
        ? { key, dir: "asc" }
        : s.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const headerEdge = scrolled
    ? "shadow-[0_1px_0_var(--border)]"
    : "shadow-[0_1px_0_transparent]";

  return (
    <div
      className={cn(
        "relative w-[600px] max-w-full overflow-hidden rounded-2xl bg-background shadow-raised",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setSelected(new Set());
      }}
    >
      <motion.div
        // Lets layout animations account for this box's scroll offset.
        layoutScroll
        tabIndex={0}
        role="region"
        aria-label="Deployments, scroll for more columns"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        // The 44px header plus six 44px rows, so two rows always sit below
        // the fold and the sticky header has something to cover.
        className="relative h-[308px] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  "sticky top-0 z-10 w-12 bg-background pl-4 text-left transition-[box-shadow] duration-150 ease-out",
                  headerEdge,
                )}
              >
                <Checkbox
                  ref={allRef}
                  checked={all}
                  disabled={rows.length === 0}
                  onChange={() =>
                    setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                  label="Select all rows"
                />
              </th>
              {COLUMNS.map((col) => {
                const dir = sort?.key === col.key ? sort.dir : null;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      dir === "asc"
                        ? "ascending"
                        : dir === "desc"
                          ? "descending"
                          : "none"
                    }
                    className={cn(
                      "sticky top-0 z-10 h-11 bg-background px-1 font-normal transition-[box-shadow] duration-150 ease-out last:pr-2",
                      headerEdge,
                      col.numeric ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => cycle(col.key)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium whitespace-nowrap outline-hidden select-none",
                        "transition-[scale,color,background-color] duration-150 ease-out hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[color,background-color]",
                        dir ? "text-foreground" : "text-muted",
                        // Keeps the arrow on the outside edge, so numeric
                        // labels stay aligned with their right-aligned values.
                        col.numeric && "flex-row-reverse",
                      )}
                    >
                      {col.label}
                      <SortArrow dir={dir} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {sorted.map((row) => {
                const isSelected = selected.has(row.id);
                return (
                  <motion.tr
                    key={row.id}
                    layout={reduceMotion ? false : "position"}
                    transition={{ layout: REORDER }}
                    exit={{
                      opacity: 0,
                      transition: { duration: 0.15, ease: EASE_OUT },
                    }}
                    onClick={(e) => {
                      // The checkbox and its label handle their own clicks.
                      if ((e.target as HTMLElement).closest("label")) return;
                      toggle(row.id);
                    }}
                    className={cn(
                      "group cursor-default transition-[background-color] duration-150 ease-out",
                      isSelected
                        ? "bg-foreground/[0.05]"
                        : "hover:bg-foreground/[0.025]",
                    )}
                  >
                    <Cell className="w-12 pl-4">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggle(row.id)}
                        label={`Select ${row.name}`}
                      />
                    </Cell>
                    <Cell className="font-medium text-foreground">
                      {row.name}
                    </Cell>
                    <Cell>
                      <StatusLabel status={row.status} />
                    </Cell>
                    <Cell className="font-mono text-[13px] whitespace-nowrap text-muted">
                      {row.branch}
                    </Cell>
                    <Cell className="text-right text-muted tabular-nums">
                      {row.status === "queued" ? "-" : formatDuration(row.duration)}
                    </Cell>
                    <Cell className="pr-5 text-right whitespace-nowrap text-muted tabular-nums">
                      {formatDate(row.date)}
                    </Cell>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="flex h-[220px] items-center justify-center text-sm text-muted">
            No deployments
          </p>
        )}
        {/* Lets the last rows scroll clear of the action bar. Always there:
            removing it on deselect would clamp the scroll and move the row
            under the cursor. */}
        <div aria-hidden className="h-16" />
      </motion.div>

      {/* Parked just past the card's bottom edge and clipped by it, so it
          rises out of the table. Enters in 200ms, leaves in 150ms. */}
      <div
        role="toolbar"
        aria-label="Bulk actions"
        inert={!open}
        className={cn(
          "absolute inset-x-0 bottom-3 mx-auto flex min-h-11 w-fit max-w-[calc(100%-16px)] flex-wrap justify-center items-center gap-0.5 rounded-full bg-foreground py-1 pr-1 pl-4 text-xs min-[400px]:text-sm text-background shadow-raised",
          "transition-[translate,opacity] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
          open
            ? "translate-y-0 opacity-100 duration-200"
            : "translate-y-[calc(100%+12px)] opacity-0 duration-150 motion-reduce:translate-y-0",
        )}
      >
        <span className="px-1 whitespace-nowrap tabular-nums">
          {shownCount} selected
        </span>
        <span aria-hidden className="mr-1 h-4 w-px bg-background/20" />
        <BarButton
          onClick={() => {
            onDelete?.(ids);
            setSelected(new Set());
          }}
        >
          <svg aria-hidden {...STROKE} className="size-4">
            <path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4 4.25l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1" />
          </svg>
          Delete
        </BarButton>
        <BarButton
          onClick={() => {
            onExport?.(ids);
            setExported(true);
            clearTimeout(exportTimer.current);
            // Long enough to register, short enough to export again soon.
            exportTimer.current = setTimeout(() => setExported(false), 1500);
          }}
        >
          <span aria-hidden className="grid size-4">
            <SwapIcon visible={!exported} reduceMotion={reduceMotion}>
              <path d="M8 2.75v7M5 6.75l3 3 3-3M3 11.25v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" />
            </SwapIcon>
            <SwapIcon visible={exported} reduceMotion={reduceMotion}>
              <path d="m3.5 8.5 3 3 6-7" />
            </SwapIcon>
          </span>
          Export
        </BarButton>
      </div>
      <span className="sr-only" aria-live="polite">
        {open ? `${count} selected` : ""}
        {exported ? ", exported" : ""}
      </span>
    </div>
  );
}

function Cell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // Borders live on cells because rows can't carry them with separated
  // borders; the first row's is hidden so the header shadow owns that edge.
  return (
    <td
      className={cn(
        "h-11 border-t border-border px-3 group-first:border-t-transparent",
        className,
      )}
    >
      {children}
    </td>
  );
}

function Checkbox({
  ref,
  checked,
  disabled,
  onChange,
  label,
}: {
  ref?: React.Ref<HTMLInputElement>;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  const mark =
    "pointer-events-none col-start-1 row-start-1 size-3 text-background transition-[scale,opacity,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]";
  // Same numbers as the icon swap recipe: from 0.25 scale and 4px blur.
  const hidden =
    "scale-[0.25] opacity-0 blur-[4px] motion-reduce:scale-100 motion-reduce:blur-[0px]";
  return (
    // A 36px label around the 16px box keeps the target comfortable
    // without making the column any wider.
    <label className="-m-2.5 grid size-9 cursor-pointer place-items-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        className={cn(
          "peer col-start-1 row-start-1 size-4 cursor-pointer appearance-none rounded-[5px] bg-background shadow-[inset_0_0_0_1.5px_var(--border)] outline-hidden disabled:cursor-default disabled:opacity-50",
          "transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-[background-color,box-shadow]",
          "hover:shadow-[inset_0_0_0_1.5px_var(--muted)] checked:bg-foreground checked:shadow-none indeterminate:bg-foreground indeterminate:shadow-none",
          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
        )}
      />
      <svg
        aria-hidden
        {...STROKE}
        strokeWidth={2}
        className={cn(
          mark,
          hidden,
          "peer-checked:scale-100 peer-checked:opacity-100 peer-checked:blur-[0px]",
        )}
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
      <svg
        aria-hidden
        {...STROKE}
        strokeWidth={2}
        className={cn(
          mark,
          hidden,
          "peer-indeterminate:scale-100 peer-indeterminate:opacity-100 peer-indeterminate:blur-[0px]",
        )}
      >
        <path d="M4 8h8" />
      </svg>
    </label>
  );
}

function SortArrow({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      aria-hidden
      {...STROKE}
      className={cn(
        "size-3.5 shrink-0 transition-[rotate,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-[opacity]",
        dir === null && "opacity-0",
        // Points down for descending, the way the values run.
        dir === "desc" ? "rotate-180" : "rotate-0",
      )}
    >
      <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
    </svg>
  );
}

function StatusLabel({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-foreground">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          status === "ready" && "bg-foreground",
          status === "error" && "bg-danger",
          status === "queued" && "shadow-[inset_0_0_0_1.5px_var(--muted)]",
          // A slow pulse marks the only row that is still changing.
          status === "building" &&
            "animate-pulse bg-muted motion-reduce:animate-none",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function BarButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full px-2 font-medium outline-hidden select-none transition-[scale,background-color] duration-150 ease-out hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-background active:scale-[0.96] motion-reduce:transition-[background-color]"
    >
      {children}
    </button>
  );
}

function SwapIcon({
  visible,
  reduceMotion,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean | null;
  children: React.ReactNode;
}) {
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
  return (
    <motion.svg
      {...STROKE}
      className="col-start-1 row-start-1 size-4"
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
    >
      {children}
    </motion.svg>
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

const SAMPLE: Deployment[] = [
  { id: "1", name: "web", status: "ready", branch: "main", duration: 94, date: "2026-09-22" },
  { id: "2", name: "api-gateway", status: "building", branch: "feat/rate-limit", duration: 212, date: "2026-09-23" },
  { id: "3", name: "docs", status: "ready", branch: "main", duration: 41, date: "2026-09-19" },
  { id: "4", name: "billing", status: "error", branch: "fix/invoice-tz", duration: 157, date: "2026-09-21" },
  { id: "5", name: "auth", status: "ready", branch: "release/2.4", duration: 128, date: "2026-09-17" },
  { id: "6", name: "search", status: "queued", branch: "chore/deps", duration: 0, date: "2026-09-23" },
  { id: "7", name: "analytics", status: "ready", branch: "main", duration: 305, date: "2026-09-14" },
  { id: "8", name: "mailer", status: "ready", branch: "feat/digest", duration: 76, date: "2026-09-20" },
];

export default function DataTableDemo() {
  const [rows, setRows] = useState(SAMPLE);
  const full = rows.length === SAMPLE.length;
  return (
    <div className="flex w-[600px] max-w-full flex-col items-end gap-2">
      <DataTable
        rows={rows}
        onDelete={(ids) =>
          setRows((r) => r.filter((row) => !ids.includes(row.id)))
        }
      />
      {/* Always takes its space, so the table never moves when it appears. */}
      <button
        type="button"
        onClick={() => setRows(SAMPLE)}
        inert={full}
        className={cn(
          "h-9 rounded-full px-3 text-sm text-muted outline-hidden select-none transition-[opacity,scale,color,filter] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[opacity,color]",
          full && "opacity-0 blur-[4px] motion-reduce:blur-[0px]",
        )}
      >
        Restore deleted rows
      </button>
    </div>
  );
}
