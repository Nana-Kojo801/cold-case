"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { ErrorPanel, Loading, TopBar } from "@/components/shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCase } from "@/lib/client/useCase";

/** Read-only statement ledger per suspect. Contradictions are NOT shown here; the player has to spot them. */
function Statements({ id }: { id: string }) {
  const params = useSearchParams();
  const { caseFile, session, error } = useCase(id);
  if (error) return <ErrorPanel message={error} />;
  if (!caseFile || !session) return <Loading />;
  const first = params.get("s") ?? caseFile.suspects[0]?.id;
  const ev = (eid?: string) => caseFile.evidence.find((e) => e.id === eid)?.label;
  const back = params.get("s") ? `/case/${id}/interrogate/${params.get("s")}` : `/case/${id}`;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar back={back} title="Statements" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-4">
        <Tabs defaultValue={first}>
          <TabsList className="w-full">
            {caseFile.suspects.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="flex-1 truncate">
                {s.name.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>
          {caseFile.suspects.map((s) => {
            const entries = session.ledger.filter((e) => e.suspectId === s.id);
            return (
              <TabsContent key={s.id} value={s.id} className="space-y-3 pt-2">
                <div className="text-xs text-muted-foreground">
                  {s.name}, {s.role}
                </div>
                {entries.length === 0 ? <p className="text-sm text-muted-foreground">No statements yet.</p> : null}
                {entries.map((e) => (
                  <article key={e.id} className="space-y-1 rounded-md border border-border bg-card/60 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Turn {e.turn}
                      {e.presentedEvidenceId ? ` · shown: ${ev(e.presentedEvidenceId)}` : ""}
                    </div>
                    <p className="text-sm text-primary">Q: {e.playerQuestion}</p>
                    <p className="font-case text-sm leading-relaxed">A: {e.suspectAnswer}</p>
                  </article>
                ))}
              </TabsContent>
            );
          })}
        </Tabs>
      </main>
    </div>
  );
}

export default function StatementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loading />}>
      <Statements id={id} />
    </Suspense>
  );
}
