"use client";
import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { loadSettings } from "@/lib/client/db";
import { configureSound, suspendAudio, unlockAudio } from "@/lib/client/sfx";

/** Springs by default everywhere (respecting "reduce motion"), and the sound engine's lifecycle. */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const s = loadSettings();
    configureSound({ sfx: s.sfx, ambience: s.ambience });
    // Browsers only start audio after a user gesture.
    const unlock = () => unlockAudio();
    const vis = () => suspendAudio(document.hidden);
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 26 }}>
      {children}
    </MotionConfig>
  );
}
