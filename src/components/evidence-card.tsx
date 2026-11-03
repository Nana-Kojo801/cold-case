import { CaseImage } from "@/components/case-image";
import type { Evidence } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EvidenceCard({ e, compact, selected, className }: { e: Evidence; compact?: boolean; selected?: boolean; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-md border border-border bg-card/70 p-2", selected && "border-primary ring-1 ring-primary", className)}>
      <CaseImage
        imageKey={e.imageKey}
        alt={e.label}
        className={cn("shrink-0", compact ? "size-14" : "size-20")}
        fallbackTitle={e.sceneRegionHint ? "Object" : "Document"}
      />
      <div className="min-w-0 flex-1">
        <div className="font-case text-sm text-primary">{e.label}</div>
        <p className={cn("text-xs text-muted-foreground", compact && "line-clamp-2")}>{e.description}</p>
      </div>
    </div>
  );
}
