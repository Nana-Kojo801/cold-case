"use client";
import { BarChart3, CheckCircle2, Home, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { ErrorPanel, Loading, TopBar } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getHealth, postJson } from "@/lib/client/api";
import { useCase } from "@/lib/client/useCase";
import { pct } from "@/lib/game";
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
  const { caseFile, session, error, update } = useCase(id);
  const [coaching, setCoaching] = useState(false);
  const asked = useRef(false);

  const result = session?.result;

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
          <Button asChild>
            <Link href={`/case/${id}/accuse`}>Make an accusation</Link>
          </Button>
        </ErrorPanel>
      </main>
    );

  const verdictText = result.verdict === "solved" ? "Case closed" : result.verdict === "partial" ? "Right suspect, thin proof" : "Wrong suspect";
  const s = result.stats;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar back={`/case/${id}`} title="Debrief" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pb-12 pt-5">
        <section className="space-y-2 text-center">
          <div className={`font-case text-3xl ${result.verdict === "wrong_culprit" ? "text-destructive" : "text-primary"}`}>{verdictText}</div>
          <div className="text-6xl font-bold tabular-nums">{result.score}</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">out of 100</div>
          <div className="mx-auto grid max-w-sm grid-cols-4 gap-2 pt-2 text-[11px] text-muted-foreground">
            <Stat label="Culprit" value={`${result.breakdown.culprit}/40`} />
            <Stat label="Evidence" value={`${result.breakdown.evidence}/25`} />
            <Stat label="Contradictions" value={`${result.breakdown.contradictions}/25`} />
            <Stat label="Questioning" value={`${result.breakdown.questioning}/10`} />
          </div>
        </section>

        <section className="space-y-2 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Coach&apos;s notes {coaching ? <Loader2 className="size-3 animate-spin" /> : null}
            {result.generatedBy === "muse-wonder" ? <Badge variant="outline">Muse Wonder</Badge> : null}
          </div>
          <p className="text-sm leading-relaxed">{result.summary}</p>
          <p className="rounded-md bg-primary/10 p-3 text-sm">
            <span className="font-case text-primary">Next time: </span>
            {result.tip}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-case text-primary">
            Contradictions caught ({result.caught.length}/{result.caught.length + result.missed.length})
          </h2>
          {result.caught.map((c) => (
            <article key={c.contradictionId} className="space-y-1 rounded-md border border-[var(--stress-low)]/40 bg-card/60 p-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-[var(--stress-low)]" />
                <span className="font-case">{c.between[0]}</span>
              </div>
              <p className="pl-6 text-sm text-muted-foreground">vs. {c.between[1]}</p>
              <p className="pl-6 text-xs">{c.explanation}</p>
              <p className="pl-6 text-xs text-[var(--stress-low)]">{c.how}</p>
            </article>
          ))}
          {result.missed.length ? <h2 className="pt-2 font-case text-primary">Missed</h2> : null}
          {result.missed.map((m) => (
            <article key={m.contradictionId} className="space-y-1 rounded-md border border-destructive/40 bg-card/60 p-3">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="size-4 shrink-0 text-destructive" />
                <span className="font-case">{m.between[0]}</span>
              </div>
              <p className="pl-6 text-sm text-muted-foreground">vs. {m.between[1]}</p>
              <p className="pl-6 text-xs">{m.explanation}</p>
              <div className="pl-6 pt-1">
                <Badge variant="destructive">{REASONING_ERROR_TEXT[m.errorLabel]}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">{m.errorExplanation}</p>
              </div>
            </article>
          ))}
        </section>

        {result.otherInconsistencies.length ? (
          <section className="space-y-2">
            <h2 className="font-case text-primary">Other slips the contradiction engine noticed</h2>
            {result.otherInconsistencies.map((o, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 p-3 text-xs">
                <span className="font-case text-sm">{o.suspectName}: </span>
                {o.claim}
                <div className="text-muted-foreground">conflicts with {o.conflictsWith}</div>
                <div className={o.followedUp ? "text-[var(--stress-low)]" : "text-[var(--stress-mid)]"}>{o.followedUp ? "You followed up." : "You let it pass."}</div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="font-case text-primary">How you questioned</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat big label="Questions" value={String(s.questions)} />
            <Stat big label="Open questions" value={pct(s.openRate)} />
            <Stat big label="Leading questions" value={pct(s.leadingRate)} />
            <Stat big label="Follow-ups" value={pct(s.followupRate)} />
            <Stat big label="With evidence" value={pct(s.evidenceRate)} />
            <Stat big label="Avg. words / question" value={s.avgQuestionWords.toFixed(1)} />
          </div>
          {s.compoundRate > 0 ? <p className="text-xs text-muted-foreground">Compound questions: {pct(s.compoundRate)} (ask one thing at a time)</p> : null}
        </section>

        <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h2 className="font-case text-primary">What really happened</h2>
          <p className="text-sm leading-relaxed">{result.truthReveal}</p>
          <ol className="space-y-1 pt-1 text-xs text-muted-foreground">
            {caseFile.truth.timeline.map((t, i) => (
              <li key={i}>
                <span className="font-case text-foreground">{t.time}</span> {t.event}
              </li>
            ))}
          </ol>
        </section>

        <div className="flex gap-2">
          <Button asChild size="lg" className="h-12 flex-1">
            <Link href="/">
              <Home /> New case
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="h-12 flex-1">
            <Link href="/progress">
              <BarChart3 /> Progress
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2 text-center">
      <div className={big ? "text-xl font-semibold tabular-nums text-foreground" : "text-sm font-semibold tabular-nums text-foreground"}>{value}</div>
      <div className="text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
