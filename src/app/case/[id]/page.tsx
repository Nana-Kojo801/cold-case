"use client";
import { Gavel, MessageSquareText, RotateCcw, ScrollText } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { CaseImage } from "@/components/case-image";
import { EvidenceCard } from "@/components/evidence-card";
import { SceneViewer } from "@/components/scene-viewer";
import { ErrorPanel, Loading, TopBar } from "@/components/shell";
import { StressMeter } from "@/components/stress-meter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getHealth } from "@/lib/client/api";
import { resetSession, saveCase } from "@/lib/client/db";
import { useCase } from "@/lib/client/useCase";
import type { SamObject } from "@/lib/types";

const panel = "data-[state=inactive]:hidden lg:data-[state=inactive]:block lg:mt-0 space-y-3";

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { caseFile, session, error, update, replaceCase } = useCase(id);
  const [ai, setAi] = useState(false);
  const [tab, setTab] = useState("scene");

  useEffect(() => {
    getHealth().then((h) => setAi(h.ai));
  }, []);

  const onCollect = useCallback(
    (evidenceId: string) => update((s) => (s.collectedEvidenceIds.includes(evidenceId) ? s : { ...s, collectedEvidenceIds: [...s.collectedEvidenceIds, evidenceId] })),
    [update],
  );

  const onLocations = useCallback(
    (locs: Record<string, SamObject | null>) => {
      if (!caseFile) return;
      const next = { ...caseFile, sceneLocations: locs };
      replaceCase(next);
      saveCase(next);
    },
    [caseFile, replaceCase],
  );

  if (error)
    return (
      <main className="p-6">
        <ErrorPanel message={error}>
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
        </ErrorPanel>
      </main>
    );
  if (!caseFile || !session) return <Loading label="Opening the case file..." />;

  const collected = caseFile.evidence.filter((e) => session.collectedEvidenceIds.includes(e.id));
  const hidden = caseFile.evidence.length - collected.length;
  const solved = Boolean(session.result);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        back="/"
        title={caseFile.title}
        right={
          <Button asChild variant="ghost" size="icon" aria-label="Statements">
            <Link href={`/case/${id}/statements`}>
              <ScrollText />
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-28 pt-4 lg:max-w-6xl">
        <section className="rounded-lg border border-border bg-card/60 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{caseFile.setting}</div>
          <p className="mt-1 font-case text-sm leading-relaxed">{caseFile.victimOrIncident}</p>
        </section>

        <Tabs value={tab} onValueChange={setTab} className="lg:block">
          <TabsList className="grid w-full grid-cols-3 lg:hidden">
            <TabsTrigger value="scene">Scene</TabsTrigger>
            <TabsTrigger value="evidence">Evidence ({collected.length})</TabsTrigger>
            <TabsTrigger value="suspects">Suspects</TabsTrigger>
          </TabsList>
          <div className="lg:grid lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-5">
            <TabsContent value="scene" forceMount className={panel}>
              <h2 className="hidden font-case text-primary lg:block">Scene</h2>
              <SceneViewer caseFile={caseFile} session={session} aiAvailable={ai} onCollect={onCollect} onLocations={onLocations} />
            </TabsContent>

            <TabsContent value="evidence" forceMount className={panel}>
              <h2 className="hidden font-case text-primary lg:block">Evidence</h2>
              {collected.map((e) => (
                <EvidenceCard key={e.id} e={e} />
              ))}
              {hidden ? (
                <button type="button" onClick={() => setTab("scene")} className="w-full rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground lg:pointer-events-none">
                  {hidden} more item{hidden > 1 ? "s" : ""} hidden in the scene
                </button>
              ) : null}
            </TabsContent>

            <TabsContent value="suspects" forceMount className={panel}>
              <h2 className="hidden font-case text-primary lg:block">Suspects</h2>
              {caseFile.suspects.map((s) => {
                const turns = session.ledger.filter((e) => e.suspectId === s.id).length;
                return (
                  <Link
                    key={s.id}
                    href={`/case/${id}/interrogate/${s.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card/70 p-3 transition-colors hover:border-primary/60"
                  >
                    <CaseImage imageKey={s.portrait.imageKey} alt={s.name} className="size-16 shrink-0" fallbackTitle={s.name.split(" ")[0]} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-case text-primary">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.role}</div>
                      <StressMeter value={session.stress?.[s.id] ?? 0} cracked={session.cracked?.[s.id]} />
                    </div>
                    <div className="flex flex-col items-center text-[10px] text-muted-foreground">
                      <MessageSquareText className="size-5 text-primary" />
                      {turns ? `${turns} Q` : "Question"}
                    </div>
                  </Link>
                );
              })}
            </TabsContent>
          </div>
        </Tabs>
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 lg:max-w-6xl">
          {solved ? (
            <>
              <Button asChild size="lg" className="h-12 flex-1">
                <Link href={`/case/${id}/debrief`}>View debrief</Link>
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-12"
                onClick={async () => {
                  await resetSession(id);
                  location.reload();
                }}
              >
                <RotateCcw /> Replay
              </Button>
            </>
          ) : (
            <Button asChild size="lg" className="h-12 flex-1">
              <Link href={`/case/${id}/accuse`}>
                <Gavel /> Make an accusation
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
