"use client";
import { ArrowLeft, FolderOpen, Gavel, Keyboard, ScrollText, SendHorizontal, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { CaseImage } from "@/components/case-image";
import { EvidencePiece } from "@/components/game/evidence";
import { GameButton, GameLink, IconButton, IconLink, NerveMeter, PressLink, Pressable, Sheet, SpeakingBars, Stamp, Typewriter, bounce, pop } from "@/components/game/ui";
import { MicButton } from "@/components/mic-button";
import { ErrorPanel, Loading } from "@/components/shell";
import { ApiError, getHealth } from "@/lib/client/api";
import { loadSettings, saveSettings } from "@/lib/client/db";
import { speak, stopSpeaking } from "@/lib/client/tts";
import { analyzeTurn, askSuspect } from "@/lib/client/turn";
import { useCase } from "@/lib/client/useCase";
import { useIsDesktop } from "@/lib/client/useMedia";
import { breaksNow, CRACK_THRESHOLD, heuristicTags } from "@/lib/game";
import type { LedgerEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const now = () => Date.now();

function Room({ id, suspectId }: { id: string; suspectId: string }) {
  const params = useSearchParams();
  const { caseFile, session, error, update, sessionRef } = useCase(id);
  const isDesktop = useIsDesktop();
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [pending, setPending] = useState<{ q: string; evidenceId?: string } | null>(null);
  const [failed, setFailed] = useState<{ q: string; evidenceId?: string; message: string; canOffline: boolean } | null>(null);
  const [voice, setVoice] = useState(true);
  const [ai, setAi] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [picker, setPicker] = useState<boolean>(() => Boolean(params.get("show")));
  const [pick, setPick] = useState<string | null>(() => params.get("show"));
  const [notes, setNotes] = useState(false);
  const [crackFx, setCrackFx] = useState(false);
  const [scope, animate] = useAnimate();
  const prevStress = useRef<number | null>(null);
  const prevCracked = useRef<boolean | null>(null);

  useEffect(() => {
    // Reading localStorage after mount avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoice(loadSettings().voice);
    getHealth().then((h) => setAi(h.ai));
    return () => stopSpeaking();
  }, []);

  const suspect = caseFile?.suspects.find((s) => s.id === suspectId);
  const entries = useMemo(() => session?.ledger.filter((e) => e.suspectId === suspectId) ?? [], [session, suspectId]);
  const stress = session?.stress?.[suspectId] ?? 0;
  const cracked = Boolean(session?.cracked?.[suspectId]);

  // Nerve rising shakes the portrait; cracking slams the stamp.
  useEffect(() => {
    if (!session || !scope.current) return;
    if (prevStress.current !== null && stress > prevStress.current + 4) {
      animate(scope.current, { x: [0, -8, 7, -5, 3, 0] }, { duration: 0.45 });
    }
    if (prevCracked.current === false && cracked) {
       
      setCrackFx(true);
      navigator.vibrate?.([60, 40, 120]);
      animate(scope.current, { x: [0, -16, 14, -10, 8, -4, 0], scale: [1, 1.04, 1] }, { duration: 0.6 });
    }
    prevStress.current = stress;
    prevCracked.current = cracked;
  }, [stress, cracked, session, animate, scope]);

  useEffect(() => {
    if (!crackFx) return;
    const t = setTimeout(() => setCrackFx(false), 2200);
    return () => clearTimeout(t);
  }, [crackFx]);

  const keywords = useMemo(() => (caseFile ? [...caseFile.suspects.map((s) => s.name), ...caseFile.evidence.map((e) => e.label)].slice(0, 30) : []), [caseFile]);

  if (error) return <main className="p-6"><ErrorPanel message={error} /></main>;
  if (!caseFile || !session) return <Loading />;
  if (!suspect)
    return (
      <main className="p-6">
        <ErrorPanel message="That suspect isn't in this case.">
          <GameLink href={`/case/${id}`}>Back to the board</GameLink>
        </ErrorPanel>
      </main>
    );

  const collected = caseFile.evidence.filter((e) => session.collectedEvidenceIds.includes(e.id));
  const offlineAllowed = caseFile.source === "demo" || !ai;
  const ev = (eid?: string) => caseFile.evidence.find((e) => e.id === eid);
  const last = entries[entries.length - 1];
  const breaking = cracked || stress >= CRACK_THRESHOLD;
  const first = suspect.name.split(" ")[0];

  async function send(q: string, evidenceId?: string, forceOffline = false) {
    if (!caseFile || !suspect || pending) return;
    const question = q.trim() || (evidenceId ? "Explain this." : "");
    if (!question) return;
    setFailed(null);
    setPending({ q: question, evidenceId });
    setTyping(false);
    stopSpeaking();
    try {
      const r = await askSuspect({ caseFile, session: sessionRef.current!, suspectId, question, presentEvidenceId: evidenceId, allowOffline: offlineAllowed || forceOffline });
      const s1 = sessionRef.current!;
      const prev = s1.ledger.filter((e) => e.suspectId === suspectId);
      const turn = prev.length + 1;
      const entry: LedgerEntry = {
        id: `${suspectId}-t${turn}`,
        suspectId,
        turn,
        playerQuestion: question,
        presentedEvidenceId: evidenceId,
        suspectAnswer: r.answer,
        claimsExtracted: [],
        stress: s1.stress?.[suspectId] ?? 0,
        questionTags: heuristicTags(question, prev[prev.length - 1]?.suspectAnswer, Boolean(evidenceId)),
        analysis: "pending",
        offline: r.offline,
        at: now(),
      };
      const breaks = breaksNow(suspect, evidenceId);
      update((s) => ({
        ...s,
        ledger: [...s.ledger, entry],
        presentedEvidence: evidenceId ? [...s.presentedEvidence, { evidenceId, suspectId, turn }] : s.presentedEvidence,
        cracked: breaks ? { ...s.cracked, [suspectId]: true } : s.cracked,
      }));
      setDraft("");
      setPick(null);
      setPending(null);
      if (voice) {
        setSpeaking(true);
        speak(r.answer, suspect.id, suspect.voice, () => setSpeaking(false));
      }
      // The contradiction check runs in the background while the suspect speaks.
      const a = await analyzeTurn({ caseFile, session: sessionRef.current!, entry, offline: r.offline });
      update((s) => {
        const before = s.stress?.[suspectId] ?? 0;
        const after = Math.max(0, Math.min(100, before + a.stressDelta + (breaks ? 35 : 0)));
        const { stressDelta: _d, ...patch } = a;
        void _d;
        return {
          ...s,
          ledger: s.ledger.map((e) => (e.id === entry.id ? { ...e, ...patch, stress: after } : e)),
          stress: { ...s.stress, [suspectId]: after },
          cracked: after >= CRACK_THRESHOLD ? { ...s.cracked, [suspectId]: true } : s.cracked,
        };
      });
    } catch (err) {
      setPending(null);
      const e = err as ApiError;
      setFailed({ q: question, evidenceId, message: e.message || "The suspect didn't answer.", canOffline: e.code !== "rate_limited" });
    }
  }

  function toggleVoice() {
    const v = !voice;
    setVoice(v);
    saveSettings({ ...loadSettings(), voice: v });
    if (!v) {
      stopSpeaking();
      setSpeaking(false);
    }
  }

  const replay = () => {
    if (!last || !voice) return;
    setSpeaking(true);
    speak(last.suspectAnswer, suspect.id, suspect.voice, () => setSpeaking(false));
  };

  /* ---------- shared pieces ---------- */

  const stamp = (
    <AnimatePresence>
      {crackFx ? (
        <motion.div key="crack" className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <motion.div className="absolute inset-0 bg-alarm/30" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }} />
          <Stamp tone="alarm" rotate={-12} className="bg-ink/40 px-6 text-6xl shadow-[0_0_40px_rgba(255,90,69,0.45)]">
            Cracked
          </Stamp>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const namePlate = (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <motion.div layout className={cn("hud inline-block rounded px-3 py-1 text-xl font-bold", breaking ? "bg-alarm text-[#1a0705]" : "bg-amber text-amber-ink")}>
          {suspect.name}
        </motion.div>
        <div className="mt-1 truncate text-[13px] text-[#d6c9b0]">{cracked ? "Their story just changed" : suspect.role}</div>
      </div>
      <NerveMeter value={stress} cracked={cracked} compact className="w-[132px]" />
    </div>
  );

  const portrait = (cls: string) => (
    <div className={cn("relative overflow-hidden", cls)}>
      <motion.div className="absolute inset-0" animate={{ scale: speaking ? 1.03 : 1 }} transition={{ duration: 0.6 }}>
        <CaseImage imageKey={suspect.portrait.imageKey} alt={`${suspect.name} under the interrogation lamp`} className={cn("h-full w-full rounded-none object-cover object-[50%_18%] transition-[filter] duration-700", breaking && "grayscale-[70%] contrast-[1.15]")} fallbackTitle={suspect.name} />
      </motion.div>
      <motion.div className="pointer-events-none absolute inset-0 bg-[rgba(160,30,20,0.28)]" initial={false} animate={{ opacity: breaking ? 1 : 0 }} transition={{ duration: 0.6 }} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_22%,rgba(240,168,58,0.18),transparent_60%),linear-gradient(180deg,rgba(13,11,9,0.75)_0%,transparent_20%,transparent_58%,#0d0b09_100%)]" />
      <motion.div className="pointer-events-none absolute left-1/2 top-0 h-full w-[70%] -translate-x-1/2 bg-[radial-gradient(50%_40%_at_50%_0%,rgba(255,200,120,0.18),transparent_70%)]" animate={{ opacity: [0.7, 1, 0.8, 1] }} transition={{ duration: 4, repeat: Infinity }} />
      {stamp}
    </div>
  );

  const dialogue = (big: boolean) => (
    <div className={cn("flex flex-col", big ? "min-h-[260px] p-7" : "min-h-0 flex-1 p-4")}>
      <AnimatePresence mode="wait">
        {pending ? (
          <motion.div key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <QuestionLine q={pending.q} shown={ev(pending.evidenceId)?.label} />
            <div className="mt-4 flex gap-1.5" aria-label={`${first} is thinking`}>
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-2.5 rounded-full bg-cream/70" animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </div>
          </motion.div>
        ) : last ? (
          <motion.div key={last.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={bounce} className="flex flex-1 flex-col">
            <QuestionLine q={last.playerQuestion} shown={ev(last.presentedEvidenceId)?.label} />
            <p className={cn("tw mt-3 leading-relaxed", big ? "text-[26px]" : "text-lg", breaking ? "text-[#fff2ea]" : "text-cream")}>
              &ldquo;<Typewriter text={last.suspectAnswer} />&rdquo;
            </p>
            <button type="button" onClick={replay} className={cn("hud mt-auto flex items-center gap-2 pt-3 text-[11px]", breaking ? "text-[#ff8a78]" : "text-amber")}>
              <SpeakingBars active={speaking} />
              {speaking ? `${first} is speaking` : last.offline ? (<><WifiOff className="size-3" /> Offline reply · tap to replay</>) : "Tap to replay"}
            </button>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col justify-center text-center">
            <p className="tw text-lg text-cream">{first} is waiting.</p>
            <p className="mt-2 text-sm text-dim">Hold the mic and ask your first question. Open questions get them talking; follow-ups and evidence pin them down.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {failed ? (
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={pop} className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-center" role="alert">
            <p className="text-sm">{failed.message}</p>
            <div className="mt-2 flex justify-center gap-2">
              <GameButton size="sm" onClick={() => send(failed.q, failed.evidenceId)}>Retry</GameButton>
              {failed.canOffline ? <GameButton size="sm" variant="ghost" onClick={() => send(failed.q, failed.evidenceId, true)}>Answer offline</GameButton> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const draftBar = (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send(draft);
      }}
    >
      <input
        autoFocus={typing}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Speak or type. One thing at a time."
        aria-label="Your question"
        className="h-12 min-w-0 flex-1 rounded-xl border border-cream/15 bg-[#1a1612] px-3.5 text-[15px] text-cream outline-none placeholder:text-dimmer focus:border-amber/60"
      />
      <GameButton type="submit" size="md" disabled={!draft.trim() || Boolean(pending)} aria-label="Ask" className="w-12 px-0">
        <SendHorizontal className="size-5" />
      </GameButton>
    </form>
  );

  const pickerSheet = (
    <Sheet open={picker} onClose={() => setPicker(false)} title="Put evidence on the table">
      {collected.length === 0 ? <p className="text-sm text-dim">You haven&apos;t collected any evidence yet. Search the scene first.</p> : null}
      <div className="cork -mx-5 grid grid-cols-2 gap-x-3.5 gap-y-5 px-5 py-5 sm:grid-cols-3">
        {collected.map((e, i) => (
          <EvidencePiece key={e.id} e={e} index={i} compact selected={pick === e.id} onClick={() => setPick(e.id)} />
        ))}
      </div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a question (optional)" aria-label="Question to go with the evidence" className="mt-4 h-12 w-full rounded-xl border border-cream/15 bg-ink px-3.5 text-[15px] text-cream outline-none placeholder:text-dimmer focus:border-amber/60" />
      <GameButton
        size="lg"
        className="mt-3 w-full"
        disabled={!pick || Boolean(pending)}
        onClick={() => {
          if (!pick) return;
          setPicker(false);
          send(draft, pick);
        }}
      >
        Show it to {first}
      </GameButton>
    </Sheet>
  );

  const notebook = (
    <ol className="tw space-y-0 pl-5 text-[14px] leading-7">
      {entries.length === 0 ? <li className="list-none text-paper-muted">Nothing on the record yet.</li> : null}
      {entries.map((e, i) => (
        <motion.li key={e.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...bounce, delay: i * 0.03 }}>
          &ldquo;{firstSentence(e.suspectAnswer)}&rdquo;
        </motion.li>
      ))}
    </ol>
  );

  /* ---------- desktop ---------- */
  if (isDesktop) {
    const earlier = entries.slice(-4, -1);
    return (
      <div ref={scope} className="relative flex min-h-dvh flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_50%_at_22%_10%,rgba(240,168,58,0.14),transparent_70%)]" />
        <header className="relative border-b border-cream/10 bg-[#120f0c]">
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-8 py-3.5">
            <IconLink href={`/case/${id}?tab=suspects`} label="Leave the room"><ArrowLeft /></IconLink>
            <div className="min-w-0 flex-1">
              <div className="hud text-xs text-amber">Interrogation room · {caseFile.title}</div>
              <div className="hud text-2xl font-bold">{suspect.name}</div>
            </div>
            <span className="hud flex h-10 items-center rounded-full border border-cream/20 px-4 text-[15px]">Question {entries.length + (pending ? 1 : 0) || 1}</span>
            <IconButton label={voice ? "Mute suspect voice" : "Unmute suspect voice"} onClick={toggleVoice}>{voice ? <Volume2 /> : <VolumeX />}</IconButton>
            <GameLink href={`/case/${id}/accuse`} variant="danger" size="sm"><Gavel className="size-4" /> Accuse</GameLink>
          </div>
        </header>
        <main className="relative mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-8 py-6">
          <section className="flex w-[380px] shrink-0 flex-col gap-4">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-cream/12">
              {portrait("absolute inset-0")}
              <div className="absolute inset-x-4 bottom-4 z-20">{namePlate}</div>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="hud text-sm font-semibold">Put evidence on the table</span>
                <span className="text-xs text-dimmer">{collected.length} items</span>
              </div>
              <div className="mt-2.5 grid grid-cols-5 gap-2">
                {collected.map((e) => (
                  <Pressable key={e.id} onClick={() => { setPick(e.id); setPicker(true); }} aria-label={`Show ${e.label}`} className="aspect-square overflow-hidden rounded-lg border border-cream/15">
                    {e.imageKey ? <CaseImage imageKey={e.imageKey} alt="" className="h-full w-full rounded-none" /> : <span className="tw flex h-full w-full items-center justify-center bg-paper p-1 text-center text-[10px] leading-tight text-paper-ink">{e.label}</span>}
                  </Pressable>
                ))}
              </div>
            </div>
          </section>
          <section className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex flex-col gap-2.5 px-1">
              {earlier.map((e) => (
                <motion.div key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5">
                  <div className="flex gap-3 text-[15px] text-dimmer"><span className="hud w-14 shrink-0 pt-0.5 text-xs">You</span><span>{e.playerQuestion}</span></div>
                  <div className="tw flex gap-3 text-[15px] text-[#d6c9b0]"><span className="hud w-14 shrink-0 pt-0.5 text-xs text-dim">{first}</span><span>{e.suspectAnswer}</span></div>
                </motion.div>
              ))}
            </div>
            <motion.div layout aria-live="polite" className={cn("flex-1 rounded-[18px] border bg-panel shadow-[0_20px_50px_rgba(0,0,0,0.5)]", breaking ? "border-alarm/60 bg-[#1c1210]" : "border-amber/35")}>
              {dialogue(true)}
            </motion.div>
            <div className="flex items-center gap-3.5 rounded-[18px] border border-cream/14 bg-[#1a1612] p-3 pl-4">
              <div className="min-w-0 flex-1">{draftBar}</div>
              <MicButton keywords={keywords} disabled={Boolean(pending)} onTranscript={(t) => setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t))} />
            </div>
          </section>
          <motion.aside initial={{ opacity: 0, rotate: 4, y: 30 }} animate={{ opacity: 1, rotate: 0.8, y: 0 }} transition={bounce} aria-label="Notebook" className="lined w-[300px] shrink-0 self-start rounded bg-paper-2 p-5 text-paper-ink shadow-[0_20px_44px_rgba(0,0,0,0.55)]">
            <div className="hud text-[13px] text-paper-muted">Notebook · {first}&rsquo;s statements</div>
            <div className="mt-2.5">{notebook}</div>
            <div className="tw mt-3.5 text-[13px] text-paper-muted">Contradictions aren&rsquo;t marked. Spot them yourself.</div>
          </motion.aside>
        </main>
        {pickerSheet}
      </div>
    );
  }

  /* ---------- mobile ---------- */
  return (
    <div ref={scope} className="relative flex h-dvh flex-col overflow-hidden">
      <div className="relative h-[50dvh] min-h-[320px] shrink-0">
        {portrait("absolute inset-0")}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 px-4 pt-4">
          <IconLink href={`/case/${id}?tab=suspects`} label="Leave the room"><ArrowLeft /></IconLink>
          <div className="min-w-0 flex-1">
            <div className={cn("hud text-[11px]", breaking ? "text-[#ff8a78]" : "text-amber")}>Interrogation room</div>
            <div className="hud text-base font-semibold">Question {entries.length + (pending ? 1 : 0) || 1}</div>
          </div>
          <IconButton label="Statements so far" onClick={() => setNotes(true)}><ScrollText /></IconButton>
          <IconButton label={voice ? "Mute suspect voice" : "Unmute suspect voice"} onClick={toggleVoice}>{voice ? <Volume2 /> : <VolumeX />}</IconButton>
        </div>
        <div className="absolute inset-x-4 bottom-3 z-20">{namePlate}</div>
      </div>

      <motion.section
        layout
        aria-live="polite"
        className={cn("relative mx-3 mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border bg-panel shadow-[0_16px_40px_rgba(0,0,0,0.55)]", breaking ? "border-alarm/60 bg-[#1c1210] shadow-[0_0_36px_rgba(255,90,69,0.18)]" : "border-amber/35")}
      >
        {dialogue(false)}
      </motion.section>

      <AnimatePresence>
        {typing || draft ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={bounce} className="overflow-hidden px-3">
            <div className="pt-2.5">{draftBar}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="pb-safe flex shrink-0 items-center justify-between px-5 pt-3">
        <ActionTile label="Evidence" onClick={() => setPicker(true)} disabled={Boolean(pending)}>
          <FolderOpen className="size-6" strokeWidth={1.8} />
        </ActionTile>
        <div className="flex flex-col items-center gap-2">
          <MicButton keywords={keywords} disabled={Boolean(pending)} onTranscript={(t) => setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t))} />
          <span className="hud text-[11px] text-dim">{breaking ? `Press ${first}` : "Hold to ask"}</span>
        </div>
        {breaking ? (
          <ActionTile label="Accuse" href={`/case/${id}/accuse`} danger>
            <Gavel className="size-6" strokeWidth={1.8} />
          </ActionTile>
        ) : (
          <ActionTile label={typing ? "Close" : "Type"} onClick={() => setTyping((t) => !t)}>
            {typing ? <X className="size-6" /> : <Keyboard className="size-6" strokeWidth={1.8} />}
          </ActionTile>
        )}
      </div>

      {pickerSheet}
      <Sheet open={notes} onClose={() => setNotes(false)} title={`${first}'s statements`}>
        <div className="lined -mx-5 bg-paper-2 px-5 py-4 text-paper-ink">{notebook}</div>
        <p className="mt-3 text-xs text-dim">Contradictions aren&rsquo;t marked. Spot them yourself.</p>
      </Sheet>
    </div>
  );
}

function firstSentence(s: string) {
  const m = s.match(/^.{0,140}?[.!?](\s|$)/);
  return (m ? m[0] : s.slice(0, 140)).trim();
}

function QuestionLine({ q, shown }: { q: string; shown?: string }) {
  return (
    <div>
      {shown ? (
        <motion.div initial={{ x: -20, rotate: -6, opacity: 0 }} animate={{ x: 0, rotate: -2, opacity: 1 }} transition={pop} className="tw mb-2 inline-block bg-paper px-2.5 py-1 text-xs text-paper-ink shadow">
          Shown: {shown}
        </motion.div>
      ) : null}
      <div className="flex items-baseline gap-2">
        <span className="hud shrink-0 text-[11px] text-dimmer">You</span>
        <span className="text-sm text-dim">{q}</span>
      </div>
    </div>
  );
}

function ActionTile({ children, label, onClick, href, disabled, danger }: { children: React.ReactNode; label: string; onClick?: () => void; href?: string; disabled?: boolean; danger?: boolean }) {
  const cls = cn("flex size-[72px] flex-col items-center justify-center gap-1 rounded-[18px] border", danger ? "border-alarm/50 bg-[#3a1712] text-[#ff8a78]" : "border-cream/16 bg-raised text-cream", disabled && "opacity-50");
  const inner = (
    <>
      {children}
      <span className="hud text-[11px]">{label}</span>
    </>
  );
  if (href)
    return (
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={pop}>
        <PressLink href={href} className={cls}>
          {inner}
        </PressLink>
      </motion.div>
    );
  return (
    <Pressable onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </Pressable>
  );
}

export default function InterrogatePage({ params }: { params: Promise<{ id: string; suspectId: string }> }) {
  const { id, suspectId } = use(params);
  return (
    <Suspense fallback={<Loading />}>
      <Room id={id} suspectId={suspectId} />
    </Suspense>
  );
}
