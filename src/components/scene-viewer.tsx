"use client";
import { Hand, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CaseImage } from "@/components/case-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { boxIoU, drawObjects, hitTest, locateEvidence, segmentPhrases, segmentPoint } from "@/lib/client/sam";
import type { CaseFile, SamObject, Session } from "@/lib/types";

const norm = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, ""));

function phraseMatches(phrase: string, target: string) {
  const p = new Set(norm(phrase));
  const t = norm(target);
  return t.length > 0 && t.some((w) => w.length > 3 && p.has(w));
}

/**
 * Investigation scene. Tap an object (or describe it) and SAM 3.1 segments it. If it matches a scene
 * evidence item's region it's collected. A list-based search is the fallback when SAM or the image is unavailable.
 */
export function SceneViewer({
  caseFile,
  session,
  aiAvailable,
  onCollect,
  onLocations,
}: {
  caseFile: CaseFile;
  session: Session;
  aiAvailable: boolean;
  onCollect: (evidenceId: string) => void;
  onLocations: (locs: Record<string, SamObject | null>) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [highlight, setHighlight] = useState<{ objects: SamObject[]; tone: "found" | "dim" } | null>(null);
  const [showList, setShowList] = useState(false);
  const [locating, setLocating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const locateTried = useRef(false);

  const sceneItems = caseFile.evidence.filter((e) => e.sceneRegionHint);
  const remaining = sceneItems.filter((e) => !session.collectedEvidenceIds.includes(e.id));
  const locs = caseFile.sceneLocations;

  // Redraw highlights on change and on resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawObjects(canvas, highlight?.objects ?? [], highlight?.tone ?? "found");
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [highlight, loaded]);

  // If the scene exists but evidence hasn't been located yet (e.g. SAM failed during generation), try once now.
  useEffect(() => {
    if (!loaded || !aiAvailable || locs || locateTried.current || sceneItems.length === 0) return;
    locateTried.current = true;
    setLocating(true);
    locateEvidence(caseFile)
      .then((l) => onLocations(l))
      .catch(() => setShowList(true))
      .finally(() => setLocating(false));
  }, [loaded, aiAvailable, locs, caseFile, onLocations, sceneItems.length]);

  const collect = useCallback(
    (id: string, obj?: SamObject | null) => {
      const ev = caseFile.evidence.find((e) => e.id === id)!;
      if (obj) setHighlight({ objects: [obj], tone: "found" });
      if (session.collectedEvidenceIds.includes(id)) {
        toast.message(`Already in your evidence: ${ev.label}`);
        return;
      }
      onCollect(id);
      navigator.vibrate?.([20, 40, 20]);
      toast.success(`Evidence found: ${ev.label}`);
    },
    [caseFile.evidence, onCollect, session.collectedEvidenceIds],
  );

  const matchByOverlap = (objs: SamObject[]) => {
    for (const o of objs) {
      for (const e of sceneItems) {
        const l = locs?.[e.id];
        if (l && boxIoU(o, l) > 0.3) return e.id;
      }
    }
    return null;
  };

  async function onTap(e: React.MouseEvent<HTMLDivElement>) {
    if (!loaded || busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    // 1) Precomputed SAM masks for the evidence (works offline once located).
    for (const ev of sceneItems) {
      const l = locs?.[ev.id];
      if (l && hitTest(l, fx * l.imageWidth, fy * l.imageHeight)) return collect(ev.id, l);
    }
    // 2) Live SAM point prompt to highlight whatever is there.
    if (!aiAvailable) {
      toast.message("Nothing useful here.");
      return;
    }
    setBusy(true);
    try {
      const objs = await segmentPoint(caseFile.scene.imageKey, fx, fy);
      const hit = matchByOverlap(objs);
      if (hit) return collect(hit, locs?.[hit] ?? objs[0]);
      setHighlight({ objects: objs, tone: "dim" });
      toast.message(objs.length ? "Nothing useful here." : "Nothing there.");
    } catch {
      toast.error("Scene search is unavailable right now. Use “Search by hand” below.");
      setShowList(true);
    } finally {
      setBusy(false);
    }
  }

  async function onDescribe(e: React.FormEvent) {
    e.preventDefault();
    const p = phrase.trim();
    if (!p || busy) return;
    const named = sceneItems.find((ev) => phraseMatches(p, `${ev.sceneRegionHint} ${ev.label}`));
    if (!aiAvailable || !loaded) {
      if (named && locs?.[named.id]) collect(named.id, locs[named.id]);
      else if (named && !loaded) collect(named.id);
      else toast.message("Nothing useful here.");
      setPhrase("");
      return;
    }
    setBusy(true);
    try {
      const [r] = await segmentPhrases(caseFile.scene.imageKey, [p]);
      const objs = r?.objects ?? [];
      const hit = matchByOverlap(objs) ?? (named && objs.length ? named.id : null);
      if (hit) collect(hit, locs?.[hit] ?? objs[0]);
      else {
        setHighlight({ objects: objs, tone: "dim" });
        toast.message(objs.length ? "SAM found it, but it's nothing useful." : `No “${p}” in this scene.`);
      }
      setPhrase("");
    } catch {
      toast.error("Scene search is unavailable right now. Use “Search by hand” below.");
      setShowList(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative overflow-hidden rounded-lg border border-border bg-black" onClick={onTap} role="button" aria-label="Crime scene. Tap an object to examine it.">
        <CaseImage
          imageKey={caseFile.scene.imageKey}
          alt="Crime scene"
          className="block h-auto w-full rounded-none"
          fallbackTitle="Crime scene"
          fallbackText={caseFile.scene.prompt}
          onLoadSize={() => setLoaded(true)}
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {busy || locating ? (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-primary">
            <Loader2 className="size-3 animate-spin" /> {locating ? "SAM is studying the scene" : "SAM is looking"}
          </div>
        ) : null}
        {loaded ? (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            Tap anything suspicious
          </div>
        ) : null}
      </div>

      <form onSubmit={onDescribe} className="flex gap-2">
        <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Or describe an object: “key tag”" aria-label="Describe an object to look for" />
        <Button type="submit" variant="secondary" disabled={busy || !phrase.trim()} aria-label="Look for it">
          <Search />
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {remaining.length ? `${remaining.length} clue${remaining.length > 1 ? "s" : ""} still hidden in the scene` : "You've found every clue in the scene."}
        </span>
        {remaining.length ? (
          <Button variant="link" size="xs" onClick={() => setShowList((v) => !v)}>
            <Hand /> {showList ? "Hide" : "Search by hand"}
          </Button>
        ) : null}
      </div>
      {showList || (!loaded && remaining.length) ? (
        <div className="flex flex-wrap gap-2" aria-label="Search the scene by hand">
          {remaining.map((e) => (
            <Button key={e.id} variant="outline" size="sm" onClick={() => collect(e.id, locs?.[e.id])}>
              Examine the {e.sceneRegionHint}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
