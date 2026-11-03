"use client";
import { Check, Lightbulb, Minus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CountUp, GameButton, GameLink, IconButton, Stamp, Typewriter, pop } from "@/components/game/ui";
import { ApiError, postJson } from "@/lib/client/api";
import { b64ToBlob, blobToScaledDataUrl, saveCase, saveImage } from "@/lib/client/db";
import { locateEvidence } from "@/lib/client/sam";
import type { CaseFile } from "@/lib/types";
import { sfx } from "@/lib/client/sfx";

type StageId = "write" | "check" | "scene" | "photos" | "locate" | "save";
type StageState = "todo" | "active" | "done" | "warn";

const STAGES: { id: StageId; label: string; model: string }[] = [
  { id: "write", label: "Writing the case file", model: "Muse Wonder" },
  { id: "check", label: "Checking it can be solved", model: "Muse Spark" },
  { id: "scene", label: "Painting the crime scene", model: "Muse Image" },
  { id: "photos", label: "Photographing evidence and suspects", model: "Muse Image" },
  { id: "locate", label: "Locating clues in the scene", model: "SAM 3.1" },
  { id: "save", label: "Filing the case", model: "" },
];

const INITIAL: Record<StageId, StageState> = { write: "todo", check: "todo", scene: "todo", photos: "todo", locate: "todo", save: "todo" };

type GenResponse = { caseFile: CaseFile; raw: unknown; problems: string[] };
type CheckResponse = { solvable: boolean; score: number; issues: string[] };

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

function Generating() {
  const router = useRouter();
  const params = useSearchParams();
  const theme = params.get("theme") ?? undefined;
  const [stages, setStages] = useState<Record<StageId, StageState>>(INITIAL);
  const [detail, setDetail] = useState<Partial<Record<StageId, string>>>({});
  const [error, setError] = useState<{ message: string; offerDemo: boolean } | null>(null);
  const [run, setRun] = useState(0);
  const [info, setInfo] = useState<{ title: string; setting: string; suspects: number } | null>(null);
  const [photosFrac, setPhotosFrac] = useState(0);
  const [tip, setTip] = useState(0);
  const [caseNo] = useState(() => String(Math.floor(1000 + Math.random() * 8999)).padStart(4, "0"));

  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 6500);
    return () => clearInterval(id);
  }, []);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;
    const signal = ac.signal;
    const mark = (id: StageId, s: StageState, d?: string) => {
      if (s === "done") sfx(id === "save" ? "ready" : "tick");
      setStages((p) => ({ ...p, [id]: s }));
      if (d !== undefined) setDetail((p) => ({ ...p, [id]: d }));
    };

    (async () => {
      try {
        // 1-2. Case file + solvability check, repairing up to 2 times.
        mark("write", "active");
        let gen = await postJson<GenResponse>("/api/case", { mode: "generate", theme }, signal);
        mark("write", "done", gen.caseFile.title);
        setInfo({ title: gen.caseFile.title, setting: gen.caseFile.setting, suspects: gen.caseFile.suspects.length });
        let solvable = false;
        for (let attempt = 0; attempt <= 2; attempt++) {
          mark("check", "active", attempt ? `Repair ${attempt} of 2` : "");
          let check: CheckResponse;
          try {
            check = await postJson<CheckResponse>("/api/case/check", { raw: gen.raw }, signal);
          } catch (err) {
            if ((err as ApiError).code === "cancelled") throw err;
            // Validator unavailable: accept the case if it passed the structural checks.
            check = { solvable: gen.problems.length === 0, score: 0, issues: gen.problems };
          }
          if (check.solvable) {
            solvable = true;
            break;
          }
          if (attempt === 2) break;
          mark("write", "active", "Fixing loose ends");
          gen = await postJson<GenResponse>("/api/case", { mode: "repair", raw: gen.raw, issues: check.issues, id: gen.caseFile.id }, signal);
          mark("write", "done", gen.caseFile.title);
        }
        if (!solvable) {
          setError({ message: "We couldn't build a case that's fair to solve this time.", offerDemo: true });
          mark("check", "warn");
          return;
        }
        mark("check", "done", "Solvable");
        const c = gen.caseFile;

        // 3. Scene image.
        mark("scene", "active");
        let sceneRef: string | undefined;
        let sceneOk = false;
        try {
          const img = await postJson<{ b64: string; mime: string }>("/api/image", { kind: "scene", prompt: c.scene.prompt }, signal);
          const blob = b64ToBlob(img.b64, img.mime);
          await saveImage(c.scene.imageKey, blob);
          sceneRef = (await blobToScaledDataUrl(blob, 768, 0.8)).dataUrl;
          sceneOk = true;
          mark("scene", "done");
        } catch (err) {
          if ((err as ApiError).code === "cancelled") throw err;
          mark("scene", "warn", "Skipped. You can search the scene by hand.");
        }

        // 4. Evidence photos (scene as reference) and portraits, in parallel.
        const jobs = [
          ...c.evidence.filter((e) => e.imagePrompt && e.imageKey).map((e) => ({ key: e.imageKey!, kind: "evidence" as const, prompt: e.imagePrompt!, ref: e.sceneRegionHint ? sceneRef : undefined })),
          ...c.suspects.map((s) => ({ key: s.portrait.imageKey, kind: "portrait" as const, prompt: s.portrait.prompt, ref: undefined })),
        ];
        let done = 0;
        let failed = 0;
        mark("photos", "active", `0 of ${jobs.length}`);
        await pool(jobs, 4, async (j) => {
          try {
            const img = await postJson<{ b64: string; mime: string }>("/api/image", { kind: j.kind, prompt: j.prompt, reference: j.ref }, signal);
            await saveImage(j.key, b64ToBlob(img.b64, img.mime));
          } catch (err) {
            if ((err as ApiError).code === "cancelled") throw err;
            failed++;
          }
          done++;
          setPhotosFrac(done / jobs.length);
          mark("photos", "active", `${done} of ${jobs.length}`);
        });
        mark("photos", failed ? "warn" : "done", failed ? `${failed} shown as text cards` : `${jobs.length} done`);

        // 5. SAM locates each scene clue once, so taps work instantly (and offline) afterwards.
        if (sceneOk) {
          mark("locate", "active");
          try {
            c.sceneLocations = await locateEvidence(c, signal);
            const found = Object.values(c.sceneLocations).filter(Boolean).length;
            mark("locate", "done", `${found} of ${Object.keys(c.sceneLocations).length} found`);
          } catch (err) {
            if ((err as ApiError).code === "cancelled") throw err;
            mark("locate", "warn", "We'll try again on the board.");
          }
        } else mark("locate", "warn", "No scene image");

        // 6. Save.
        mark("save", "active");
        await saveCase(c);
        mark("save", "done");
        router.replace(`/case/${c.id}`);
      } catch (err) {
        if (signal.aborted || (err as ApiError).code === "cancelled") return;
        const e = err as ApiError;
        sfx("error");
        setError({ message: e.message || "Case generation failed.", offerDemo: true });
      }
    })();
    return () => ac.abort();
  }, [run, theme, router]);

  // Overall progress, weighted by how long each stage usually takes.
  const W: Record<StageId, number> = { write: 32, check: 10, scene: 14, photos: 34, locate: 7, save: 3 };
  const pct = Math.round(
    (Object.keys(W) as StageId[]).reduce((a, id) => {
      const st = stages[id];
      if (st === "done" || st === "warn") return a + W[id];
      if (st === "active") return a + W[id] * (id === "photos" ? photosFrac : 0.35);
      return a;
    }, 0),
  );

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col gap-5 px-5 pb-6 pt-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_18%,rgba(240,168,58,0.22),transparent_70%)]" />
      <div className="relative flex items-center justify-between">
        <span className="hud text-[13px] text-dim">Opening case file</span>
        <IconButton
          label="Cancel"
          onClick={() => {
            abortRef.current?.abort();
            router.push("/");
          }}
        >
          <X />
        </IconButton>
      </div>

      {/* The case folder */}
      <div className="relative mt-1 h-[290px]">
        <motion.div initial={{ y: 60, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 16 }} className="absolute inset-0">
          <div className="absolute left-6 top-0 h-[34px] w-[120px] rounded-t-lg bg-[#b8935a]" />
          <div className="absolute inset-x-6 bottom-0 top-[26px] rounded-[4px_10px_10px_10px] bg-manila shadow-[0_24px_50px_rgba(0,0,0,0.6)]" />
          <motion.div
            initial={{ y: 40, rotate: 2 }}
            animate={{ y: [40, 0, 4, 0], rotate: -2 }}
            transition={{ duration: 1.1, delay: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
            className="absolute inset-x-11 top-[46px] h-[226px] bg-paper p-5 text-paper-ink shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          >
            <div className="tw text-sm">CASE No. {caseNo}</div>
            <div className="tw mt-3 text-xs text-paper-muted">SETTING</div>
            <div className="tw text-sm">
              {info ? <Typewriter text={info.setting} speed={28} sound /> : <RedactBar w="70%" />}
            </div>
            <div className="tw mt-3 text-xs text-paper-muted">INCIDENT</div>
            {info ? (
              <div className="tw line-clamp-3 text-[12px] leading-snug">
                <Typewriter text={info.title} speed={30} sound />
              </div>
            ) : (
              <div className="mt-1.5 flex flex-col gap-[7px]">
                <RedactBar w="92%" />
                <RedactBar w="74%" />
                <RedactBar w="84%" faint />
              </div>
            )}
            <div className="tw mt-3 text-xs text-paper-muted">SUSPECTS: {info ? info.suspects : "?"}</div>
          </motion.div>
        </motion.div>
        <Stamp tone="ink" rotate={-12} delay={0.9} className="absolute bottom-6 right-9 bg-paper/35 text-lg">
          Classified
        </Stamp>
      </div>

      <div className="relative">
        <div className="flex items-baseline justify-between">
          <span className="hud text-xl font-bold">Building the case</span>
          <span className="hud text-sm text-amber">
            <CountUp value={pct} duration={0.6} delay={0} />%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-well">
          <motion.div className="h-full rounded-full bg-amber shadow-[0_0_12px_#f0a83a]" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 60, damping: 16 }} />
        </div>
      </div>

      <ol className="relative flex flex-col gap-1">
        {STAGES.map((st, i) => {
          const state = stages[st.id];
          return (
            <motion.li key={st.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.2 + i * 0.06 }} className="flex min-h-10 items-center gap-3">
              <StageDot state={state} />
              <span className="min-w-0 flex-1">
                <span className={state === "active" ? "font-semibold text-amber" : state === "todo" ? "text-dimmer" : ""}>{st.label}</span>
                <AnimatePresence>
                  {detail[st.id] ? (
                    <motion.span key={detail[st.id]} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="block truncate text-xs text-dim">
                      {detail[st.id]}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
              {st.model ? <span className="hud text-[11px] text-dimmer">{st.model}</span> : null}
            </motion.li>
          );
        })}
      </ol>

      {error ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={pop} className="relative rounded-2xl border border-danger/40 bg-danger/10 p-4 text-center" role="alert">
          <p className="text-sm">{error.message}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <GameButton
              onClick={() => {
                setError(null);
                setStages(INITIAL);
                setDetail({});
                setInfo(null);
                setPhotosFrac(0);
                setRun((r) => r + 1);
              }}
            >
              Retry
            </GameButton>
            {error.offerDemo ? (
              <GameLink href="/" variant="ghost">
                Play the training case
              </GameLink>
            ) : null}
          </div>
        </motion.div>
      ) : (
        <div className="relative mt-auto flex gap-3 rounded-2xl border border-cream/10 bg-raised p-3.5">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber" />
          <div className="min-w-0">
            <div className="hud text-xs text-amber">Detective tip</div>
            <AnimatePresence mode="wait">
              <motion.p key={tip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-1 text-sm leading-relaxed text-[#d6c9b0]">
                {TIPS[tip]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      )}
    </main>
  );
}

const TIPS = [
  "Lock a witness into an exact time first. Then show the evidence that breaks it.",
  "Open questions get them talking. Save yes-or-no questions for pinning details down.",
  "Ask one thing at a time. Compound questions let a witness dodge half of it.",
  "When an answer is vague, repeat their own words back and ask for specifics.",
  "Everyone lies about something. Not every liar is the culprit.",
];

function RedactBar({ w, faint }: { w: string; faint?: boolean }) {
  return <motion.div className="h-[11px] bg-paper-ink" style={{ width: w }} animate={{ opacity: faint ? [0.2, 0.45, 0.2] : [0.85, 1, 0.85] }} transition={{ duration: 1.6, repeat: Infinity }} />;
}

function StageDot({ state }: { state: StageState }) {
  return (
    <span className="relative flex size-[26px] shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout">
        {state === "done" ? (
          <motion.span key="done" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={pop} className="flex size-[26px] items-center justify-center rounded-full bg-amber text-amber-ink">
            <Check className="size-3.5" strokeWidth={3.5} />
          </motion.span>
        ) : state === "warn" ? (
          <motion.span key="warn" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={pop} className="flex size-[26px] items-center justify-center rounded-full border-2 border-dim text-dim">
            <Minus className="size-3.5" strokeWidth={3} />
          </motion.span>
        ) : state === "active" ? (
          <motion.span key="active" initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex size-[26px] items-center justify-center rounded-full border-2 border-amber">
            <motion.span className="size-2.5 rounded-full bg-amber" animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
          </motion.span>
        ) : (
          <motion.span key="todo" className="size-[26px] rounded-full border-2 border-[#4a4036]" />
        )}
      </AnimatePresence>
    </span>
  );
}

export default function NewCasePage() {
  return (
    <Suspense>
      <Generating />
    </Suspense>
  );
}
