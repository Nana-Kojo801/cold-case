"use client";
import { Check, Gavel } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { CaseImage } from "@/components/case-image";
import { GameButton, Pressable, Stamp, TopHud, bounce, listItem, listParent, pop } from "@/components/game/ui";
import { MicButton } from "@/components/mic-button";
import { ErrorPanel, Loading } from "@/components/shell";
import { addProgress } from "@/lib/client/db";
import { sfx } from "@/lib/client/sfx";
import { useCase } from "@/lib/client/useCase";
import { gradeFor, scoreSession, xpFor } from "@/lib/game";
import { cn } from "@/lib/utils";

export default function AccusePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { caseFile, session, error, update, sessionRef } = useCase(id);
  const [culprit, setCulprit] = useState<string | null>(null);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [statementIds, setStatementIds] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [slam, setSlam] = useState(false);

  if (error) return <ErrorPanel message={error} />;
  if (!caseFile || !session) return <Loading />;

  const collected = caseFile.evidence.filter((e) => session.collectedEvidenceIds.includes(e.id));
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const name = (sid: string) => caseFile.suspects.find((s) => s.id === sid)?.name ?? sid;
  const statements = [...session.ledger].sort((a, b) => (a.suspectId === culprit ? -1 : 0) - (b.suspectId === culprit ? -1 : 0));

  function submit() {
    if (!caseFile || !culprit) return;
    if (evidenceIds.length === 0) {
      toast.message("Cite at least one exhibit that proves it.");
      return;
    }
    update((s) => ({ ...s, accusation: { suspectId: culprit, evidenceIds, statementIds, reasoning: reasoning.trim() } }));
    const result = scoreSession(caseFile, sessionRef.current!);
    update((x) => ({ ...x, result }));
    addProgress({
      caseId: caseFile.id,
      title: caseFile.title,
      at: Date.now(),
      score: result.score,
      solved: result.culpritCorrect,
      caught: result.caught.length,
      totalContradictions: caseFile.solution.keyContradictions.length,
      openRate: result.stats.openRate,
      followupRate: result.stats.followupRate,
      questions: result.stats.questions,
      xp: xpFor(result.score, result.culpritCorrect),
      grade: gradeFor(result.score),
    });
    setSlam(true);
    sfx("gavel");
    navigator.vibrate?.([30, 60, 120]);
    setTimeout(() => router.push(`/case/${id}/debrief`), 1300);
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_35%_at_50%_15%,rgba(224,87,74,0.16),transparent_70%)]" />
      <TopHud back={`/case/${id}`} kicker={caseFile.title} kickerClass="text-danger" title="Accusation" />
      <main className="relative mx-auto w-full max-w-3xl flex-1 space-y-7 px-[18px] pb-36 pt-3">
        <motion.h1 initial={{ y: 30, opacity: 0, rotate: -3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} className="hud text-[46px] font-bold leading-none lg:text-6xl">
          Who did it?
        </motion.h1>

        <motion.div variants={listParent} initial="hidden" animate="show" className={cn("grid gap-2.5", caseFile.suspects.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
          {caseFile.suspects.map((s) => {
            const on = culprit === s.id;
            return (
              <motion.div key={s.id} variants={listItem}>
                <Pressable
                  onClick={() => {
                    if (culprit !== s.id) sfx("select");
                    setCulprit(s.id);
                  }}
                  aria-pressed={on}
                  className={cn("relative block w-full overflow-hidden rounded-xl border text-left transition-colors", on ? "border-2 border-danger bg-[#2a1411] shadow-[0_0_28px_rgba(224,87,74,0.35)]" : "border-cream/14 bg-panel")}
                >
                  <motion.div animate={{ opacity: culprit && !on ? 0.5 : 1 }}>
                    <CaseImage imageKey={s.portrait.imageKey} alt="" className={cn("aspect-[4/5] w-full rounded-none transition-[filter]", culprit && !on && "grayscale-[60%]")} fallbackTitle={s.name.split(" ")[0]} />
                    <span className={cn("hud block truncate p-2 text-[13px]", on && "font-semibold")}>{s.name}</span>
                  </motion.div>
                  <AnimatePresence>
                    {on ? (
                      <motion.span initial={{ scale: 2.4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 14 }} className="hud absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap bg-danger px-2 py-0.5 text-xs font-bold text-white">
                        Accused
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </Pressable>
              </motion.div>
            );
          })}
        </motion.div>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="hud text-sm font-semibold">Exhibits</h2>
            <span className="text-xs text-dim">Cite what proves it · {evidenceIds.length} cited</span>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {collected.map((e, i) => {
              const k = evidenceIds.indexOf(e.id);
              const on = k >= 0;
              return (
                <Pressable key={e.id} onClick={() => {
                    sfx("pin");
                    toggle(evidenceIds, setEvidenceIds, e.id);
                  }} aria-pressed={on} aria-label={`Cite ${e.label}`} className="relative aspect-square">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: on ? 1.04 : 1, rotate: on ? 0 : i % 2 ? 1.5 : -1.5 }}
                    transition={{ ...bounce, delay: i * 0.03 }}
                    className={cn("h-full w-full overflow-hidden rounded-md", on ? "shadow-[0_0_0_2.5px_#f0a83a]" : "opacity-75")}
                  >
                    {e.imageKey ? (
                      <CaseImage imageKey={e.imageKey} alt="" className="h-full w-full rounded-none" />
                    ) : (
                      <span className="tw flex h-full w-full items-center justify-center bg-paper p-1.5 text-center text-[10px] leading-tight text-paper-ink">{e.label}</span>
                    )}
                  </motion.div>
                  <AnimatePresence>
                    {on ? (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={pop} className="hud absolute left-1 top-1 bg-ink/80 px-1 text-[9px] text-amber">
                        Exhibit {String.fromCharCode(65 + k)}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </Pressable>
              );
            })}
          </div>
          <p className="mt-2 truncate text-xs text-dimmer">{evidenceIds.map((x) => caseFile.evidence.find((e) => e.id === x)?.label).join(" · ") || "Tap evidence to cite it."}</p>
        </section>

        <section>
          <h2 className="hud text-sm font-semibold">Lies on the record (optional)</h2>
          {statements.length === 0 ? <p className="mt-2 text-sm text-dim">You haven&apos;t questioned anyone yet.</p> : null}
          <div className="mt-2.5 flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
            {statements.map((e) => {
              const on = statementIds.includes(e.id);
              return (
                <Pressable key={e.id} onClick={() => toggle(statementIds, setStatementIds, e.id)} aria-pressed={on} className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors", on ? "border-amber/60 bg-raised" : "border-cream/10 bg-panel")}>
                  <motion.span animate={{ scale: on ? 1 : 0.8, backgroundColor: on ? "#f0a83a" : "rgba(0,0,0,0)" }} transition={pop} className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-amber/60 text-amber-ink">
                    {on ? <Check className="size-3" strokeWidth={3.5} /> : null}
                  </motion.span>
                  <span className="min-w-0">
                    <span className="hud block text-[10px] text-dimmer">{name(e.suspectId)} · Q{e.turn}</span>
                    <span className="tw block text-[13px] leading-snug">&ldquo;{e.suspectAnswer}&rdquo;</span>
                  </span>
                </Pressable>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="hud text-sm font-semibold">Closing argument (optional)</h2>
          <div className="mt-2.5 flex items-end gap-2.5 rounded-xl border border-dashed border-cream/25 p-3">
            <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={2} placeholder="Say or type how the pieces fit together" className="min-h-12 flex-1 resize-none bg-transparent text-[15px] text-cream outline-none placeholder:text-dimmer" />
            <MicButton size="sm" onTranscript={(t) => setReasoning((r) => (r ? `${r} ${t}` : t))} />
          </div>
        </section>
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-[linear-gradient(180deg,rgba(13,11,9,0)_0%,#0d0b09_35%)] px-[18px] pt-6">
        <div className="mx-auto max-w-3xl">
          <GameButton variant="danger" size="xl" className="w-full" disabled={!culprit || slam} onClick={submit}>
            <Gavel className="size-6" /> {culprit ? `Accuse ${name(culprit)}` : "Choose a suspect"}
          </GameButton>
          <p className="tw mt-2 text-center text-[13px] text-dimmer">No take-backs, detective.</p>
        </div>
      </div>

      <AnimatePresence>
        {slam ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-ink/90 backdrop-blur-sm">
            <motion.div initial={{ rotate: -70, y: -40, opacity: 0 }} animate={{ rotate: [-70, 12, 0], y: [-40, 0, 0], opacity: 1 }} transition={{ duration: 0.5, times: [0, 0.7, 1], ease: "easeIn" }} className="text-danger">
              <Gavel className="size-28" strokeWidth={1.6} />
            </motion.div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.6, 1], opacity: [0, 0.5, 0] }} transition={{ duration: 0.7, delay: 0.45 }} className="absolute size-64 rounded-full border-4 border-danger" />
            <Stamp tone="danger" rotate={-8} delay={0.5} className="text-4xl">
              {culprit ? name(culprit) : ""}
            </Stamp>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
