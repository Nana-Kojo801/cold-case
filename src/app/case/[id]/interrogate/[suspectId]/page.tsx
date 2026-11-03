"use client";
import { Loader2, ScrollText, SendHorizontal, Volume2, VolumeX, WifiOff } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { CaseImage } from "@/components/case-image";
import { EvidencePicker } from "@/components/evidence-picker";
import { MicButton } from "@/components/mic-button";
import { ErrorPanel, Loading, TopBar } from "@/components/shell";
import { StressMeter } from "@/components/stress-meter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, getHealth } from "@/lib/client/api";
import { loadSettings, saveSettings } from "@/lib/client/db";
import { speak, stopSpeaking } from "@/lib/client/tts";
import { analyzeTurn, askSuspect } from "@/lib/client/turn";
import { useCase } from "@/lib/client/useCase";
import { breaksNow, CRACK_THRESHOLD, heuristicTags } from "@/lib/game";
import type { LedgerEntry } from "@/lib/types";

const now = () => Date.now();

export default function InterrogatePage({ params }: { params: Promise<{ id: string; suspectId: string }> }) {
  const { id, suspectId } = use(params);
  const { caseFile, session, error, update, sessionRef } = useCase(id);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ q: string; evidenceId?: string } | null>(null);
  const [failed, setFailed] = useState<{ q: string; evidenceId?: string; message: string; canOffline: boolean } | null>(null);
  const [voice, setVoice] = useState(true);
  const [ai, setAi] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reading localStorage after mount avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoice(loadSettings().voice);
    getHealth().then((h) => setAi(h.ai));
    return () => stopSpeaking();
  }, []);

  const suspect = caseFile?.suspects.find((s) => s.id === suspectId);
  const entries = useMemo(() => session?.ledger.filter((e) => e.suspectId === suspectId) ?? [], [session, suspectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, pending]);

  const keywords = useMemo(
    () => (caseFile ? [...caseFile.suspects.map((s) => s.name), ...caseFile.evidence.map((e) => e.label)].slice(0, 30) : []),
    [caseFile],
  );

  if (error)
    return (
      <main className="p-6">
        <ErrorPanel message={error} />
      </main>
    );
  if (!caseFile || !session) return <Loading />;
  if (!suspect)
    return (
      <main className="p-6">
        <ErrorPanel message="That suspect isn't in this case.">
          <Button asChild>
            <Link href={`/case/${id}`}>Back to the board</Link>
          </Button>
        </ErrorPanel>
      </main>
    );

  const stress = session.stress?.[suspectId] ?? 0;
  const cracked = Boolean(session.cracked?.[suspectId]);
  const collected = caseFile.evidence.filter((e) => session.collectedEvidenceIds.includes(e.id));
  const offlineAllowed = caseFile.source === "demo" || !ai;

  async function send(q: string, evidenceId?: string, forceOffline = false) {
    if (!caseFile || !suspect || pending) return;
    const question = q.trim() || (evidenceId ? "Explain this." : "");
    if (!question) return;
    setFailed(null);
    setPending({ q: question, evidenceId });
    stopSpeaking();
    const s0 = sessionRef.current!;
    try {
      const r = await askSuspect({
        caseFile,
        session: s0,
        suspectId,
        question,
        presentEvidenceId: evidenceId,
        allowOffline: offlineAllowed || forceOffline,
      });
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
      setPending(null);
      if (voice) {
        setSpeakingId(entry.id);
        speak(r.answer, suspect.id, suspect.voice, () => setSpeakingId(null));
      }

      // Contradiction check runs in the background while the suspect speaks.
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

  const ev = (eid?: string) => caseFile.evidence.find((e) => e.id === eid);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        back={`/case/${id}`}
        title={suspect.name}
        right={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={voice ? "Mute suspect voice" : "Unmute suspect voice"}
              onClick={() => {
                const v = !voice;
                setVoice(v);
                saveSettings({ ...loadSettings(), voice: v });
                if (!v) stopSpeaking();
              }}
            >
              {voice ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Statements">
              <Link href={`/case/${id}/statements?s=${suspectId}`}>
                <ScrollText />
              </Link>
            </Button>
          </>
        }
      />

      <section className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <CaseImage
          imageKey={suspect.portrait.imageKey}
          alt={suspect.name}
          className={`size-20 shrink-0 ring-2 transition-all ${speakingId ? "ring-primary" : "ring-transparent"} ${cracked ? "grayscale-[40%]" : ""}`}
          fallbackTitle={suspect.name.split(" ")[0]}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-xs text-muted-foreground">{suspect.role}</div>
          <StressMeter value={stress} cracked={cracked} />
        </div>
      </section>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 overflow-y-auto px-4 pb-4" aria-live="polite">
        {entries.length === 0 && !pending ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Hold the mic and ask your first question. Open questions get them talking; follow-ups and evidence pin them down.
          </p>
        ) : null}
        {entries.map((e) => (
          <div key={e.id} className="space-y-2">
            <Bubble side="right">
              {e.presentedEvidenceId ? <span className="mb-1 block text-[11px] uppercase tracking-wider opacity-80">Shows: {ev(e.presentedEvidenceId)?.label}</span> : null}
              {e.playerQuestion}
            </Bubble>
            <Bubble side="left" speaking={speakingId === e.id} onClick={() => voice && speak(e.suspectAnswer, suspect.id, suspect.voice)}>
              {e.suspectAnswer}
              {e.offline ? (
                <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <WifiOff className="size-3" /> offline reply
                </span>
              ) : null}
            </Bubble>
          </div>
        ))}
        {pending ? (
          <div className="space-y-2">
            <Bubble side="right">
              {pending.evidenceId ? <span className="mb-1 block text-[11px] uppercase tracking-wider opacity-80">Shows: {ev(pending.evidenceId)?.label}</span> : null}
              {pending.q}
            </Bubble>
            <Bubble side="left">
              <Loader2 className="size-4 animate-spin" />
            </Bubble>
          </div>
        ) : null}
        {failed ? (
          <ErrorPanel message={failed.message} onRetry={() => send(failed.q, failed.evidenceId)}>
            {failed.canOffline ? (
              <Button variant="secondary" size="lg" onClick={() => send(failed.q, failed.evidenceId, true)}>
                Answer offline
              </Button>
            ) : null}
          </ErrorPanel>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="pb-safe border-t border-border bg-background/95 px-3 pt-2">
        <div className="mx-auto max-w-2xl space-y-2">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your question (speak or type)"
              rows={1}
              className="max-h-28 min-h-11 resize-none"
              aria-label="Your question"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <Button type="submit" size="icon-lg" className="size-11" disabled={!draft.trim() || Boolean(pending)} aria-label="Ask">
              <SendHorizontal />
            </Button>
          </form>
          <div className="flex items-center justify-between gap-3 pb-1">
            <EvidencePicker items={collected} disabled={Boolean(pending)} onPresent={(eid) => send(draft, eid)} />
            <MicButton keywords={keywords} disabled={Boolean(pending)} onTranscript={(t) => setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t))} />
            <Button asChild variant="secondary" size="lg" className="h-14 flex-col gap-0.5 px-3 text-xs">
              <Link href={`/case/${id}`}>
                <span className="text-base leading-none">⌂</span>
                Board
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, children, speaking, onClick }: { side: "left" | "right"; children: React.ReactNode; speaking?: boolean; onClick?: () => void }) {
  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div
        onClick={onClick}
        className={
          side === "right"
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
            : `max-w-[85%] rounded-2xl rounded-bl-sm border bg-card px-3 py-2 font-case text-sm leading-relaxed ${speaking ? "border-primary" : "border-border"}`
        }
      >
        {children}
      </div>
    </div>
  );
}
