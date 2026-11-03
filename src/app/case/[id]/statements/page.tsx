"use client";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { CaseImage } from "@/components/case-image";
import { Pressable, TopHud, bounce } from "@/components/game/ui";
import { ErrorPanel, Loading } from "@/components/shell";
import { useCase } from "@/lib/client/useCase";
import { cn } from "@/lib/utils";

/** Read-only statement ledger per suspect, as a detective's notebook. Contradictions are NOT marked. */
function Statements({ id }: { id: string }) {
  const params = useSearchParams();
  const { caseFile, session, error } = useCase(id);
  const [picked, setPicked] = useState<string | null>(null);
  if (error) return <ErrorPanel message={error} />;
  if (!caseFile || !session) return <Loading />;
  const from = params.get("s");
  const sid = picked ?? from ?? caseFile.suspects[0]?.id;
  const s = caseFile.suspects.find((x) => x.id === sid)!;
  const entries = session.ledger.filter((e) => e.suspectId === sid);
  const ev = (eid?: string) => caseFile.evidence.find((e) => e.id === eid)?.label;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopHud back={from ? `/case/${id}/interrogate/${from}` : `/case/${id}`} kicker={caseFile.title} title="Statements" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-4">
        <div className="flex gap-2.5 overflow-x-auto pb-2">
          {caseFile.suspects.map((x) => {
            const on = x.id === sid;
            return (
              <Pressable key={x.id} onClick={() => setPicked(x.id)} aria-pressed={on} className={cn("relative flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5", on ? "border-amber bg-raised" : "border-cream/12 bg-panel")}>
                <CaseImage imageKey={x.portrait.imageKey} alt="" className="size-9 rounded-full" fallbackTitle={x.name[0]} />
                <span className={cn("hud text-sm", on && "text-amber")}>{x.name.split(" ")[0]}</span>
                <span className="text-xs text-dimmer">{session.ledger.filter((e) => e.suspectId === x.id).length}</span>
              </Pressable>
            );
          })}
        </div>
        <motion.div key={sid} initial={{ opacity: 0, y: 30, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0.5 }} transition={bounce} className="lined mt-4 rounded bg-paper-2 p-5 text-paper-ink shadow-[0_20px_44px_rgba(0,0,0,0.55)]">
          <div className="hud text-[13px] text-paper-muted">
            Notebook · {s.name}, {s.role}
          </div>
          {entries.length === 0 ? <p className="tw mt-3 text-sm text-paper-muted">Nothing on the record yet.</p> : null}
          <ol className="mt-2 space-y-4">
            {entries.map((e, i) => (
              <motion.li key={e.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...bounce, delay: i * 0.04 }}>
                <div className="hud text-[10px] text-paper-muted">
                  Q{e.turn}
                  {e.presentedEvidenceId ? ` · shown: ${ev(e.presentedEvidenceId)}` : ""}
                </div>
                <p className="text-sm text-paper-muted">{e.playerQuestion}</p>
                <p className="tw text-[15px] leading-7">&ldquo;{e.suspectAnswer}&rdquo;</p>
              </motion.li>
            ))}
          </ol>
          <p className="tw mt-4 text-xs text-paper-muted">Contradictions aren&rsquo;t marked. Spot them yourself.</p>
        </motion.div>
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
