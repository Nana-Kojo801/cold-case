"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptySession } from "@/lib/game";
import type { CaseFile, Session } from "@/lib/types";
import { loadCase, loadSession, saveSession } from "./db";

/** Load a case and its play session from IndexedDB; `update` persists every change. */
export function useCase(caseId: string) {
  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Session | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await loadCase(caseId);
        if (!c) throw new Error("We couldn't find that case on this device.");
        const s = (await loadSession(caseId)) ?? emptySession(caseId);
        // Documents from the case file are in hand from the start; scene objects must be found.
        const fileIds = c.evidence.filter((e) => !e.sceneRegionHint).map((e) => e.id);
        const missing = fileIds.filter((id) => !s.collectedEvidenceIds.includes(id));
        if (missing.length) s.collectedEvidenceIds = [...s.collectedEvidenceIds, ...missing];
        if (!alive) return;
        ref.current = s;
        setCaseFile(c);
        setSession(s);
        saveSession(s);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [caseId]);

  const update = useCallback((fn: (s: Session) => Session) => {
    if (!ref.current) return;
    const next = fn(ref.current);
    ref.current = next;
    setSession(next);
    saveSession(next);
  }, []);

  const replaceCase = useCallback((c: CaseFile) => setCaseFile(c), []);

  return { caseFile, session, error, update, replaceCase, sessionRef: ref };
}
