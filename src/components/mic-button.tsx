"use client";
import { Loader2, Mic, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, readJson } from "@/lib/client/api";
import { Recorder, toWav16k } from "@/lib/client/audio";
import { cn } from "@/lib/utils";

/**
 * Hold to talk (or tap to start, tap again to stop). Records with MediaRecorder, converts to WAV,
 * transcribes with Muse Voice Transcribe via /api/transcribe, and hands the text back for review.
 */
export function MicButton({
  onTranscript,
  keywords,
  disabled,
  size = "lg",
}: {
  onTranscript: (text: string) => void;
  keywords?: string[];
  disabled?: boolean;
  size?: "lg" | "sm";
}) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const rec = useRef<Recorder | null>(null);
  const pressAt = useRef(0);
  const toggleMode = useRef(false);

  useEffect(() => () => rec.current?.cancel(), []);

  async function start() {
    if (!Recorder.supported()) {
      toast.error("Voice input isn't supported in this browser. Type your question instead.");
      return;
    }
    try {
      rec.current = new Recorder();
      await rec.current.start();
      setState("recording");
      navigator.vibrate?.(15);
    } catch {
      rec.current = null;
      setState("idle");
      toast.error("Microphone unavailable. Allow mic access, or type your question.");
    }
  }

  async function stop() {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setState("working");
    try {
      const blob = await r.stop();
      if (Date.now() - r.startedAt < 400) {
        setState("idle");
        return;
      }
      let wav: Blob;
      try {
        wav = await toWav16k(blob);
      } catch {
        throw new ApiError("We couldn't process that recording. Type your question instead.", "audio", false);
      }
      const fd = new FormData();
      fd.append("audio", wav, "question.wav");
      if (keywords?.length) fd.append("keywords", JSON.stringify(keywords));
      let res: Response;
      try {
        res = await fetch("/api/transcribe", { method: "POST", body: fd });
      } catch {
        throw new ApiError("Can't reach the server. Type your question instead.", "network");
      }
      const data = await readJson<{ text: string }>(res);
      if (!data.text) toast.message("We didn't catch that. Try again, or type it.");
      else onTranscript(data.text);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Voice input failed. Type your question instead.");
    } finally {
      setState("idle");
    }
  }

  const onDown = (e: React.PointerEvent) => {
    if (disabled || state === "working") return;
    e.preventDefault();
    if (state === "recording") {
      // second tap in toggle mode
      toggleMode.current = false;
      stop();
      return;
    }
    pressAt.current = Date.now();
    toggleMode.current = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start();
  };

  const onUp = () => {
    if (state !== "recording" && !rec.current) return;
    if (Date.now() - pressAt.current < 350) {
      // quick tap: stay recording until the next tap
      toggleMode.current = true;
      return;
    }
    if (!toggleMode.current) stop();
  };

  const big = size === "lg";
  const recording = state === "recording";
  return (
    <motion.button
      type="button"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled || state === "working"}
      aria-label={recording ? "Recording. Release or tap to send." : "Hold to ask a question out loud"}
      whileTap={{ scale: 0.9 }}
      animate={{ scale: recording ? 1.12 : 1, backgroundColor: recording ? "#e0574a" : "#f0a83a" }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
      className={cn(
        "relative flex shrink-0 touch-none select-none items-center justify-center rounded-full text-amber-ink outline-none focus-visible:ring-4 focus-visible:ring-amber/50 disabled:opacity-50",
        big ? "size-24 shadow-[0_0_0_8px_rgba(240,168,58,0.18),0_0_0_16px_rgba(240,168,58,0.07),0_14px_30px_rgba(0,0,0,0.5)]" : "size-12",
        recording && "text-white",
      )}
    >
      {recording
        ? [0, 1, 2].map((k) => (
            <motion.span
              key={k}
              className="absolute inset-0 rounded-full border-2 border-danger"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, delay: k * 0.45, ease: "easeOut" }}
            />
          ))
        : null}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={state} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 18 }} className="relative">
          {state === "working" ? <Loader2 className={cn("animate-spin", big ? "size-9" : "size-5")} /> : recording ? <Square className={cn("fill-current", big ? "size-8" : "size-4")} /> : <Mic className={big ? "size-10" : "size-5"} strokeWidth={2.2} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
