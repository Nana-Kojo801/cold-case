"use client";
import { ArrowLeft, Gavel, Mic, RotateCcw, ScrollText, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { CaseImage } from "@/components/case-image";
import { BottomNav, type BoardTab } from "@/components/game/bottom-nav";
import { EvidencePiece, LockedPiece } from "@/components/game/evidence";
import { GameButton, GameLink, IconLink, NerveMeter, PressLink, Pressable, Sheet, bounce, pop } from "@/components/game/ui";
import { SceneViewer } from "@/components/scene-viewer";
import { ErrorPanel, Loading } from "@/components/shell";
import { getHealth } from "@/lib/client/api";
import { resetSession, saveCase } from "@/lib/client/db";
import { useCase } from "@/lib/client/useCase";
import { useIsDesktop } from "@/lib/client/useMedia";
import type { CaseFile, Evidence, SamObject, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: BoardTab[] = ["scene", "evidence", "suspects"];

function Board({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { caseFile, session, error, update, replaceCase } = useCase(id);
  const isDesktop = useIsDesktop();
  const [ai, setAi] = useState(false);
  const [tab, setTabState] = useState<BoardTab>(() => (ORDER.includes(params.get("tab") as BoardTab) ? (params.get("tab") as BoardTab) : "scene"));
  const [dir, setDir] = useState(1);
  const [viewing, setViewing] = useState<Evidence | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then((h) => setAi(h.ai));
  }, []);

  const setTab = (t: BoardTab) => {
    setDir(ORDER.indexOf(t) >= ORDER.indexOf(tab) ? 1 : -1);
    setTabState(t);
  };

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
          <GameLink href="/">Home</GameLink>
        </ErrorPanel>
      </main>
    );
  if (!caseFile || !session) return <Loading label="Opening the case file..." />;

  const collected = caseFile.evidence.filter((e) => session.collectedEvidenceIds.includes(e.id));
  // The most recent clue found in the scene wears the "New" tag.
  const newestFind = [...session.collectedEvidenceIds].reverse().find((eid) => caseFile.evidence.find((e) => e.id === eid)?.sceneRegionHint);
  const total = caseFile.evidence.length;
  const solved = Boolean(session.result);
  const suspectSel = selected ?? caseFile.suspects[0]?.id;
  const accuse = () => router.push(solved ? `/case/${id}/debrief` : `/case/${id}/accuse`);

  const clueCounter = (
    <motion.div key={collected.length} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={pop} className="flex h-9 items-center gap-1.5 rounded-full border border-amber/50 bg-ink/70 px-3 backdrop-blur">
      <Search className="size-4 text-amber" strokeWidth={2.2} />
      <span className="hud text-[15px] font-semibold">
        {collected.length}
        <span className="text-dimmer">/{total}</span>
      </span>
    </motion.div>
  );

  const solvedBanner = solved ? (
    <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={bounce} className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-amber/40 bg-panel p-2.5 lg:mx-0">
      <span className="hud flex-1 text-sm text-amber">Case closed</span>
      <GameLink href={`/case/${id}/debrief`} size="sm">
        Debrief
      </GameLink>
      <GameButton
        size="sm"
        variant="ghost"
        onClick={async () => {
          await resetSession(id);
          location.reload();
        }}
      >
        <RotateCcw className="size-4" /> Replay
      </GameButton>
    </motion.div>
  ) : null;

  const evidenceSheet = (
    <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.label ?? ""}>
      {viewing ? (
        <div className="space-y-4">
          {viewing.imageKey ? (
            <motion.div initial={{ rotate: -4, scale: 0.9 }} animate={{ rotate: -1.5, scale: 1 }} transition={bounce} className="mx-auto w-60 bg-[#f2ecdf] p-2.5 pb-3 shadow-[0_14px_30px_rgba(0,0,0,0.6)]">
              <CaseImage imageKey={viewing.imageKey} alt={viewing.label} className="aspect-square w-full rounded-none" />
            </motion.div>
          ) : null}
          <p className="tw text-[15px] leading-relaxed text-[#d6c9b0]">{viewing.description}</p>
          <div>
            <div className="hud mb-2 text-xs text-dim">Show it to</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {caseFile.suspects.map((s) => (
                <PressLink key={s.id} href={`/case/${id}/interrogate/${s.id}?show=${viewing.id}`} className="block rounded-xl border border-cream/12 bg-raised p-1.5 text-center">
                  <CaseImage imageKey={s.portrait.imageKey} alt="" className="aspect-square w-full" fallbackTitle={s.name.split(" ")[0]} />
                  <span className="hud mt-1 block truncate text-xs">{s.name.split(" ")[0]}</span>
                </PressLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );

  const corkboard = (compact: boolean) => (
    <div className={cn("grid", compact ? "grid-cols-3 gap-3.5" : "grid-cols-2 gap-x-3.5 gap-y-5")}>
      {collected.map((e, i) => (
        <EvidencePiece key={e.id} e={e} index={i} compact={compact} isNew={e.id === newestFind} onClick={() => setViewing(e)} />
      ))}
      {Array.from({ length: total - collected.length }, (_, i) => (
        <LockedPiece key={`l${i}`} compact={compact} label={compact ? "Hidden" : "Hidden in the scene"} />
      ))}
    </div>
  );

  /* ---------------- Desktop: the investigation desk ---------------- */
  const desktop = (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-cream/10 bg-[#120f0c]">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-8 py-3.5">
          <IconLink href="/" label="Back to menu">
            <ArrowLeft />
          </IconLink>
          <div className="min-w-0 flex-1">
            <div className="hud text-xs text-amber">{caseFile.setting}</div>
            <div className="hud truncate text-2xl font-bold">{caseFile.title}</div>
          </div>
          {clueCounter}
          <GameLink href={`/case/${id}/statements`} variant="ghost" size="sm">
            <ScrollText className="size-4" /> Statements
          </GameLink>
          <GameButton variant="danger" size="sm" onClick={accuse}>
            <Gavel className="size-4" /> {solved ? "Debrief" : "Accuse"}
          </GameButton>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-8 py-6">
        <section aria-label="Crime scene" className="flex min-w-0 flex-[1.6] flex-col gap-3">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tw text-[15px] leading-relaxed text-[#d6c9b0]">
            {caseFile.victimOrIncident}
          </motion.p>
          <SceneViewer variant="desktop" caseFile={caseFile} session={session} aiAvailable={ai} onCollect={onCollect} onLocations={onLocations} />
          {solvedBanner}
        </section>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <motion.section initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={bounce} aria-label="Evidence board" className="cork rounded-2xl border border-cream/10 p-5 shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="hud text-lg">Evidence board</h2>
              <span className="hud text-sm text-[#d6c9b0]">
                {collected.length} of {total}
              </span>
            </div>
            {corkboard(true)}
          </motion.section>
          <motion.section initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ ...bounce, delay: 0.08 }} aria-label="Suspects" className="rounded-2xl border border-cream/10 bg-panel p-5">
            <h2 className="hud text-lg">The lineup</h2>
            <div className="mt-3.5 grid grid-cols-3 gap-3">
              {caseFile.suspects.map((s) => {
                const q = session.ledger.filter((e) => e.suspectId === s.id).length;
                return (
                  <PressLink key={s.id} href={`/case/${id}/interrogate/${s.id}`} className="group block text-cream">
                    <motion.div whileHover={{ y: -4 }} transition={bounce}>
                      <CaseImage imageKey={s.portrait.imageKey} alt="" className="aspect-[3/4] w-full rounded-lg transition-shadow group-hover:shadow-[0_0_0_2px_#f0a83a]" fallbackTitle={s.name.split(" ")[0]} />
                    </motion.div>
                    <div className="tw mt-2 truncate text-sm">{s.name}</div>
                    <div className="truncate text-xs text-dim">{q ? `${q} question${q > 1 ? "s" : ""}` : "Not questioned"}</div>
                    <NerveMeter value={session.stress?.[s.id] ?? 0} cracked={session.cracked?.[s.id]} compact className="mt-1.5 [&>div:first-child]:hidden" />
                  </PressLink>
                );
              })}
            </div>
          </motion.section>
        </div>
      </main>
      {evidenceSheet}
    </div>
  );

  /* ---------------- Mobile: tabbed screens with a bottom nav ---------------- */
  const variants = {
    enter: (d: number) => ({ x: d * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -60, opacity: 0 }),
  };

  const mobile = (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={tab}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn("absolute inset-0 flex flex-col overflow-y-auto", tab === "evidence" && "cork")}
          >
            {tab === "scene" ? (
              <>
                <SceneViewer
                  variant="mobile"
                  caseFile={caseFile}
                  session={session}
                  aiAvailable={ai}
                  onCollect={onCollect}
                  onLocations={onLocations}
                  overlay={
                    <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 px-4 pt-4">
                      <IconLink href="/" label="Back to menu">
                        <ArrowLeft />
                      </IconLink>
                      <div className="min-w-0 flex-1">
                        <div className="hud truncate text-[11px] text-amber">{caseFile.title}</div>
                        <div className="hud text-xl font-bold">Crime scene</div>
                      </div>
                      {clueCounter}
                    </div>
                  }
                />
                <details className="mx-4 mb-4 rounded-xl border border-cream/10 bg-panel p-3">
                  <summary className="hud cursor-pointer text-xs text-dim">The case so far</summary>
                  <p className="tw mt-2 text-sm leading-relaxed text-[#d6c9b0]">{caseFile.victimOrIncident}</p>
                </details>
                {solvedBanner}
              </>
            ) : tab === "evidence" ? (
              <EvidenceTab caseFile={caseFile} session={session} board={corkboard(false)} />
            ) : (
              <SuspectsTab id={id} caseFile={caseFile} session={session} selected={suspectSel} onSelect={setSelected} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav tab={tab} onTab={setTab} evidenceCount={collected.length} onAccuse={accuse} />
      {evidenceSheet}
    </div>
  );

  return isDesktop ? desktop : mobile;
}

function EvidenceTab({ caseFile, session, board }: { caseFile: CaseFile; session: Session; board: React.ReactNode }) {
  return (
    <div className="relative min-h-full pb-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_30%,transparent_50%,rgba(0,0,0,0.55)_100%)]" />
      <div className="relative flex items-center gap-2.5 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="hud truncate text-[11px] text-amber">{caseFile.title}</div>
          <div className="hud text-xl font-bold">Evidence board</div>
        </div>
        <span className="hud flex h-9 items-center rounded-full bg-ink/70 px-3 text-sm">
          {session.collectedEvidenceIds.length} of {caseFile.evidence.length}
        </span>
      </div>
      <p className="relative px-4 pt-2 text-xs text-[#d6c9b0]">Tap anything pinned here to study it or show it to a suspect.</p>
      <div className="relative px-4 pt-5">{board}</div>
    </div>
  );
}

function SuspectsTab({ id, caseFile, session, selected, onSelect }: { id: string; caseFile: CaseFile; session: Session; selected?: string; onSelect: (s: string) => void }) {
  const s = caseFile.suspects.find((x) => x.id === selected) ?? caseFile.suspects[0];
  const turns = session.ledger.filter((e) => e.suspectId === s.id);
  const shown = session.presentedEvidence.filter((p) => p.suspectId === s.id).length;
  return (
    <div className="flex min-h-full flex-col">
      <div className="height-chart relative pb-5">
        <div className="hud pointer-events-none absolute left-2 top-[92px] text-[10px] leading-7 text-[#8a7c66]" aria-hidden="true">
          6&apos;6<br />6&apos;3<br />6&apos;0<br />5&apos;9<br />5&apos;6<br />5&apos;3<br />5&apos;0<br />4&apos;9
        </div>
        <motion.div layout className="pointer-events-none absolute left-1/2 top-0 h-full w-56 -translate-x-1/2 bg-[radial-gradient(50%_60%_at_50%_30%,rgba(240,168,58,0.28),transparent_75%)]" />
        <div className="relative flex items-center gap-2.5 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <div className="hud truncate text-[11px] text-amber">{caseFile.title}</div>
            <div className="hud text-xl font-bold">The lineup</div>
          </div>
          <IconLink href={`/case/${id}/statements`} label="Statements">
            <ScrollText />
          </IconLink>
        </div>
        <div className="relative flex items-end justify-center gap-3 px-7 pt-8">
          {caseFile.suspects.map((x, i) => {
            const on = x.id === s.id;
            return (
              <Pressable key={x.id} onClick={() => onSelect(x.id)} aria-pressed={on} aria-label={x.name} className="flex flex-col items-center gap-2">
                <motion.div animate={{ scale: on ? 1 : 0.86, opacity: on ? 1 : 0.55, y: on ? -6 : 0 }} transition={bounce} className="relative">
                  <CaseImage imageKey={x.portrait.imageKey} alt="" className={cn("h-[168px] w-[104px] rounded-md object-cover", !on && "grayscale-[50%]")} fallbackTitle={x.name.split(" ")[0]} />
                  {on ? <motion.div layoutId="lineup-ring" className="pointer-events-none absolute inset-0 rounded-md shadow-[0_0_0_3px_#f0a83a,0_18px_40px_rgba(0,0,0,0.6)]" transition={{ type: "spring", stiffness: 420, damping: 30 }} /> : null}
                  {session.cracked?.[x.id] ? <span className="hud absolute -right-2 top-2 rotate-6 bg-alarm px-1.5 text-[10px] font-bold text-[#1a0705]">Cracked</span> : null}
                </motion.div>
                <span className={cn("hud flex h-[26px] w-[34px] items-center justify-center rounded-[3px] text-[15px] font-bold", on ? "bg-amber text-amber-ink" : "bg-cream text-amber-ink")}>{i + 1}</span>
              </Pressable>
            );
          })}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.section key={s.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={bounce} className="flex flex-1 flex-col gap-4 border-t border-cream/10 bg-panel px-4 pb-5 pt-5">
          <div>
            <div className="tw text-[26px] text-amber">{s.name}</div>
            <div className="text-sm text-dim">{s.role}</div>
          </div>
          <NerveMeter value={session.stress?.[s.id] ?? 0} cracked={session.cracked?.[s.id]} />
          <div className="grid grid-cols-3 gap-2">
            {[
              [turns.length, "Questions"],
              [shown, "Evidence shown"],
              [turns.length, "Statements"],
            ].map(([v, l]) => (
              <div key={String(l)} className="rounded-xl bg-raised p-2.5 text-center">
                <div className="hud text-[22px] font-bold">{v}</div>
                <div className="hud text-[10px] text-dim">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-auto flex gap-2.5">
            <GameLink href={`/case/${id}/interrogate/${s.id}`} size="lg" className="flex-1">
              <Mic className="size-5" /> Interrogate
            </GameLink>
            <PressLink href={`/case/${id}/statements?s=${s.id}`} aria-label="Read statements" className="flex size-14 items-center justify-center rounded-2xl border-[1.5px] border-cream/20 text-cream">
              <ScrollText className="size-5" />
            </PressLink>
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loading label="Opening the case file..." />}>
      <Board id={id} />
    </Suspense>
  );
}
