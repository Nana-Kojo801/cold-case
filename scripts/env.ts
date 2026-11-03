// Load .env.local / .env for CLI scripts (Next.js loads them itself for the app).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file not present
  }
}

if (!process.env.MODEL_API_KEY && !process.env.META_API_KEY) {
  console.error("Set MODEL_API_KEY (your Meta Model API key) in .env.local first.");
  process.exit(1);
}

/** Width and height of a JPEG or PNG buffer, without extra dependencies. */
export function imageSize(buf: Buffer): { width: number; height: number } {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  let o = 2;
  while (o < buf.length) {
    if (buf[o] !== 0xff) {
      o++;
      continue;
    }
    const marker = buf[o + 1];
    const len = buf.readUInt16BE(o + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
    }
    o += 2 + len;
  }
  throw new Error("Unknown image format");
}

export function mimeOf(buf: Buffer) {
  if (buf[0] === 0x89) return "image/png";
  if (buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/jpeg";
}
