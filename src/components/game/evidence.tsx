"use client";
import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { CaseImage } from "@/components/case-image";
import type { Evidence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pin, bounce } from "./ui";

const TILTS = [-3, 2.5, 1.5, -2, 2, -1.5, 2.8, -2.4];
const PINS = ["#e0574a", "#f0a83a", "#7aa0c4", "#e0574a", "#f0a83a", "#7aa0c4"];

export function tiltFor(i: number) {
  return TILTS[i % TILTS.length];
}

/** A piece of evidence pinned to the corkboard: a polaroid if it has a photo, else a typed paper slip. */
export function EvidencePiece({
  e,
  index,
  selected,
  isNew,
  compact,
  onClick,
}: {
  e: Evidence;
  index: number;
  selected?: boolean;
  isNew?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const tilt = tiltFor(index);
  const photo = Boolean(e.imageKey);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={e.label}
      initial={{ opacity: 0, y: -24, rotate: tilt * 3, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, rotate: selected ? 0 : tilt, scale: selected ? 1.04 : 1 }}
      whileHover={{ rotate: 0, scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.95 }}
      transition={{ ...bounce, delay: index * 0.05 }}
      className={cn(
        "relative block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-amber",
        photo ? "bg-[#f2ecdf] p-2 pb-2.5" : "lined bg-paper-2 px-3 py-3",
        "text-paper-ink shadow-[0_10px_22px_rgba(0,0,0,0.55)]",
        selected && "shadow-[0_0_0_3px_#f0a83a,0_14px_30px_rgba(0,0,0,0.6)]",
      )}
    >
      <Pin color={selected ? "#f0a83a" : PINS[index % PINS.length]} />
      {isNew ? (
        <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 6 }} transition={{ type: "spring", stiffness: 600, damping: 12, delay: 0.3 }} className="hud absolute -right-2 top-3 z-10 bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
          New
        </motion.span>
      ) : null}
      {photo ? (
        <>
          <CaseImage imageKey={e.imageKey} alt="" className={cn("block w-full rounded-none", compact ? "aspect-square" : "aspect-[6/5]")} fallbackTitle={e.label} />
          <span className={cn("tw mt-1.5 block text-center leading-tight", compact ? "text-[11px]" : "text-[13px]")}>{e.label}</span>
        </>
      ) : (
        <>
          <span className="hud block text-[10px] text-paper-muted">{e.label}</span>
          <span className={cn("tw mt-1 block leading-[1.45]", compact ? "line-clamp-4 text-[11px]" : "line-clamp-6 text-[12px]")}>{e.description}</span>
        </>
      )}
    </motion.button>
  );
}

export function LockedPiece({ label = "Hidden in the scene", compact }: { label?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-cream/25 bg-ink/35 text-dimmer", compact ? "min-h-24" : "min-h-32")}>
      <Lock className="size-6" />
      <span className="hud text-center text-[11px]">{label}</span>
    </div>
  );
}
