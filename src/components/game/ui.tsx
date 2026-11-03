"use client";
// The Cold Case game UI kit: bouncy, spring-driven building blocks shared by every screen.
import { ArrowLeft, X } from "lucide-react";
import { AnimatePresence, animate, motion, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/client/sfx";
import { CRACK_THRESHOLD, NERVOUS_THRESHOLD } from "@/lib/game";
import { cn } from "@/lib/utils";

export const pop = { type: "spring", stiffness: 520, damping: 18 } as const;
export const bounce = { type: "spring", stiffness: 380, damping: 15 } as const;
export const smooth = { type: "spring", stiffness: 260, damping: 30 } as const;

const MotionLink = motion.create(Link);

type Variant = "amber" | "danger" | "outline" | "ghost" | "dark";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  amber: "bg-amber text-amber-ink shadow-[0_10px_30px_rgba(240,168,58,0.25)]",
  danger: "bg-danger text-white shadow-[0_12px_30px_rgba(224,87,74,0.35)]",
  outline: "border-[1.5px] border-amber/60 bg-ink/60 text-amber",
  ghost: "border-[1.5px] border-cream/20 bg-transparent text-cream",
  dark: "border border-cream/15 bg-raised text-cream",
};
const SIZE: Record<Size, string> = {
  sm: "h-10 px-4 text-sm rounded-xl",
  md: "h-12 px-5 text-base rounded-xl",
  lg: "h-14 px-6 text-lg rounded-2xl",
  xl: "h-16 px-6 text-xl rounded-2xl",
};

export function gameButtonClass(variant: Variant = "amber", size: Size = "md", className?: string) {
  return cn(
    "hud inline-flex select-none items-center justify-center gap-2 font-bold no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber disabled:pointer-events-none disabled:opacity-45",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

const tapSound = () => sfx("tap");
const press = { whileTap: { scale: 0.94 }, whileHover: { scale: 1.025 }, transition: bounce, onPointerDownCapture: tapSound };

export function GameButton({ variant, size, className, ...props }: HTMLMotionProps<"button"> & { variant?: Variant; size?: Size }) {
  return <motion.button type="button" {...press} className={gameButtonClass(variant, size, className)} {...props} />;
}

export function GameLink({
  variant,
  size,
  className,
  href,
  ...props
}: Omit<HTMLMotionProps<"a">, "href"> & { href: string; variant?: Variant; size?: Size }) {
  return <MotionLink href={href} {...press} className={gameButtonClass(variant, size, className)} {...props} />;
}

/** A pressable plain wrapper (for cards and tiles). */
export function Pressable({ className, ...props }: HTMLMotionProps<"button">) {
  return <motion.button type="button" whileTap={{ scale: 0.96 }} transition={bounce} onPointerDownCapture={tapSound} className={cn("outline-none focus-visible:ring-2 focus-visible:ring-amber", className)} {...props} />;
}

export function PressLink({ className, href, ...props }: Omit<HTMLMotionProps<"a">, "href"> & { href: string }) {
  return <MotionLink href={href} whileTap={{ scale: 0.96 }} transition={bounce} onPointerDownCapture={tapSound} className={cn("outline-none focus-visible:ring-2 focus-visible:ring-amber", className)} {...props} />;
}

export function IconButton({ className, label, ...props }: HTMLMotionProps<"button"> & { label: string }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.88 }}
      transition={bounce}
      onPointerDownCapture={tapSound}
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border border-cream/20 bg-ink/65 text-cream backdrop-blur [&_svg]:size-5", className)}
      {...props}
    />
  );
}

export function IconLink({ className, label, href, ...props }: Omit<HTMLMotionProps<"a">, "href"> & { href: string; label: string }) {
  return (
    <MotionLink
      href={href}
      aria-label={label}
      whileTap={{ scale: 0.88 }}
      transition={bounce}
      onPointerDownCapture={tapSound}
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border border-cream/20 bg-ink/65 text-cream backdrop-blur [&_svg]:size-5", className)}
      {...props}
    />
  );
}

/** Top HUD: back button, kicker + title, right-side slot. */
export function TopHud({ back, kicker, title, right, className, kickerClass }: { back?: string; kicker?: React.ReactNode; title: React.ReactNode; right?: React.ReactNode; className?: string; kickerClass?: string }) {
  return (
    <header className={cn("relative z-20 flex items-center gap-2.5 px-4 pt-4", className)}>
      {back ? (
        <IconLink href={back} label="Back">
          <ArrowLeft />
        </IconLink>
      ) : null}
      <div className="min-w-0 flex-1">
        {kicker ? <div className={cn("hud truncate text-[11px] text-amber", kickerClass)}>{kicker}</div> : null}
        <div className="hud truncate text-xl font-bold leading-tight">{title}</div>
      </div>
      {right}
    </header>
  );
}

/** A rubber stamp that slams onto the screen. */
export function Stamp({
  children,
  tone = "danger",
  rotate = -9,
  delay = 0,
  className,
  silent,
}: {
  children: React.ReactNode;
  tone?: "danger" | "amber" | "alarm" | "ink";
  rotate?: number;
  delay?: number;
  className?: string;
  silent?: boolean;
}) {
  // The thud lands on the frame the stamp hits the page.
  useEffect(() => {
    if (!silent) sfx("stamp", delay + 0.09);
  }, [silent, delay]);
  const color = { danger: "border-danger text-danger", amber: "border-amber text-amber", alarm: "border-alarm text-alarm", ink: "border-[#c0392b] text-[#c0392b]" }[tone];
  return (
    <motion.div
      aria-hidden="true"
      initial={{ scale: 2.6, opacity: 0, rotate: rotate - 14 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={{ type: "spring", stiffness: 640, damping: 16, delay }}
      className={cn("hud pointer-events-none rounded-md border-[3px] px-3 py-0.5 font-bold tracking-[0.16em]", color, className)}
    >
      {children}
    </motion.div>
  );
}

/** Segmented nerve meter: composed (green), rattled (amber), breaking (red). Segments pop as they light. */
export function NerveMeter({ value, cracked, className, compact }: { value: number; cracked?: boolean; className?: string; compact?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const lit = cracked ? Math.max(9, Math.round(v / 10)) : Math.round(v / 10);
  const breaking = cracked || v >= CRACK_THRESHOLD;
  const label = breaking ? "Breaking" : v >= NERVOUS_THRESHOLD ? "Rattled" : "Composed";
  const tone = breaking ? "text-alarm" : v >= NERVOUS_THRESHOLD ? "text-amber" : "text-good";
  return (
    <div className={cn("w-full", className)} role="meter" aria-label="Suspect nerve" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={label}>
      <div className="flex justify-between">
        <span className="hud text-[11px] text-dim">Nerve</span>
        <motion.span key={label} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={pop} className={cn("hud text-[11px]", tone)}>
          {label}
        </motion.span>
      </div>
      <div className={cn("mt-1.5 grid grid-cols-10", compact ? "gap-[3px]" : "gap-1")}>
        {Array.from({ length: 10 }, (_, i) => {
          const on = i < lit;
          const color = !on ? "#2c241c" : breaking ? "#ff5a45" : i < 3 ? "#7fb08a" : "#f0a83a";
          return (
            <motion.span
              key={i}
              className={cn("rounded-[2px]", compact ? "h-2.5" : "h-3")}
              animate={{ backgroundColor: color, scaleY: on ? [1, 1.7, 1] : 1 }}
              transition={{ backgroundColor: { duration: 0.2, delay: i * 0.03 }, scaleY: { duration: 0.35, delay: i * 0.03 } }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className, glow }: { value: number; className?: string; glow?: boolean }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-well", className)}>
      <motion.div
        className="h-full rounded-full bg-amber"
        style={glow ? { boxShadow: "0 0 12px #f0a83a" } : undefined}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 18, delay: 0.15 }}
      />
    </div>
  );
}

export function CountUp({ value, duration = 1.1, delay = 0.2, format = (n: number) => String(Math.round(n)), sound }: { value: number; duration?: number; delay?: number; format?: (n: number) => string; sound?: boolean }) {
  const [n, setN] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    // Count from the number currently on screen, so value updates glide instead of restarting at 0.
    let last = Math.round(shown.current);
    const c = animate(shown.current, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        setN(v);
        if (sound && Math.round(v) !== last) {
          last = Math.round(v);
          sfx("count");
        }
      },
    });
    return () => c.stop();
  }, [value, duration, delay, sound]);
  return <span className="tabular-nums">{format(n)}</span>;
}

/** Pin for corkboard items. */
export function Pin({ color = "#e0574a" }: { color?: string }) {
  return <span aria-hidden="true" className="absolute -top-1.5 left-1/2 z-10 size-3.5 -translate-x-1/2 rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.5)]" style={{ background: color }} />;
}

/**
 * Bottom sheet on phones, centred card on desktop. Springs up, drags down to dismiss.
 */
export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    sfx("whoosh");
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
          <motion.div className="absolute inset-0 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
            className={cn("relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-amber/40 bg-panel px-5 pb-8 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] md:rounded-3xl md:border", className)}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-cream/20 md:hidden" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="hud text-lg font-bold">{title}</h2>
              <motion.button ref={closeRef} type="button" aria-label="Close" whileTap={{ scale: 0.88 }} onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-raised text-cream">
                <X className="size-5" />
              </motion.button>
            </div>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/** Animated sound bars shown while a suspect is speaking. */
export function SpeakingBars({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[8, 16, 11, 14, 6].map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-current"
          animate={active ? { height: [h * 0.4, h, h * 0.6, h] } : { height: 4 }}
          transition={active ? { duration: 0.8, repeat: Infinity, repeatType: "mirror", delay: i * 0.09, ease: "easeInOut" } : { duration: 0.2 }}
        />
      ))}
    </span>
  );
}

/** Reveals text like a typewriter. */
export function Typewriter({ text, speed = 18, className, onDone, sound }: { text: string; speed?: number; className?: string; onDone?: () => void; sound?: boolean }) {
  const [state, setState] = useState({ text, n: 0 });
  const n = state.text === text ? state.n : 0;
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(text.length, i + 3);
      setState({ text, n: i });
      if (sound && text[i - 1] !== " ") sfx("key");
      if (i >= text.length) {
        clearInterval(id);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);
  return (
    <span className={className}>
      {text.slice(0, n)}
      <span className="opacity-0">{text.slice(n)}</span>
    </span>
  );
}

/** Staggered entrance for lists. */
export const listParent = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
export const listItem = { hidden: { opacity: 0, y: 16, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: bounce } };
