"use client";
import { FileSearch } from "lucide-react";
import { useState } from "react";
import { EvidenceCard } from "@/components/evidence-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Evidence } from "@/lib/types";

export function EvidencePicker({ items, onPresent, disabled }: { items: Evidence[]; onPresent: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="lg" className="h-14 flex-col gap-0.5 px-3 text-xs" disabled={disabled}>
          <FileSearch className="size-5" />
          Show evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-case text-primary">Show evidence</DialogTitle>
          <DialogDescription>Pick an item to put in front of the suspect. Your typed question, if any, goes with it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.length === 0 ? <p className="text-sm text-muted-foreground">You haven&apos;t collected any evidence yet. Search the scene first.</p> : null}
          {items.map((e) => (
            <button key={e.id} type="button" className="block w-full text-left" onClick={() => setSel(e.id)} aria-pressed={sel === e.id}>
              <EvidenceCard e={e} compact selected={sel === e.id} />
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            size="lg"
            disabled={!sel}
            onClick={() => {
              if (!sel) return;
              onPresent(sel);
              setOpen(false);
              setSel(null);
            }}
          >
            Show it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
