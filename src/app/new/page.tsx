"use client";
import { Check, Circle, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ErrorPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ApiError, postJson } from "@/lib/client/api";
import { b64ToBlob, blobToScaledDataUrl, saveCase, saveImage } from "@/lib/client/db";
import { locateEvidence } from "@/lib/client/sam";
import type { CaseFile } from "@/lib/types";

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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;
    const signal = ac.signal;
    const mark = (id: StageId, s: StageState, d?: string) => {
      setStages((p) => ({ ...p, [id]: s }));
      if (d !== undefined) setDetail((p) => ({ ...p, [id]: d }));
    };

    (async () => {
      try {
        // 1-2. Case file + solvability check, repairing up to 2 times.
        mark("write", "active");
        let gen = await postJson<GenResponse>("/api/case", { mode: "generate", theme }, signal);
        mark("write", "done", gen.caseFile.title);
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
        setError({ message: e.message || "Case generation failed.", offerDemo: true });
      }
    })();
    return () => ac.abort();
  }, [run, theme, router]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 pb-10 pt-12">
      <div className="space-y-1 text-center">
        <h1 className="font-case text-2xl text-primary">Building the case...</h1>
        <p className="text-xs text-muted-foreground">A fresh, solvable mystery takes a minute or two.</p>
      </div>
      <ol className="space-y-3">
        {STAGES.map((s) => {
          const st = stages[s.id];
          return (
            <li key={s.id} className="flex items-start gap-3 rounded-md border border-border bg-card/50 p-3">
              <span className="mt-0.5">
                {st === "done" ? (
                  <Check className="size-5 text-[var(--stress-low)]" />
                ) : st === "active" ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : st === "warn" ? (
                  <X className="size-5 text-[var(--stress-mid)]" />
                ) : (
                  <Circle className="size-5 text-muted-foreground/40" />
                )}
              </span>
              <span className="flex-1">
                <span className={st === "todo" ? "text-muted-foreground" : ""}>{s.label}</span>
                {s.model ? <span className="ml-2 text-[11px] uppercase tracking-wider text-muted-foreground">{s.model}</span> : null}
                {detail[s.id] ? <span className="block text-xs text-muted-foreground">{detail[s.id]}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {error ? (
        <ErrorPanel
          message={error.message}
          onRetry={() => {
            setError(null);
            setStages(INITIAL);
            setDetail({});
            setRun((r) => r + 1);
          }}
        >
          {error.offerDemo ? (
            <Button asChild variant="secondary" size="lg">
              <Link href="/">Play the demo case</Link>
            </Button>
          ) : null}
        </ErrorPanel>
      ) : (
        <Button
          variant="ghost"
          onClick={() => {
            abortRef.current?.abort();
            router.push("/");
          }}
        >
          Cancel
        </Button>
      )}
    </main>
  );
}

export default function NewCasePage() {
  return (
    <Suspense>
      <Generating />
    </Suspense>
  );
}
