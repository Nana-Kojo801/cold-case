"use client";
import { BarChart3, FolderOpen, Play, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getHealth } from "@/lib/client/api";
import { DEMO_CASE_ID, deleteCase, listCases, loadDemoCase } from "@/lib/client/db";
import type { CaseFile } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [ai, setAi] = useState<boolean | null>(null);
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [theme, setTheme] = useState("");
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    getHealth().then((h) => setAi(h.ai));
    listCases().then((cs) => setCases(cs.filter((c) => c.id !== DEMO_CASE_ID)));
  }, []);

  async function playDemo() {
    setLoadingDemo(true);
    try {
      await loadDemoCase();
      router.push(`/case/${DEMO_CASE_ID}`);
    } catch {
      toast.error("Couldn't open the demo case. Please retry.");
      setLoadingDemo(false);
    }
  }

  function newCase(e?: React.FormEvent) {
    e?.preventDefault();
    const q = theme.trim() ? `?theme=${encodeURIComponent(theme.trim())}` : "";
    router.push(`/new${q}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 pb-10 pt-14">
      <section className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Cross-examination trainer</p>
        <h1 className="font-case text-5xl text-primary drop-shadow">Cold Case</h1>
        <p className="text-sm text-muted-foreground">
          Every case is new and solvable. Question lying suspects out loud, catch their contradictions, prove who did it, then get a debrief on how you questioned.
        </p>
      </section>

      <section className="space-y-3">
        <Button size="lg" className="h-14 w-full text-base" onClick={playDemo} disabled={loadingDemo}>
          <Play /> {loadingDemo ? "Opening the file..." : "Play demo case"}
        </Button>
        <form onSubmit={newCase} className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
          <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Optional setting idea: “a 1920s jazz club”" aria-label="Optional setting idea" />
          <Button type="submit" size="lg" variant="secondary" className="h-12 w-full" disabled={ai === false}>
            <Sparkles /> New case
          </Button>
          {ai === false ? <p className="text-center text-xs text-muted-foreground">Live case generation is offline right now. The demo case still works.</p> : null}
        </form>
      </section>

      {cases.length ? (
        <section className="space-y-2">
          <h2 className="font-case text-sm text-muted-foreground">Your case files</h2>
          <ul className="space-y-2">
            {cases.slice(0, 8).map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-card/50 p-2">
                <Link href={`/case/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <FolderOpen className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{c.title}</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${c.title}`}
                  onClick={async () => {
                    await deleteCase(c.id);
                    setCases((cs) => cs.filter((x) => x.id !== c.id));
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-auto flex flex-col items-center gap-3 text-xs text-muted-foreground">
        <Button asChild variant="link">
          <Link href="/progress">
            <BarChart3 /> Your progress
          </Link>
        </Button>
        <p className="text-center">
          Powered by Meta models: Muse Wonder, Muse Spark, Muse Image, SAM 3.1 and Muse Voice Transcribe. No sign-up. Everything stays on your device.
        </p>
      </footer>
    </main>
  );
}
