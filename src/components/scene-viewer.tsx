"use client";
import { Check, Hand, Loader2, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CaseImage } from "@/components/case-image";
import { GameButton, Sheet, bounce, pop } from "@/components/game/ui";
import { boxIoU, drawObjects, locateEvidence, segmentPhrases, segmentPoint, tapHits } from "@/lib/client/sam";
import type { CaseFile, SamObject, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

const norm = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, ""));

function phraseMatches(phrase: string, target: string) {
  const p = new Set(norm(phrase));
  const t = norm(target);
  return t.length > 0 && t.some((w) => w.length > 3 && p.has(w));
}

type Ping = { id: number; x: number; y: number; text: string };

function boxStyle(o: SamObject, pad = 1.2) {
  const [l, t, r, b] = o.box;
  return {
    left: `${(l / o.imageWidth) * 100 - pad}%`,
    top: `${(t / o.imageHeight) * 100 - pad * 1.5}%`,
    width: `${((r - l) / o.imageWidth) * 100 + pad * 2}%`,
    height: `${((b - t) / o.imageHeight) * 100 + pad * 3}%`,
  };
}

/**
 * The crime scene. Tap an object (or describe it) and SAM 3.1 segments it; matching a scene clue collects it.
 * On phones the scene fills the height and pans sideways; on desktop it shows whole.
 */
export function SceneViewer({
  caseFile,
  session,
  aiAvailable,
  onCollect,
  onLocations,
  variant,
  overlay,
}: {
  caseFile: CaseFile;
  session: Session;
  aiAvailable: boolean;
  onCollect: (evidenceId: string) => void;
  onLocations: (locs: Record<string, SamObject | null>) => void;
  variant: "mobile" | "desktop";
  overlay?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [highlight, setHighlight] = useState<SamObject[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [found, setFound] = useState<{ id: string; n: number } | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const locateTried = useRef(false);
  const pingId = useRef(0);

  const sceneItems = caseFile.evidence.filter((e) => e.sceneRegionHint);
  const remaining = sceneItems.filter((e) => !session.collectedEvidenceIds.includes(e.id));
  const locs = caseFile.sceneLocations;
  const mobile = variant === "mobile";

  // Draw the dim SAM highlight (from taps that hit no clue); it fades after a moment.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawObjects(canvas, highlight, "dim");
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    if (!highlight.length) return () => ro.disconnect();
    const t = setTimeout(() => setHighlight([]), 1800);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [highlight, loaded]);

  // Centre the pannable scene once it loads.
  useEffect(() => {
    const el = scrollRef.current;
    if (loaded && el && mobile) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [loaded, mobile]);

  // If the scene exists but clues weren't located yet (e.g. SAM failed during generation), try once now.
  useEffect(() => {
    if (!loaded || !aiAvailable || locs || locateTried.current || sceneItems.length === 0) return;
    locateTried.current = true;
     
    setLocating(true);
    locateEvidence(caseFile)
      .then((l) => onLocations(l))
      .catch(() => undefined)
      .finally(() => setLocating(false));
  }, [loaded, aiAvailable, locs, caseFile, onLocations, sceneItems.length]);

  // Auto-dismiss the "evidence found" card.
  useEffect(() => {
    if (!found) return;
    const t = setTimeout(() => setFound(null), 2800);
    return () => clearTimeout(t);
  }, [found]);

  const ping = useCallback((x: number, y: number, text: string) => {
    const id = ++pingId.current;
    setPings((p) => [...p, { id, x, y, text }]);
    setTimeout(() => setPings((p) => p.filter((q) => q.id !== id)), 1400);
  }, []);

  const collect = useCallback(
    (id: string) => {
      const ev = caseFile.evidence.find((e) => e.id === id)!;
      if (session.collectedEvidenceIds.includes(id)) {
        toast.message(`Already in your evidence: ${ev.label}`);
        return;
      }
      onCollect(id);
      navigator.vibrate?.([20, 40, 30]);
      setFound({ id, n: Date.now() });
    },
    [caseFile.evidence, onCollect, session.collectedEvidenceIds],
  );

  const matchByOverlap = (objs: SamObject[]) => {
    for (const o of objs) for (const e of sceneItems) {
      const l = locs?.[e.id];
      if (l && boxIoU(o, l) > 0.3) return e.id;
    }
    return null;
  };

  async function onTap(e: React.MouseEvent<HTMLDivElement>) {
    if (!loaded || busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    for (const ev of sceneItems) {
      const l = locs?.[ev.id];
      if (l && tapHits(l, fx, fy)) return collect(ev.id);
    }
    if (!aiAvailable) return ping(fx, fy, "Nothing useful here");
    setBusy(true);
    try {
      const objs = await segmentPoint(caseFile.scene.imageKey, fx, fy);
      const hit = matchByOverlap(objs);
      if (hit) return collect(hit);
      setHighlight(objs);
      ping(fx, fy, objs.length ? "Nothing useful here" : "Nothing there");
    } catch {
      toast.error("Scene search is unavailable right now. Try “Search by hand”.");
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
      if (named) collect(named.id);
      else toast.message("Nothing useful here.");
      setPhrase("");
      return;
    }
    setBusy(true);
    try {
      const [r] = await segmentPhrases(caseFile.scene.imageKey, [p]);
      const objs = r?.objects ?? [];
      const hit = matchByOverlap(objs) ?? (named && objs.length ? named.id : null);
      if (hit) collect(hit);
      else {
        setHighlight(objs);
        toast.message(objs.length ? "SAM found it, but it's nothing useful." : `No “${p}” in this scene.`);
      }
      setPhrase("");
    } catch {
      toast.error("Scene search is unavailable right now. Try “Search by hand”.");
    } finally {
      setBusy(false);
    }
  }

  const foundEv = found ? caseFile.evidence.find((e) => e.id === found.id) : null;

  const marks = (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {sceneItems.map((ev) => {
        const l = locs?.[ev.id];
        if (!l || !session.collectedEvidenceIds.includes(ev.id)) return null;
        const fresh = found?.id === ev.id;
        return (
          <motion.div key={ev.id} className="pointer-events-none absolute" style={boxStyle(l)} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={pop}>
            <div className={cn("absolute inset-0 rounded-xl", fresh ? "border-[2.5px] border-amber shadow-[0_0_0_5px_rgba(240,168,58,0.22),0_0_28px_rgba(240,168,58,0.75)]" : "border-[1.5px] border-dashed border-amber/70")} />
            {fresh ? <motion.div className="absolute inset-0 rounded-xl border-2 border-amber" initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 0.9, repeat: 2 }} /> : null}
            {fresh ? (
              <motion.div initial={{ y: 10, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ ...pop, delay: 0.15 }} className="hud absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-amber px-2.5 py-1 text-xs font-bold text-amber-ink">
                {ev.label} · +1
              </motion.div>
            ) : (
              <span className="absolute -right-2.5 -top-2.5 flex size-6 items-center justify-center rounded-full bg-amber text-amber-ink">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
          </motion.div>
        );
      })}
      <AnimatePresence>
        {pings.map((p) => (
          <motion.div key={p.id} className="pointer-events-none absolute" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
            <motion.span className="absolute -left-6 -top-6 size-12 rounded-full border-2 border-cream/70" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.6 }} />
            <motion.span
              className="hud absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/80 px-3 py-1 text-xs text-cream"
              initial={{ y: -10, opacity: 0, scale: 0.7 }}
              animate={{ y: -42, opacity: [0, 1, 1, 0], scale: 1 }}
              transition={{ duration: 1.3, times: [0, 0.15, 0.75, 1] }}
            >
              {p.text}
            </motion.span>
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );

  const foundCard = (
    <AnimatePresence>
      {foundEv ? (
        <motion.div
          key={found!.n}
          initial={{ y: -40, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -30, opacity: 0, scale: 0.9 }}
          transition={pop}
          className={cn("pointer-events-none absolute z-30 flex items-center gap-3 rounded-2xl border border-amber/50 bg-panel/95 py-2 pl-2 pr-3.5 shadow-[0_12px_30px_rgba(0,0,0,0.5)]", mobile ? "inset-x-4 top-[84px]" : "right-4 top-4 w-80")}
        >
          <CaseImage imageKey={foundEv.imageKey} alt="" className="size-12 shrink-0 rounded-lg" fallbackTitle="Clue" />
          <div className="min-w-0 flex-1">
            <div className="hud text-xs text-amber">Evidence found</div>
            <div className="tw truncate text-[15px]">{foundEv.label}</div>
          </div>
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: [0, 1.5, 1], rotate: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="hud text-2xl font-bold text-amber">
            +1
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const status = busy || locating ? (
    <div className="hud absolute right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-amber" style={{ top: mobile ? 72 : 12 }}>
      <Loader2 className="size-3 animate-spin" /> {locating ? "SAM is studying the scene" : "SAM is looking"}
    </div>
  ) : null;

  const controls = (
    <div className={cn("flex flex-col gap-2", mobile && "px-4")}>
      <form onSubmit={onDescribe} className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2.5 rounded-xl border border-cream/14 bg-[#1a1612] px-3.5 focus-within:border-amber/60">
          <Search className="size-[18px] shrink-0 text-dimmer" />
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Describe an object to examine" aria-label="Describe an object to examine" className="min-w-0 flex-1 bg-transparent text-[15px] text-cream outline-none placeholder:text-dimmer" />
        </label>
        <GameButton type="submit" variant="dark" className="text-amber" disabled={busy || !phrase.trim()}>
          Look
        </GameButton>
      </form>
      <div className="flex items-center justify-between text-[13px] text-dimmer">
        <span>{remaining.length ? `${remaining.length} clue${remaining.length > 1 ? "s" : ""} still hidden here` : "You've found every clue in the scene."}</span>
        {remaining.length ? (
          <button type="button" onClick={() => setListOpen(true)} className="flex min-h-8 items-center gap-1 font-semibold text-amber">
            <Hand className="size-3.5" /> Search by hand
          </button>
        ) : null}
      </div>
    </div>
  );

  const handSheet = (
    <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Search by hand">
      <p className="mb-4 text-sm text-dim">Run your hands over the room. Pick something to examine.</p>
      <div className="flex flex-wrap gap-2">
        {remaining.map((e, i) => (
          <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...bounce, delay: i * 0.05 }}>
            <GameButton
              variant="ghost"
              size="sm"
              className="font-semibold normal-case tracking-normal"
              onClick={() => {
                setListOpen(false);
                collect(e.id);
              }}
            >
              Examine the {e.sceneRegionHint}
            </GameButton>
          </motion.div>
        ))}
      </div>
    </Sheet>
  );

  const image = (
    <CaseImage
      imageKey={caseFile.scene.imageKey}
      alt="Crime scene. Tap an object to examine it."
      className={cn("block max-w-none rounded-none", mobile ? "h-full w-auto" : "h-full w-full object-cover")}
      fallbackTitle="Crime scene"
      fallbackText={caseFile.scene.prompt}
      onLoadSize={() => setLoaded(true)}
    />
  );

  if (mobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
        <div className="relative h-[60dvh] min-h-[380px] shrink-0">
          <div ref={scrollRef} className="no-scrollbar h-full overflow-x-auto overflow-y-hidden">
            <div className={cn("relative h-full", loaded ? "w-max" : "w-full")} onClick={onTap}>
              {image}
              {loaded ? marks : null}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(13,11,9,0.85)_0%,transparent_22%,transparent_78%,#0d0b09_100%)]" />
          {overlay}
          {status}
          {foundCard}
          {loaded ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-ink/70 px-3.5 py-2 text-[13px]">
              <Hand className="size-4" /> Tap anything suspicious · drag to look around
            </motion.div>
          ) : null}
        </div>
        {controls}
        {handSheet}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-cream/12 bg-black">
        <div className="relative h-full w-full cursor-crosshair" onClick={onTap}>
          {image}
          {loaded ? marks : null}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_50%_50%,transparent_60%,rgba(0,0,0,0.5)_100%)]" />
        {status}
        {foundCard}
      </div>
      {controls}
      {handSheet}
    </div>
  );
}
