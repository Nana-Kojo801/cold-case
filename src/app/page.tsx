"use client";
import { BarChart3, BookOpen, Play, Star, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GameButton, GameLink, IconButton, Pressable, ProgressBar, Sheet, Stamp, bounce, listItem, listParent } from "@/components/game/ui";
import { getHealth } from "@/lib/client/api";
import { DEMO_CASE_ID, listCases, loadDemoCase, loadProgress, loadSession, loadSettings, saveSettings } from "@/lib/client/db";
import { gradeFor, rankFor, totalXp } from "@/lib/game";
import type { CaseFile, ProgressSummary, Session } from "@/lib/types";

const SCENE_BG = "/demo-case/scene.jpg";

type Continue = { c: CaseFile; s: Session } | null;

export default function Home() {
  const router = useRouter();
  const [ai, setAi] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<ProgressSummary[]>([]);
  const [resume, setResume] = useState<Continue>(null);
  const [voice, setVoice] = useState(true);
  const [sheet, setSheet] = useState<"new" | "how" | null>(null);
  const [theme, setTheme] = useState("");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    getHealth().then((h) => setAi(h.ai));
    // localStorage/IndexedDB are read after mount to avoid hydration mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(loadProgress().sort((a, b) => b.at - a.at));
    setVoice(loadSettings().voice);
    (async () => {
      const cases = await listCases();
      let best: Continue = null;
      let bestAt = -1;
      for (const c of cases) {
        const s = await loadSession(c.id);
        if (!s || s.result || s.ledger.length + s.collectedEvidenceIds.length === 0) continue;
        const at = Math.max(s.startedAt ?? 0, ...s.ledger.map((e) => e.at ?? 0));
        if (at > bestAt) {
          best = { c, s };
          bestAt = at;
        }
      }
      setResume(best);
    })();
  }, []);

  const xp = totalXp(progress);
  const rank = rankFor(xp);
  const solvedCount = progress.filter((p) => p.solved).length;
  const caught = progress.reduce((a, p) => a + p.caught, 0);
  const openRate = progress.length ? Math.round((progress.reduce((a, p) => a + p.openRate, 0) / progress.length) * 100) : 0;

  async function playDemo() {
    setOpening(true);
    try {
      await loadDemoCase();
      router.push(`/case/${DEMO_CASE_ID}`);
    } catch {
      toast.error("Couldn't open the training case. Please retry.");
      setOpening(false);
    }
  }

  function startNew() {
    const q = theme.trim() ? `?theme=${encodeURIComponent(theme.trim())}` : "";
    router.push(`/new${q}`);
  }

  function toggleVoice() {
    const v = !voice;
    setVoice(v);
    saveSettings({ ...loadSettings(), voice: v });
  }

  const sceneClues = resume ? resume.c.evidence.length : 0;
  const found = resume ? resume.s.collectedEvidenceIds.length : 0;

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden">
      { }
      <motion.img
        src={SCENE_BG}
        alt=""
        initial={{ scale: 1.15, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.6 }}
        transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute inset-0 h-[70%] w-full object-cover object-[70%_50%] lg:h-full"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(13,11,9,0.25)_0%,rgba(13,11,9,0.6)_38%,#0d0b09_66%)] lg:bg-[linear-gradient(90deg,#0d0b09_0%,rgba(13,11,9,0.92)_34%,rgba(13,11,9,0.35)_70%,rgba(13,11,9,0.6)_100%)]" />

      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-5 pb-5 pt-5 lg:px-16 lg:pb-10 lg:pt-14">
        <div className="flex items-center justify-between lg:hidden">
          <span className="hud text-xs text-dim">Case files · {solvedCount} closed</span>
          <IconButton label={voice ? "Turn suspect voices off" : "Turn suspect voices on"} onClick={toggleVoice}>
            {voice ? <Volume2 /> : <VolumeX />}
          </IconButton>
        </div>

        <div className="flex flex-1 flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          {/* Logo + menu */}
          <div className="flex flex-1 flex-col lg:max-w-[560px]">
            <div className="relative mt-16 lg:mt-0">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hud text-xs tracking-[0.32em] text-amber lg:text-sm">
                A cross-examination game
              </motion.div>
              <div className="relative inline-block">
              <h1 className="hud mt-2.5 text-[96px] font-bold leading-[0.86] tracking-[0.02em] lg:text-[136px]">
                {["Cold", "Case"].map((w, i) => (
                  <motion.span key={w} className="block" initial={{ y: 60, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 + i * 0.12 }}>
                    {w}
                  </motion.span>
                ))}
              </h1>
              <Stamp delay={0.75} className="absolute -right-20 top-[96px] text-xl lg:-right-36 lg:top-[138px] lg:text-[28px]">
                Unsolved
              </Stamp>
              </div>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="tw mt-4 text-[15px] text-[#d6c9b0] lg:text-xl">
                Every witness lies. Catch them in it.
              </motion.p>
            </div>

            <motion.nav variants={listParent} initial="hidden" animate="show" aria-label="Main menu" className="mt-auto flex flex-col gap-3 pt-10 lg:mt-12 lg:gap-1.5">
              {/* Rank card (mobile only; desktop shows the personnel file) */}
              <motion.div variants={listItem} className="flex items-center gap-3.5 rounded-2xl border border-cream/12 bg-raised/90 p-3.5 lg:hidden">
                <RankBadge />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="hud text-[15px] font-semibold">{rank.name}</span>
                    <span className="hud text-[11px] text-dim">{rank.nextAt ? `${xp} / ${rank.nextAt} XP` : `${xp} XP`}</span>
                  </div>
                  <ProgressBar value={rank.progress * 100} className="mt-2 h-1.5" />
                  <div className="mt-1.5 text-xs text-dim">{rank.nextName ? `Next rank: ${rank.nextName}` : "Top rank"}{progress.length ? ` · ${progress.length} case${progress.length > 1 ? "s" : ""} played` : ""}</div>
                </div>
              </motion.div>

              {resume ? (
                <motion.div variants={listItem}>
                  <GameLink href={`/case/${resume.c.id}`} size="xl" className="h-auto min-h-[68px] w-full justify-start gap-3.5 px-5 py-3 lg:max-w-[460px]">
                    <Play className="size-6 fill-current" />
                    <span className="flex-1 text-left">
                      <span className="block text-xl lg:text-[26px]">Continue case</span>
                      <span className="block font-sans text-[13px] font-medium normal-case tracking-normal lg:text-[15px]">
                        {resume.c.title} · {found} of {sceneClues} clues
                      </span>
                    </span>
                  </GameLink>
                </motion.div>
              ) : null}

              <motion.div variants={listItem} className="grid grid-cols-2 gap-3 lg:hidden">
                <Pressable onClick={() => setSheet("new")} disabled={ai === false} className="flex min-h-[76px] flex-col justify-center gap-1 rounded-2xl border-[1.5px] border-amber/60 bg-ink/70 px-3.5 text-left disabled:opacity-45">
                  <span className="hud text-base font-semibold text-amber">New case</span>
                  <span className="text-xs text-dim">{ai === false ? "Offline right now" : "Fresh mystery, every time"}</span>
                </Pressable>
                <Pressable onClick={playDemo} disabled={opening} className="flex min-h-[76px] flex-col justify-center gap-1 rounded-2xl border-[1.5px] border-cream/20 bg-ink/70 px-3.5 text-left">
                  <span className="hud text-base font-semibold">{opening ? "Opening..." : "Training case"}</span>
                  <span className="text-xs text-dim">Learn the ropes</span>
                </Pressable>
              </motion.div>

              {/* Desktop text menu */}
              <div className="hidden flex-col lg:flex">
                <MenuItem onClick={() => setSheet("new")} disabled={ai === false} accent hint={ai === false ? "offline right now" : "a fresh mystery, built for you"}>
                  New case
                </MenuItem>
                <MenuItem onClick={playDemo}>{opening ? "Opening..." : "Training case"}</MenuItem>
                <MenuItem href="/progress">Records</MenuItem>
                <MenuItem onClick={() => setSheet("how")}>How to play</MenuItem>
              </div>

              <motion.div variants={listItem} className="mt-1 grid grid-cols-3 gap-2 lg:hidden">
                <Link href="/progress" className="flex min-h-[52px] flex-col items-center justify-center gap-1 text-[#d6c9b0]">
                  <BarChart3 className="size-5" />
                  <span className="hud text-[11px]">Records</span>
                </Link>
                <button type="button" onClick={() => setSheet("how")} className="flex min-h-[52px] flex-col items-center justify-center gap-1 text-[#d6c9b0]">
                  <BookOpen className="size-5" />
                  <span className="hud text-[11px]">How to play</span>
                </button>
                <button type="button" onClick={toggleVoice} className="flex min-h-[52px] flex-col items-center justify-center gap-1 text-[#d6c9b0]">
                  {voice ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                  <span className="hud text-[11px]">Voices {voice ? "on" : "off"}</span>
                </button>
              </motion.div>
            </motion.nav>
          </div>

          {/* Desktop personnel file + recent files */}
          <div className="hidden w-[400px] shrink-0 flex-col gap-5 lg:ml-auto lg:mt-16 lg:flex">
            <motion.div initial={{ opacity: 0, y: 40, rotate: 6 }} animate={{ opacity: 1, y: 0, rotate: 1.5 }} transition={{ ...bounce, delay: 0.5 }} className="relative bg-paper p-6 text-paper-ink shadow-[0_24px_50px_rgba(0,0,0,0.6)]">
              <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rounded-full bg-danger shadow" />
              <div className="hud text-xs text-paper-muted">Personnel file</div>
              <div className="mt-2.5 flex items-center gap-3.5">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-paper-ink">
                  <Star className="size-7" strokeWidth={1.8} />
                </div>
                <div className="flex-1">
                  <div className="tw text-[22px]">{rank.name}</div>
                  <div className="mt-2 h-1.5 bg-paper-ink/15">
                    <motion.div className="h-full bg-paper-ink" initial={{ width: 0 }} animate={{ width: `${rank.progress * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.8 }} />
                  </div>
                  <div className="tw mt-1.5 text-[13px] text-paper-muted">{rank.nextAt ? `${xp} / ${rank.nextAt} XP to ${rank.nextName}` : `${xp} XP`}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-dashed border-paper-ink/35 pt-3.5">
                <FileStat value={String(solvedCount)} label="cases closed" />
                <FileStat value={String(caught)} label="lies caught" />
                <FileStat value={progress.length ? `${openRate}%` : "–"} label="open questions" />
              </div>
            </motion.div>
            {progress.length ? (
              <div className="flex flex-col gap-2">
                <div className="hud text-xs text-dim">Recent files</div>
                {progress.slice(0, 3).map((p, i) => (
                  <motion.div key={p.caseId + p.at} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ ...bounce, delay: 0.7 + i * 0.08 }}>
                    <Link href={`/case/${p.caseId}/debrief`} className="flex items-center gap-3 rounded-xl border border-cream/10 bg-panel/90 px-3.5 py-3 transition-colors hover:border-amber/50">
                      <span className="h-[26px] w-[34px] shrink-0 rounded-[2px_6px_3px_3px] bg-manila" />
                      <span className="tw flex-1 truncate text-[15px]">{p.title}</span>
                      <span className={`hud text-sm ${p.solved ? "text-amber" : "text-dim"}`}>{p.grade ?? gradeFor(p.score)}</span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-3 text-[11px] text-dimmer lg:justify-between lg:text-[13px]">
          <span>Powered by Meta Muse models · No sign-up · Everything stays on your device</span>
          <button type="button" onClick={toggleVoice} className="hud hidden items-center gap-2 text-[#d6c9b0] lg:flex">
            {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Voices {voice ? "on" : "off"}
          </button>
        </div>
      </div>

      <Sheet open={sheet === "new"} onClose={() => setSheet(null)} title="Open a new case">
        <p className="text-sm text-dim">A brand-new mystery is written, checked for fairness and illustrated for you. It takes a minute or two.</p>
        <label className="mt-4 block">
          <span className="hud text-xs text-dim">Setting idea (optional)</span>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startNew()}
            placeholder="A 1920s jazz club, a ski lodge..."
            className="mt-1.5 h-12 w-full rounded-xl border border-cream/15 bg-ink px-3.5 text-[15px] text-cream outline-none placeholder:text-dimmer focus:border-amber/60"
          />
        </label>
        <GameButton size="lg" className="mt-4 w-full" onClick={startNew}>
          Build the case
        </GameButton>
      </Sheet>

      <Sheet open={sheet === "how"} onClose={() => setSheet(null)} title="How to play">
        <ol className="space-y-3">
          {[
            ["Search the scene", "Tap objects in the crime scene to collect clues. Documents start in your file."],
            ["Question the suspects", "Hold the mic and ask out loud. Everyone is hiding something, and they remember what they told you."],
            ["Break their stories", "Pin them to times and places, then show the evidence that doesn't fit. Push hard enough and they crack."],
            ["Make your accusation", "Name the culprit and cite your evidence. The debrief shows the lies you caught and missed, and how you questioned."],
          ].map(([t, d], i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...bounce, delay: 0.1 + i * 0.07 }} className="flex gap-3">
              <span className="hud flex size-8 shrink-0 items-center justify-center rounded-full bg-amber text-sm font-bold text-amber-ink">{i + 1}</span>
              <span>
                <span className="hud block text-[15px] font-semibold">{t}</span>
                <span className="block text-sm text-dim">{d}</span>
              </span>
            </motion.li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}

function RankBadge() {
  return (
    <motion.div initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.5 }} className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-amber text-amber">
      <Star className="size-6" strokeWidth={1.8} />
    </motion.div>
  );
}

function FileStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="hud text-[28px] font-bold leading-tight">{value}</div>
      <div className="tw text-xs text-paper-muted">{label}</div>
    </div>
  );
}

function MenuItem({ children, onClick, href, disabled, accent, hint }: { children: React.ReactNode; onClick?: () => void; href?: string; disabled?: boolean; accent?: boolean; hint?: string }) {
  const inner = (
    <>
      <motion.span className={`h-0.5 w-[26px] ${accent ? "bg-amber" : "bg-cream/30"}`} variants={{ rest: { width: 26 }, hover: { width: 44 } }} />
      <span>{children}</span>
      {hint ? <span className="font-sans text-[15px] font-normal normal-case tracking-normal text-dim">{hint}</span> : null}
    </>
  );
  const cls = "hud flex items-center gap-3.5 px-5 py-3 text-[26px] font-semibold text-cream disabled:opacity-45";
  return (
    <motion.div variants={listItem}>
      <motion.div initial="rest" whileHover="hover" whileTap={{ scale: 0.97 }} animate="rest" variants={{ rest: { x: 0 }, hover: { x: 8 } }} transition={bounce}>
        {href ? (
          <Link href={href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button type="button" onClick={onClick} disabled={disabled} className={cls}>
            {inner}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

