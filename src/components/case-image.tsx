"use client";
import { useEffect, useState } from "react";
import { loadImageBlob } from "@/lib/client/db";
import { cn } from "@/lib/utils";

/** Shows an image stored in IndexedDB (or a static /public path). Falls back to a styled text card. */
export function CaseImage({
  imageKey,
  alt,
  className,
  fallbackTitle,
  fallbackText,
  onLoadSize,
  imgRef,
}: {
  imageKey?: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fallbackText?: string;
  onLoadSize?: (w: number, h: number) => void;
  imgRef?: React.Ref<HTMLImageElement>;
}) {
  // State is tagged with the key it belongs to, so a key change reads as "loading" without a reset.
  const [img, setImg] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!imageKey) return;
    let alive = true;
    let objectUrl: string | null = null;
    loadImageBlob(imageKey)
      .then((blob) => {
        if (!alive) return;
        if (!blob || !blob.type.startsWith("image/")) return setImg({ key: imageKey, url: null, failed: true });
        objectUrl = URL.createObjectURL(blob);
        setImg({ key: imageKey, url: objectUrl, failed: false });
      })
      .catch(() => alive && setImg({ key: imageKey, url: null, failed: true }));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageKey]);

  const current = img && img.key === imageKey ? img : null;

  if (!imageKey || current?.failed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-primary/30 bg-muted/60 p-3 text-center",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <span className="font-case text-sm text-primary">{fallbackTitle ?? alt}</span>
        {fallbackText ? <span className="line-clamp-4 text-xs text-muted-foreground">{fallbackText}</span> : null}
      </div>
    );
  }
  if (!current?.url) return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-label={`Loading ${alt}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={current.url}
      alt={alt}
      className={cn("rounded-md object-cover", className)}
      onLoad={(e) => onLoadSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      onError={() => setImg({ key: imageKey, url: null, failed: true })}
      draggable={false}
    />
  );
}
