"use client";
import { Star } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GameLink, TopHud, bounce, listItem, listParent } from "@/components/game/ui";
import { loadProgress } from "@/lib/client/db";
import { gradeFor, pct, rankFor, totalXp } from "@/lib/game";
import type { ProgressSummary } from "@/lib/types";

function Bars({ title, values, max, format, color }: { title: string; values: { label: string; v: number }[]; max: number; format: (v: number) => string; color: string }) {
  return (
    <motion.section variants={listItem} className="rounded-2xl border border-cream/10 bg-panel p-4">
      <h2 className="hud text-sm text-amber">{title}</h2>
      <div className="mt-3 flex h-36 items-end gap-1.5" role="img" aria-label={`${title}: ${values.map((x) => format(x.v)).join(", ")}`}>
        {values.map((x, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-dim">{format(x.v)}</span>
            <motion.div
              className="w-full rounded-t"
              style={{ background: color }}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(4, (x.v / (max || 1)) * 100)}%` }}
              transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.2 + i * 0.05 }}
              title={x.label}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-dimmer">
        <span>older</span>
        <span>latest</span>
      </div>
    </motion.section>
  );
}

export default function ProgressPage() {
  const [items, setItems] = useState<ProgressSummary[] | null>(null);
  // Reading localStorage after mount avoids a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setItems(loadProgress().sort((a, b) => a.at - b.at)), []);
  const all = items ?? [];
  const recent = all.slice(-12);
  const xp = totalXp(all);
  const rank = rankFor(xp);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopHud back="/" kicker="Detective records" title="Your progress" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pb-12 pt-4">
        <motion.div initial={{ opacity: 0, y: 30, rotate: 3 }} animate={{ opacity: 1, y: 0, rotate: 0.8 }} transition={bounce} className="relative bg-paper p-5 text-paper-ink shadow-[0_20px_44px_rgba(0,0,0,0.55)]">
          <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rounded-full bg-danger shadow" />
          <div className="hud text-xs text-paper-muted">Personnel file</div>
          <div className="mt-2 flex items-center gap-3.5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-paper-ink">
              <Star className="size-7" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="tw text-2xl">{rank.name}</div>
              <div className="mt-2 h-1.5 bg-paper-ink/15">
                <motion.div className="h-full bg-paper-ink" initial={{ width: 0 }} animate={{ width: `${rank.progress * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.3 }} />
              </div>
              <div className="tw mt-1.5 text-[13px] text-paper-muted">{rank.nextAt ? `${xp} / ${rank.nextAt} XP to ${rank.nextName}` : `${xp} XP · top rank`}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-paper-ink/35 pt-3">
            <div><div className="hud text-2xl font-bold">{all.length}</div><div className="tw text-xs text-paper-muted">cases played</div></div>
            <div><div className="hud text-2xl font-bold">{all.filter((x) => x.solved).length}</div><div className="tw text-xs text-paper-muted">right culprit</div></div>
            <div><div className="hud text-2xl font-bold">{all.length ? Math.round(all.reduce((a, x) => a + x.score, 0) / all.length) : "–"}</div><div className="tw text-xs text-paper-muted">avg score</div></div>
          </div>
        </motion.div>

        {items && all.length === 0 ? (
          <div className="space-y-3 pt-6 text-center">
            <p className="text-sm text-dim">No cases closed yet. Your trends appear here after your first accusation.</p>
            <GameLink href="/">Start a case</GameLink>
          </div>
        ) : null}

        {recent.length ? (
          <motion.div variants={listParent} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
            <Bars title="Lies caught per case" values={recent.map((x) => ({ label: x.title, v: x.caught }))} max={Math.max(...recent.map((x) => x.totalContradictions), 1)} format={(v) => String(v)} color="#f0a83a" />
            <Bars title="Score" values={recent.map((x) => ({ label: x.title, v: x.score }))} max={100} format={(v) => String(v)} color="#b3a48c" />
            <Bars title="Open-question rate" values={recent.map((x) => ({ label: x.title, v: x.openRate }))} max={1} format={pct} color="#7aa0c4" />
            <Bars title="Follow-up rate" values={recent.map((x) => ({ label: x.title, v: x.followupRate }))} max={1} format={pct} color="#7fb08a" />
          </motion.div>
        ) : null}

        {recent.length ? (
          <section className="space-y-2">
            <h2 className="hud text-xs text-dim">Case files</h2>
            {[...recent].reverse().map((x, i) => (
              <motion.div key={x.caseId + x.at} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...bounce, delay: 0.3 + i * 0.04 }}>
                <Link href={`/case/${x.caseId}/debrief`} className="flex items-center gap-3 rounded-xl border border-cream/10 bg-panel px-3.5 py-3 transition-colors hover:border-amber/50">
                  <span className="h-[26px] w-[34px] shrink-0 rounded-[2px_6px_3px_3px] bg-manila" />
                  <span className="tw min-w-0 flex-1 truncate">{x.title}</span>
                  <span className="text-xs text-dimmer">{x.score}</span>
                  <span className={`hud w-8 text-right ${x.solved ? "text-amber" : "text-dim"}`}>{x.grade ?? gradeFor(x.score)}</span>
                </Link>
              </motion.div>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
