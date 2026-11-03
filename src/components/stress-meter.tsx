import { CRACK_THRESHOLD, NERVOUS_THRESHOLD } from "@/lib/game";
import { cn } from "@/lib/utils";

export function StressMeter({ value, cracked, className }: { value: number; cracked?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const label = cracked || v >= CRACK_THRESHOLD ? "Cracking" : v >= NERVOUS_THRESHOLD ? "Nervous" : "Composed";
  const color = cracked || v >= CRACK_THRESHOLD ? "var(--stress-high)" : v >= NERVOUS_THRESHOLD ? "var(--stress-mid)" : "var(--stress-low)";
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Stress</span>
        <span style={{ color }}>{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label="Suspect stress">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  );
}
