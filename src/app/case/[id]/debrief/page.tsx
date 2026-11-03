"use client";
import { ArrowLeft, Check, ChevronDown, Lightbulb, Loader2, RotateCcw, ScrollText, X } from "lucide-react";
import { motion, useMotionValue, useTransform, animate as animateValue } from "motion/react";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { CountUp, GameButton, GameLink, IconLink, ProgressBar, Stamp, bounce, listItem, listParent, pop } from "@/components/game/ui";
import { ErrorPanel, Loading } from "@/components/shell";
import { getHealth, postJson } from "@/lib/client/api";
import { loadProgress, resetSession } from "@/lib/client/db";
import { useCase } from "@/lib/client/useCase";
import { sfx } from "@/lib/client/sfx";
import { gradeFor, pct, rankFor, totalXp, xpFor } from "@/lib/game";
import { REASONING_ERROR_TEXT, type CaseFile, type Debrief, type ReasoningErrorLabel, type Session } from "@/lib/types";

type AI = {
  summary: string;
  tip: string;
  missed: { contradictionId: string; errorLabel: ReasoningErrorLabel; errorExplanation: string }[];
  caughtNotes: { contradictionId: string; how: string }[];
};

/** Structured inputs for Muse Wonder's debrief: ledger, tags and results only, no free chat. */
function debriefInput(c: CaseFile, s: Session, d: Debrief) {
  const name = (id?: string) => c.suspects.find((x) => x.id === id)?.name ?? "unknown";
  const label = (id: string) => c.evidence.find((e) => e.id === id)?.label ?? id;
  return {
    case: { title: c.title, culprit: name(c.truth.culpritId), motive: c.truth.motive, method: c.truth.method },
    accusation: { accused: name(s.accusation?.suspectId), evidenceCited: (s.accusation?.evidenceIds ?? []).map(label), reasoning: s.accusation?.reasoning ?? "" },
    verdict: d.verdict,
    score: d.score,
    breakdown: d.breakdown,
    requiredEvidence: c.solution.requiredEvidenceIds.map(label),
    caught: d.caught.map((x) => ({ id: x.contradictionId, between: x.between, explanation: x.explanation })),
    missed: d.missed.map((x) => {
      const k = c.solution.keyContradictions.find((y) => y.id === x.contradictionId);
      return {
        id: x.contradictionId,
        between: x.between,
        explanation: x.explanation,
        suspect: name(k?.suspectId),
        timesQuestioned: s.ledger.filter((e) => e.suspectId === k?.suspectId).length,
        exposingEvidence: (k?.evidenceIds ?? []).map(label),
        exposingEvidenceCollected: (k?.evidenceIds ?? []).some((id) => s.collectedEvidenceIds.includes(id)),
        exposingEvidenceShownToSuspect: s.presentedEvidence.some((p) => p.suspectId === k?.suspectId && (k?.evidenceIds ?? []).includes(p.evidenceId)),
      };
    }),
    ledger: s.ledger.slice(0, 60).map((e) => ({
      suspect: name(e.suspectId),
      turn: e.turn,
      question: e.playerQuestion,
      shown: e.presentedEvidenceId ? label(e.presentedEvidenceId) : null,
      answer: e.suspectAnswer,
      tags: e.questionTags,
    })),
    stats: d.stats,
    caughtIds: d.caught.map((x) => x.contradictionId),
    missedIds: d.missed.map((x) => x.contradictionId),
  };
}

export default function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { caseFile, session, error, update } = useCase(id);
  const [coaching, setCoaching] = useState(false);
  const [xpState, setXpState] = useState<{ before: number; after: number } | null>(null);
  const asked = useRef(false);

  const result = session?.result;

  // XP before/after this case, from the progress history (read after mount).
  useEffect(() => {
    if (!result || !caseFile) return;
    const all = loadProgress();
    const after = totalXp(all);
    const mine = all.find((p) => p.caseId === caseFile.id);
    const gained = mine ? mine.xp ?? xpFor(mine.score, mine.solved) : 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setXpState({ before: after - gained, after });
    // Fanfare lands with the letter grade; a promotion gets its own flourish.
    sfx(result.verdict === "wrong_culprit" ? "lose" : "win", 1.45);
    if (rankFor(after).index > rankFor(after - gained).index) sfx("promote", 2.15);
    // Only on first view of this result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.at, caseFile?.id]);

  useEffect(() => {
    if (!caseFile || !session?.result || session.result.generatedBy !== "fallback" || asked.current) return;
    asked.current = true;
    (async () => {
      const h = await getHealth();
      if (!h.ai) return;
      setCoaching(true);
      try {
        const ai = await postJson<AI>("/api/debrief", debriefInput(caseFile, session, session.result!));
        update((s) => {
          if (!s.result) return s;
          const r: Debrief = {
            ...s.result,
            summary: ai.summary || s.result.summary,
            tip: ai.tip || s.result.tip,
            missed: s.result.missed.map((m) => {
              const x = ai.missed.find((y) => y.contradictionId === m.contradictionId);
              return x ? { ...m, errorLabel: x.errorLabel, errorExplanation: x.errorExplanation } : m;
            }),
            caught: s.result.caught.map((c) => {
              const x = ai.caughtNotes.find((y) => y.contradictionId === c.contradictionId);
              return x ? { ...c, how: x.how } : c;
            }),
            generatedBy: "muse-wonder",
          };
          return { ...s, result: r };
        });
      } catch {
        // keep the computed fallback debrief
      } finally {
        setCoaching(false);
      }
    })();
  }, [caseFile, session, update]);

  if (error) return <ErrorPanel message={error} />;
  if (!caseFile || !session) return <Loading />;
  if (!result)
    return (
      <main className="p-6">
        <ErrorPanel message="No accusation yet for this case.">
          <GameLink href={`/case/${id}/accuse`}>Make an accusation</GameLink>
        </ErrorPanel>
      </main>
    );

  const s = result.stats;
  const grade = gradeFor(result.score);
  const gained = xpFor(result.score, result.culpritCorrect);
  const rankBefore = xpState ? rankFor(xpState.before) : null;
  const rankAfter = xpState ? rankFor(xpState.after) : null;
  const promoted = rankBefore && rankAfter && rankAfter.index > rankBefore.index;
  const total = result.caught.length + result.missed.length;
  const wrong = result.verdict === "wrong_culprit";

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className={`pointer-events-none absolute inset-0 ${wrong ? "bg-[radial-gradient(60%_30%_at_30%_8%,rgba(224,87,74,0.16),transparent_70%)]" : "bg-[radial-gradient(60%_30%_at_30%_8%,rgba(240,168,58,0.18),transparent_70%)]"}`} />
      <main className="relative mx-auto w-full max-w-[1440px] flex-1 px-[18px] pb-32 pt-4 lg:px-12 lg:pb-12 lg:pt-8">
        <div className="flex items-start gap-3">
          <IconLink href={`/case/${id}`} label="Back to the board" className="mt-0.5 lg:hidden">
            <ArrowLeft />
          </IconLink>
          <div className="min-w-0 flex-1">
            <div className="hud truncate text-xs text-dim lg:text-sm">{caseFile.title}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Stamp tone={wrong ? "danger" : "amber"} rotate={-5} delay={0.15} className="border-[5px] px-3.5 text-[38px] leading-tight lg:border-[6px] lg:px-5 lg:text-6xl">
                {wrong ? "Wrong suspect" : "Case closed"}
              </Stamp>
            </div>
            {result.verdict === "partial" ? <p className="tw mt-3 text-sm text-dim">Right suspect, but your exhibits didn&rsquo;t prove it beyond doubt.</p> : null}
          </div>
          <div className="hidden gap-3 lg:flex">
            <GameLink href="/" size="lg">
              Next case
            </GameLink>
            <GameLink href={`/case/${id}/statements`} variant="ghost" size="lg">
              <ScrollText className="size-5" /> Statements
            </GameLink>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-7">
          <section aria-label="Your score" className="flex flex-col gap-4 lg:w-[440px] lg:shrink-0">
            <div className="flex items-center gap-5 lg:rounded-[18px] lg:border lg:border-cream/10 lg:bg-panel lg:p-6">
              <GradeRing score={result.score} grade={grade} wrong={wrong} />
              <div className="min-w-0 flex-1">
                <div className="hud text-2xl font-bold lg:text-3xl">
                  +<CountUp value={gained} delay={1.2} sound /> XP
                </div>
                {xpState && rankAfter ? (
                  <>
                    <ProgressBar value={rankAfter.progress * 100} className="mt-2" />
                    <div className="mt-1.5 text-[13px] text-dim">
                      {rankAfter.name}
                      {rankAfter.nextAt ? ` · ${xpState.after} / ${rankAfter.nextAt} to ${rankAfter.nextName}` : ""}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            {promoted ? (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...pop, delay: 2 }} className="flex items-center gap-3 rounded-2xl border border-amber/60 bg-amber/10 p-3">
                <Stamp tone="amber" rotate={-4} delay={2.1} className="text-lg">
                  Promoted
                </Stamp>
                <span className="hud text-lg font-bold">{rankAfter!.name}</span>
              </motion.div>
            ) : null}

            <motion.div variants={listParent} initial="hidden" animate="show" className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["Culprit", result.breakdown.culprit, 40],
                  ["Evidence", result.breakdown.evidence, 25],
                  ["Contradictions", result.breakdown.contradictions, 25],
                  ["Questioning", result.breakdown.questioning, 10],
                ] as const
              ).map(([l, v, m]) => (
                <motion.div key={l} variants={listItem} className="rounded-xl bg-panel px-1 py-2.5 text-center">
                  <div className="hud text-[17px] font-bold lg:text-[22px]">
                    <CountUp value={v} delay={0.6} />
                    <span className="text-xs text-[#8a7c66] lg:text-sm">/{m}</span>
                  </div>
                  <div className="hud truncate text-[9px] text-dim lg:text-[10px]">{l}</div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...bounce, delay: 0.5 }} className="rounded-[18px] border border-cream/10 bg-panel p-5">
              <div className="hud text-[15px] font-semibold">
                How you questioned · {s.questions} question{s.questions === 1 ? "" : "s"}
              </div>
              <div className="mt-3.5 flex flex-col gap-3">
                {(
                  [
                    ["Open questions", s.openRate, "#f0a83a"],
                    ["Follow-ups", s.followupRate, "#f0a83a"],
                    ["Leading questions", s.leadingRate, "#7aa0c4"],
                    ["Backed by evidence", s.evidenceRate, "#f0a83a"],
                  ] as const
                ).map(([l, v, c], i) => (
                  <div key={l}>
                    <div className="flex justify-between text-sm">
                      <span>{l}</span>
                      <span className="hud">{pct(v)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-well">
                      <motion.div className="h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.7 + i * 0.1 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 text-[13px] text-dim">
                Average {s.avgQuestionWords.toFixed(1)} words per question
                {s.compoundRate > 0 ? ` · ${pct(s.compoundRate)} compound` : ""}
              </div>
            </motion.div>
          </section>

          <section aria-label="Contradictions" className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="hud text-lg lg:text-xl">
                Contradictions · {result.caught.length} of {total} caught
              </h2>
              <span className="hidden text-[13px] text-dimmer sm:block">Revealed now the case is closed</span>
            </div>
            <motion.div variants={listParent} initial="hidden" animate="show" className="grid gap-2.5 xl:grid-cols-2">
              {result.caught.map((c) => (
                <motion.article key={c.contradictionId} variants={listItem} className="rounded-2xl border border-amber/45 bg-panel p-4">
                  <Verdict caught />
                  <div className="tw mt-2 text-[15px] leading-snug">{c.between[0]}</div>
                  <div className="mt-1 text-sm text-dim">vs. {c.between[1]}</div>
                  <div className="mt-2 text-[13px] text-amber">{c.how}</div>
                </motion.article>
              ))}
              {result.missed.map((m) => (
                <motion.article key={m.contradictionId} variants={listItem} className="rounded-2xl border border-danger/55 bg-panel p-4">
                  <Verdict />
                  <div className="tw mt-2 text-[15px] leading-snug">{m.between[0]}</div>
                  <div className="mt-1 text-sm text-dim">vs. {m.between[1]}</div>
                  <div className="mt-1 text-xs text-dimmer">{m.explanation}</div>
                  <span className="hud mt-2.5 inline-block rounded bg-danger/18 px-2 py-0.5 text-[11px] text-[#ff8a78]">{REASONING_ERROR_TEXT[m.errorLabel]}</span>
                  <p className="mt-1 text-xs text-dim">{m.errorExplanation}</p>
                </motion.article>
              ))}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...bounce, delay: 0.9 }} className="flex gap-3.5 rounded-2xl bg-raised p-4 lg:p-5">
              <Lightbulb className="mt-0.5 size-6 shrink-0 text-amber" />
              <div className="min-w-0">
                <div className="hud flex items-center gap-2 text-[13px] text-amber">
                  Coach&rsquo;s note
                  {coaching ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {result.generatedBy === "muse-wonder" ? <span className="rounded border border-amber/40 px-1.5 text-[10px]">Muse Wonder</span> : null}
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#d6c9b0]">{result.summary}</p>
                <p className="mt-2.5 rounded-xl bg-amber/10 p-3 text-sm">
                  <span className="hud text-amber">Next time: </span>
                  {result.tip}
                </p>
              </div>
            </motion.div>

            {result.otherInconsistencies.length ? (
              <details className="rounded-2xl border border-cream/10 bg-panel p-4">
                <summary className="hud flex cursor-pointer list-none items-center justify-between text-sm">
                  Other slips the contradiction engine noticed ({result.otherInconsistencies.length}) <ChevronDown className="size-4" />
                </summary>
                <div className="mt-3 space-y-2">
                  {result.otherInconsistencies.map((o, i) => (
                    <div key={i} className="rounded-xl bg-raised p-3 text-xs">
                      <span className="tw text-sm">{o.suspectName}: </span>
                      {o.claim}
                      <div className="text-dim">conflicts with {o.conflictsWith}</div>
                      <div className={o.followedUp ? "text-good" : "text-amber"}>{o.followedUp ? "You followed up." : "You let it pass."}</div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <details className="rounded-2xl border border-amber/30 bg-amber/5 p-4" open={wrong}>
              <summary className="hud flex cursor-pointer list-none items-center justify-between text-sm text-amber">
                What really happened <ChevronDown className="size-4" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed">{result.truthReveal}</p>
              <ol className="mt-2 space-y-1 text-xs text-dim">
                {caseFile.truth.timeline.map((t, i) => (
                  <li key={i}>
                    <span className="tw text-cream">{t.time}</span> {t.event}
                  </li>
                ))}
              </ol>
            </details>

            <GameButton
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={async () => {
                await resetSession(id);
                router.push(`/case/${id}`);
              }}
            >
              <RotateCcw className="size-4" /> Replay this case
            </GameButton>
          </section>
        </div>
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 flex gap-2.5 bg-[linear-gradient(180deg,rgba(13,11,9,0)_0%,#0d0b09_30%)] px-[18px] pt-6 lg:hidden">
        <GameLink href="/" size="lg" className="flex-1">
          Next case
        </GameLink>
        <GameLink href={`/case/${id}/statements`} variant="ghost" size="lg">
          Statements
        </GameLink>
      </div>
    </div>
  );
}

function Verdict({ caught }: { caught?: boolean }) {
  return (
    <div className={`hud flex items-center gap-2 text-xs ${caught ? "text-amber" : "text-[#ff8a78]"}`}>
      <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...pop, delay: 0.4 }} className={`flex size-[22px] items-center justify-center rounded-full ${caught ? "bg-amber text-amber-ink" : "bg-danger text-white"}`}>
        {caught ? <Check className="size-3" strokeWidth={3.5} /> : <X className="size-3" strokeWidth={3.5} />}
      </motion.span>
      {caught ? "Caught" : "Missed"}
    </div>
  );
}

/** Conic ring that fills to the score, then the letter grade pops in. */
function GradeRing({ score, grade, wrong }: { score: number; grade: string; wrong: boolean }) {
  const p = useMotionValue(0);
  const color = wrong ? "#e0574a" : "#f0a83a";
  const bg = useTransform(p, (v) => `conic-gradient(${color} 0 ${v}%, #2c241c ${v}% 100%)`);
  useEffect(() => {
    const c = animateValue(p, score, { duration: 1.3, delay: 0.4, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [p, score]);
  return (
    <motion.div style={{ background: bg }} className="flex size-[116px] shrink-0 items-center justify-center rounded-full lg:size-[150px]">
      <div className="flex size-[98px] flex-col items-center justify-center rounded-full bg-ink lg:size-32 lg:bg-panel">
        <motion.span initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 12, delay: 1.5 }} className="hud text-[46px] font-bold leading-none lg:text-6xl" style={{ color }}>
          {grade}
        </motion.span>
        <span className="hud text-xs text-dim lg:text-sm">
          <CountUp value={score} delay={0.4} duration={1.3} /> / 100
        </span>
      </div>
    </motion.div>
  );
}
