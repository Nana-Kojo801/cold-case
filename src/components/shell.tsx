import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopBar({ back, title, right, className }: { back?: string; title?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("sticky top-0 z-20 flex items-center gap-2 border-b border-border/60 bg-background/85 px-3 py-2 backdrop-blur", className)}>
      {back ? (
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href={back}>
            <ArrowLeft />
          </Link>
        </Button>
      ) : null}
      <div className="min-w-0 flex-1 truncate font-case text-base text-primary">{title}</div>
      {right}
    </header>
  );
}

export function ErrorPanel({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-center" role="alert">
      <p className="text-sm">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button onClick={onRetry} size="lg">
            Retry
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
      <span className="animate-pulse font-case">{label}</span>
    </div>
  );
}
