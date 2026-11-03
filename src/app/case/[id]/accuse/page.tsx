"use client";
import { Gavel } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { CaseImage } from "@/components/case-image";
import { EvidenceCard } from "@/components/evidence-card";
import { MicButton } from "@/components/mic-button";
import { ErrorPanel, Loading, TopBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { addProgress } from "@/lib/client/db";
import { useCase } from "@/lib/client/useCase";
import { scoreSession } from "@/lib/game";
import { cn } from "@/lib/utils";

export default function AccusePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { caseFile, session, error, update, sessionRef } = useCase(id);
  const [culprit, setCulprit] = useState<string | null>(null);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [statementIds, setStatementIds] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState("");

  if (error) return <ErrorPanel message={error} />;
  if (!caseFile || !session) return <Loading />;

  const collected = caseFile.evidence.filter((e) => session.collectedEvidenceIds.includes(e.id));
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const name = (sid: string) => caseFile.suspects.find((s) => s.id === sid)?.name ?? sid;

  function submit() {
    if (!caseFile || !culprit) return;
    if (evidenceIds.length === 0) {
      toast.message("Cite at least one piece of evidence that proves it.");
      return;
    }
    update((s) => ({ ...s, accusation: { suspectId: culprit, evidenceIds, statementIds, reasoning: reasoning.trim() } }));
    const s = sessionRef.current!;
    const result = scoreSession(caseFile, s);
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
    });
    router.push(`/case/${id}/debrief`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar back={`/case/${id}`} title="Accusation" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pb-32 pt-4">
        <section className="space-y-2">
          <h2 className="font-case text-primary">1. Who did it?</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {caseFile.suspects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCulprit(s.id)}
                aria-pressed={culprit === s.id}
                className={cn("flex flex-col items-center gap-1 rounded-lg border bg-card/60 p-2 text-center", culprit === s.id ? "border-primary ring-2 ring-primary" : "border-border")}
              >
                <CaseImage imageKey={s.portrait.imageKey} alt={s.name} className="aspect-square w-full" fallbackTitle={s.name.split(" ")[0]} />
                <span className="font-case text-sm">{s.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-case text-primary">2. Which evidence proves it?</h2>
          {collected.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={evidenceIds.includes(e.id)} onCheckedChange={() => toggle(evidenceIds, setEvidenceIds, e.id)} />
              <EvidenceCard e={e} compact selected={evidenceIds.includes(e.id)} className="flex-1" />
            </label>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="font-case text-primary">3. Which statements were lies? (optional)</h2>
          {session.ledger.length === 0 ? <p className="text-sm text-muted-foreground">You haven&apos;t questioned anyone yet.</p> : null}
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {session.ledger.map((e) => (
              <label key={e.id} className={cn("flex cursor-pointer gap-2 rounded-md border bg-card/60 p-2", statementIds.includes(e.id) ? "border-primary" : "border-border")}>
                <Checkbox className="mt-1" checked={statementIds.includes(e.id)} onCheckedChange={() => toggle(statementIds, setStatementIds, e.id)} />
                <span className="text-sm">
                  <span className="text-xs text-muted-foreground">{name(e.suspectId)}, turn {e.turn}: </span>
                  <span className="font-case">{e.suspectAnswer}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-case text-primary">4. Your reasoning (optional)</h2>
          <div className="flex items-end gap-2">
            <Textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} placeholder="Say or type how the pieces fit together" rows={3} />
            <MicButton size="sm" onTranscript={(t) => setReasoning((r) => (r ? `${r} ${t}` : t))} />
          </div>
        </section>
      </main>
      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 pt-3 backdrop-blur">
        <Button size="lg" className="mx-auto flex h-12 w-full max-w-2xl" disabled={!culprit} onClick={submit}>
          <Gavel /> {culprit ? `Accuse ${name(culprit)}` : "Choose a suspect"}
        </Button>
      </div>
    </div>
  );
}
