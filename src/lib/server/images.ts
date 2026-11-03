// Muse Image helpers (Responses API with the image_generation tool), shared by the API route and scripts.
import { MODELS, client } from "./meta";

export type ImageKind = "scene" | "evidence" | "portrait";

const STYLE =
  "Moody film-noir illustration, cinematic low-key lighting, muted desaturated palette with warm amber highlights, painterly detail, no text, no letters, no watermark.";

export function buildImagePrompt(kind: ImageKind, prompt: string, hasReference: boolean) {
  const p = prompt.trim().slice(0, 1200);
  if (kind === "scene") {
    return `Crime scene, wide establishing shot, no people. ${p} Every object mentioned must be clearly visible and well separated. ${STYLE}`;
  }
  if (kind === "portrait") {
    return `Head-and-shoulders character portrait, facing the viewer, plain dark background. ${p} ${STYLE}`;
  }
  return `Close-up evidence photo of a single object, centered, on a dark surface. ${p}${
    hasReference ? " It is the same object that appears in the reference crime-scene image; match its look, materials and colors." : ""
  } ${STYLE}`;
}

const SIZE: Record<ImageKind, string> = { scene: "1536x1024", evidence: "1024x1024", portrait: "1024x1024" };

export async function generateImage(opts: {
  kind: ImageKind;
  prompt: string;
  referenceDataUrl?: string;
  signal?: AbortSignal;
}): Promise<{ b64: string; mime: string }> {
  const text = buildImagePrompt(opts.kind, opts.prompt, Boolean(opts.referenceDataUrl));
  const content: Record<string, unknown>[] = [{ type: "input_text", text }];
  if (opts.referenceDataUrl) content.push({ type: "input_image", image_url: opts.referenceDataUrl });
  const res = await client().responses.create(
    {
      model: MODELS.image,
      input: [{ role: "user", content }] as never,
      store: false,
      tools: [
        {
          type: "image_generation",
          enable_web_search: false,
          enable_image_search: false,
          enable_shell: false,
          reasoning_strength: "low",
          size: SIZE[opts.kind],
          output_format: "jpeg",
        },
      ] as never,
    },
    { timeout: 150_000, signal: opts.signal },
  );
  const item = (res.output as unknown as { type: string; result?: string | null }[]).find(
    (o) => o.type === "image_generation_call" && o.result,
  );
  if (!item?.result) throw new Error("Muse Image returned no image");
  return { b64: item.result, mime: "image/jpeg" };
}
