// SAM 3.1 helpers: stream a segmentation over the Responses API and decode it with Meta's @meta-sam/parser.
import { buildObjectPrompt, decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import type { SamObject } from "@/lib/types";
import { MODELS, client } from "./meta";

function packBits(raster: Uint8Array): string {
  const out = new Uint8Array(Math.ceil(raster.length / 8));
  for (let i = 0; i < raster.length; i++) if (raster[i]) out[i >> 3] |= 1 << (7 - (i & 7));
  return Buffer.from(out).toString("base64");
}

/**
 * Segment one image. `prompt` is either a short noun phrase (concept prompt) or a point in source pixels.
 * Returns every matched object with its box and packed mask.
 */
export async function segment(opts: {
  imageDataUrl: string;
  width: number;
  height: number;
  phrase?: string;
  point?: { x: number; y: number };
  signal?: AbortSignal;
}): Promise<SamObject[]> {
  let text: string;
  if (opts.point) {
    text = buildObjectPrompt({
      size: { width: opts.width, height: opts.height },
      objects: [{ id: 1, prompts: [{ points: [{ x: Math.round(opts.point.x), y: Math.round(opts.point.y) }] }] }],
    });
  } else {
    text = (opts.phrase ?? "").trim().slice(0, 60);
    if (!text) return [];
  }
  const stream = await client().responses.create(
    {
      model: MODELS.sam,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text },
            { type: "input_image", image_url: opts.imageDataUrl },
          ],
        },
      ] as never,
      stream: true,
      metadata: { mask_encoding: "one_bit" },
    },
    { timeout: 60_000, signal: opts.signal },
  );
  const result = await parseImageStream(stream as AsyncIterable<{ type: string }>).finalResult;
  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  const objects: SamObject[] = [];
  for (const b of boxes) {
    const m = masks.find((x) => x.objectId === b.objectId);
    const obj: SamObject = {
      box: [b.left, b.top, b.right, b.bottom],
      imageWidth: opts.width,
      imageHeight: opts.height,
    };
    if (m) {
      try {
        const raster = decodeMaskToRaster(m.mask);
        obj.mask = { width: m.mask.width, height: m.mask.height, bits: packBits(raster) };
        obj.box = [m.bounds.left, m.bounds.top, m.bounds.right, m.bounds.bottom];
      } catch {
        // keep the box only
      }
    }
    objects.push(obj);
  }
  return objects;
}
