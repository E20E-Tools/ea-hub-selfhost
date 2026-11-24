import { z } from "zod";

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const suggestionSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(2, "اكتب اسمك الكامل.").max(100),
  email: z
    .string()
    .trim()
    .email("اكتب بريدًا إلكترونيًا صحيحًا.")
    .max(255)
    .toLowerCase(),
  company: z.string().trim().max(150).default(""),
  phone: z
    .string()
    .trim()
    .min(7, "اكتب رقم هاتف صحيحًا.")
    .max(20)
    .regex(/^[+\d][\d\s()-]*$/, "اكتب رقم هاتف صحيحًا."),
  need: z
    .string()
    .trim()
    .min(20, "صف احتياجك بتفصيل أكبر (20 حرفًا على الأقل).")
    .max(2000),
  recommendation: z.unknown().optional(),
  website: z.string().max(200).default(""),
});

export function validateAttachments(
  files: { size: number; type: string }[],
): string {
  if (files.length > MAX_ATTACHMENTS) return "يمكن إرفاق 3 صور كحد أقصى.";
  if (files.some((file) => !IMAGE_TYPES.includes(file.type)))
    return "اختر صور JPG أو PNG أو WebP فقط.";
  if (files.some((file) => file.size === 0 || file.size > MAX_ATTACHMENT_BYTES))
    return "حجم كل صورة يجب ألا يتجاوز 3 ميجابايت.";
  return "";
}

export function matchesImageSignature(
  bytes: Uint8Array,
  type: string,
): boolean {
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, i) => bytes[i] === value,
    );
  if (type === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

export type RequestAttachment = { path: string; name: string; size: number };
export const MAX_IMAGE_SIDE = 8000;

/** Reads pixel size from the file header; null when the header is malformed. */
export function imageDimensions(
  bytes: Uint8Array,
  type: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === "image/png")
      return { width: view.getUint32(16), height: view.getUint32(20) };
    if (type === "image/webp") {
      const chunk = new TextDecoder().decode(bytes.slice(12, 16));
      if (chunk === "VP8X")
        return {
          width:
            1 +
            ((bytes[24] ?? 0) |
              ((bytes[25] ?? 0) << 8) |
              ((bytes[26] ?? 0) << 16)),
          height:
            1 +
            ((bytes[27] ?? 0) |
              ((bytes[28] ?? 0) << 8) |
              ((bytes[29] ?? 0) << 16)),
        };
      if (chunk === "VP8 ")
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      if (chunk === "VP8L") {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (type === "image/jpeg") {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1] ?? 0;
        const length = view.getUint16(i + 2);
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker)
        ) {
          return {
            height: view.getUint16(i + 5),
            width: view.getUint16(i + 7),
          };
        }
        i += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Removes EXIF/XMP/comment segments (APP1–APP15, COM) from a JPEG, e.g. GPS location. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xda) break; // start of image data: keep the rest untouched
    const end = i + 2 + view.getUint16(i + 2);
    if (end > bytes.length) return bytes;
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe))
      parts.push(bytes.slice(i, end));
    i = end;
  }
  parts.push(bytes.slice(i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Removes EXIF and XMP chunks from a WebP RIFF container while preserving its
 * image, colour profile and animation chunks. VP8X feature flags are cleared too.
 * Malformed chunk lengths are rejected rather than storing unprocessed metadata.
 */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const ascii = (start: number, end: number) =>
    new TextDecoder().decode(bytes.slice(start, end));
  if (bytes.length < 20 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP")
    throw new Error("invalid webp");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length)
    throw new Error("invalid webp");

  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("invalid webp");
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.length) throw new Error("invalid webp");
    const name = ascii(offset, offset + 4);
    let chunk = bytes.slice(offset, end);
    if (name === "VP8X") {
      if (size < 10) throw new Error("invalid webp");
      chunk = chunk.slice();
      chunk[8] = (chunk[8] ?? 0) & ~0x0c; // EXIF (0x08) and XMP (0x04)
    }
    if (name !== "EXIF" && name !== "XMP ") chunks.push(chunk);
    offset = end;
  }

  const out = new Uint8Array(
    12 + chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  out.set(bytes.slice(0, 12), 0);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  let target = 12;
  for (const chunk of chunks) {
    out.set(chunk, target);
    target += chunk.length;
  }
  return out;
}
