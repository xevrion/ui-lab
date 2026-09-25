import { sourceUrl } from "@/lab/registry";
import { cn } from "@/lib/cn";
import { Arrow } from "./arrow";

export function SourceLink({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  return (
    <a
      href={sourceUrl(slug)}
      target="_blank"
      rel="noreferrer"
      aria-label={`View source of ${name} on GitHub`}
      className={cn(
        "group/link inline-flex items-center gap-0.5 text-sm text-muted transition-[color,scale] duration-150 ease-out hover:text-foreground active:scale-[0.96] motion-reduce:transition-none",
        className,
      )}
    >
      <span className="relative">
        source
        {/* Draws in from the left on hover, so the link answers the cursor
            without needing a background. */}
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-current transition-[scale] duration-200 ease-out group-hover/link:scale-x-100 motion-reduce:transition-none"
        />
      </span>
      <Arrow
        direction="up-right"
        className="size-3 transition-[translate] duration-150 ease-out group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 motion-reduce:transition-none"
      />
    </a>
  );
}
