"use client";
import { Box, FileText, Gavel, Users } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type BoardTab = "scene" | "evidence" | "suspects";

const TABS: { id: BoardTab; label: string; icon: typeof Box }[] = [
  { id: "scene", label: "Scene", icon: Box },
  { id: "evidence", label: "Evidence", icon: FileText },
  { id: "suspects", label: "Suspects", icon: Users },
];

/** Mobile investigation nav. The amber indicator slides between tabs with a spring. */
export function BottomNav({ tab, onTab, evidenceCount, onAccuse }: { tab: BoardTab; onTab: (t: BoardTab) => void; evidenceCount: number; onAccuse: () => void }) {
  return (
    <nav aria-label="Investigation" className="pb-safe grid shrink-0 grid-cols-4 border-t border-cream/10 bg-[#120f0c] pt-1">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <motion.button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            aria-current={active ? "page" : undefined}
            whileTap={{ scale: 0.86 }}
            className={cn("relative flex min-h-14 flex-col items-center justify-center gap-1", active ? "text-amber" : "text-dim")}
          >
            {active ? <motion.span layoutId="nav-indicator" className="absolute top-0 h-[3px] w-9 rounded-b bg-amber" transition={{ type: "spring", stiffness: 500, damping: 30 }} /> : null}
            <motion.span animate={{ y: active ? -2 : 0, scale: active ? 1.12 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
              <Icon className="size-6" strokeWidth={1.8} />
            </motion.span>
            <span className={cn("hud text-[11px]", active && "font-semibold")}>{label}</span>
            {id === "evidence" && evidenceCount ? (
              <motion.span
                key={evidenceCount}
                initial={{ scale: 1.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 600, damping: 12 }}
                className="hud absolute left-[56%] top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber px-1 text-[11px] font-bold text-amber-ink"
              >
                {evidenceCount}
              </motion.span>
            ) : null}
          </motion.button>
        );
      })}
      <motion.button type="button" onClick={onAccuse} whileTap={{ scale: 0.86 }} className="flex min-h-14 flex-col items-center justify-center gap-1 text-danger">
        <Gavel className="size-6" strokeWidth={1.8} />
        <span className="hud text-[11px] font-semibold">Accuse</span>
      </motion.button>
    </nav>
  );
}
