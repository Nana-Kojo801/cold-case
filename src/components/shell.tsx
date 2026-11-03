"use client";
import { motion } from "motion/react";
import { GameButton } from "@/components/game/ui";

export function ErrorPanel({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-5 text-center"
      role="alert"
    >
      <p className="text-sm">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry ? <GameButton onClick={onRetry}>Retry</GameButton> : null}
        {children}
      </div>
    </motion.div>
  );
}

export function Loading({ label = "Opening the file..." }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-dim">
      <div className="flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-3 rounded-full bg-amber" animate={{ y: [0, -12, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.14 }} />
        ))}
      </div>
      <span className="tw text-sm">{label}</span>
    </div>
  );
}
