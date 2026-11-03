"use client";
import { CloudRain, Music2, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { loadSettings, saveSettings, type Settings } from "@/lib/client/db";
import { sfx, unlockAudio } from "@/lib/client/sfx";
import { cn } from "@/lib/utils";

const ROWS: { key: keyof Settings; label: string; hint: string; icon: typeof Volume2 }[] = [
  { key: "voice", label: "Suspect voices", hint: "Suspects read their answers aloud", icon: Volume2 },
  { key: "sfx", label: "Sound effects", hint: "Stamps, chimes, typewriter keys, the gavel", icon: Music2 },
  { key: "ambience", label: "Rain ambience", hint: "Quiet rain and distant thunder. Pauses while you speak", icon: CloudRain },
];

/** Three toggles for the game's audio. Changes apply instantly. */
export function SoundSettings({ onChange }: { onChange?: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(() => (typeof window === "undefined" ? { voice: true, sfx: true, ambience: true } : loadSettings()));

  function toggle(key: keyof Settings) {
    const next = { ...s, [key]: !s[key] };
    setS(next);
    saveSettings(next);
    unlockAudio();
    if (key === "sfx" && next.sfx) sfx("found");
    onChange?.(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {ROWS.map(({ key, label, hint, icon: Icon }) => {
        const on = s[key];
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => toggle(key)}
            className="flex items-center gap-3.5 rounded-2xl border border-cream/10 bg-raised p-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            <Icon className={cn("size-5 shrink-0", on ? "text-amber" : "text-dimmer")} />
            <span className="min-w-0 flex-1">
              <span className="hud block text-[15px] font-semibold">{label}</span>
              <span className="block text-xs text-dim">{hint}</span>
            </span>
            <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-amber" : "bg-well")}>
              <motion.span
                className="absolute top-1 size-5 rounded-full bg-cream shadow"
                animate={{ left: on ? 24 : 4 }}
                transition={{ type: "spring", stiffness: 600, damping: 22 }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
