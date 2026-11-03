"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { loadProgress } from "@/lib/client/db";
import { pct } from "@/lib/game";
import type { ProgressSummary } from "@/lib/types";

function Bars({ title, values, max, format, color }: { title: string; values: { label: string; v: number }[]; max: number; format: (v: number) => string; color: string }) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card/60 p-4">
      <h2 className="font-case text-sm text-primary">{title}</h2>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${title}: ${values.map((x) => format(x.v)).join(", ")}`}>
        {values.map((x, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{format(x.v)}</span>
            <div className="w-full rounded-t" style={{ height: `${Math.max(4, (x.v / (max || 1)) * 100)}%`, background: color }} title={x.label} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>older</span>
        <span>latest</span>
      </div>
    </section>
  );
}

export default function ProgressPage() {
  const [items, setItems] = useState<ProgressSummary[] | null>(null);
  // Reading localStorage after mount avoids a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setItems(loadProgress().sort((a, b) => a.at - b.at)), []);
  const recent = (items ?? []).slice(-12);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar back="/" title="Progress" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pb-12 pt-4">
        {items && items.length === 0 ? (
          <div className="space-y-3 pt-10 text-center">
            <p className="text-sm text-muted-foreground">No cases closed yet. Your trends show up here after your first accusation.</p>
            <Button asChild>
              <Link href="/">Start a case</Link>
            </Button>
          </div>
        ) : null}
        {recent.length ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border bg-card/60 p-3">
                <div className="text-2xl font-semibold">{items!.length}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">cases</div>
              </div>
              <div className="rounded-md border border-border bg-card/60 p-3">
                <div className="text-2xl font-semibold">{items!.filter((x) => x.solved).length}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">right culprit</div>
              </div>
              <div className="rounded-md border border-border bg-card/60 p-3">
                <div className="text-2xl font-semibold">{Math.round(items!.reduce((a, x) => a + x.score, 0) / items!.length)}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">avg score</div>
              </div>
            </div>
            <Bars title="Contradictions caught per case" values={recent.map((x) => ({ label: x.title, v: x.caught }))} max={Math.max(...recent.map((x) => x.totalContradictions), 1)} format={(v) => String(v)} color="var(--chart-1)" />
            <Bars title="Open-question rate" values={recent.map((x) => ({ label: x.title, v: x.openRate }))} max={1} format={pct} color="var(--chart-2)" />
            <Bars title="Follow-up rate" values={recent.map((x) => ({ label: x.title, v: x.followupRate }))} max={1} format={pct} color="var(--chart-4)" />
            <Bars title="Score" values={recent.map((x) => ({ label: x.title, v: x.score }))} max={100} format={(v) => String(v)} color="var(--chart-5)" />
            <ul className="space-y-1 text-sm">
              {[...recent].reverse().map((x) => (
                <li key={x.caseId + x.at} className="flex justify-between rounded border border-border bg-card/40 px-3 py-2">
                  <Link href={`/case/${x.caseId}/debrief`} className="truncate hover:text-primary">
                    {x.title}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">{x.score}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>
    </div>
  );
}
