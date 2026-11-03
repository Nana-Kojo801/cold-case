"use client";
import { MotionConfig } from "motion/react";

/** Springs by default everywhere; respects the OS "reduce motion" setting. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 26 }}>
      {children}
    </MotionConfig>
  );
}
