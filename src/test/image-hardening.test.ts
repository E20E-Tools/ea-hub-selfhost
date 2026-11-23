import { describe, expect, it } from "vitest";
import { imageDimensions, stripJpegMetadata, stripWebpMetadata } from "@/lib/suggestion.shared";

const jpeg = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe1,
  0x00,
  0x06,
  0x47,
  0x50,
  0x53,
  0x21, // fake EXIF "GPS!"
  0xff,
  0xc0,
  0x00,
  0x0b,
  0x08,
  0x00,
  0x20,
  0x00,
  0x40,
  0x01,
  0x01,
  0x11,
  0x00,
  0xff,
  0xda,
  0x00,
  0x02,
  0x00,
  0xff,
  0xd9,
]);

function webpChunk(name: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length + (payload.length % 2));
  out.set(new TextEncoder().encode(name), 0);
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}

function webpWithLocationMetadata(): Uint8Array {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x0c; // EXIF + XMP feature flags
  vp8x.set([63, 0, 0, 31, 0, 0], 4); // 64x32
  const chunks = [
    webpChunk("VP8X", vp8x),
    webpChunk("EXIF", new TextEncoder().encode("GPS:24.7136,46.6753")),
    webpChunk("XMP ", new TextEncoder().encode("<xmp>Riyadh</xmp>")),
    webpChunk("VP8 ", new Uint8Array([1, 2, 3, 4])),
  ];
  const out = new Uint8Array(12 + chunks.reduce((total, chunk) => total + chunk.length, 0));
  out.set(new TextEncoder().encode("RIFF"), 0);
  out.set(new TextEncoder().encode("WEBP"), 8);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  let offset = 12;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe("uploaded image hardening", () => {
  it("reads JPEG size 64x32", () => {
    expect(imageDimensions(jpeg, "image/jpeg")).toEqual({ width: 64, height: 32 });
  });
  it("removes EXIF data but keeps the picture", () => {
    const out = stripJpegMetadata(jpeg);
    expect(out.length).toBe(jpeg.length - 8);
    expect(imageDimensions(out, "image/jpeg")).toEqual({ width: 64, height: 32 });
  });
  it("rejects a PNG with a broken header", () => {
    expect(imageDimensions(new Uint8Array(8), "image/png")).toBeNull();
  });
  it("removes WebP EXIF/XMP location metadata but keeps dimensions and image chunks", () => {
    const original = webpWithLocationMetadata();
    const out = stripWebpMetadata(original);
    const text = new TextDecoder().decode(out);
    expect(imageDimensions(out, "image/webp")).toEqual({ width: 64, height: 32 });
    expect(text).not.toContain("EXIF");
    expect(text).not.toContain("XMP");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("Riyadh");
    expect(text).toContain("VP8X");
    expect(text).toContain("VP8 ");
    expect(out[20]).toBe(0); // VP8X flags no longer advertise EXIF/XMP
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    expect(out.length).toBeLessThan(original.length);
  });
  it("rejects malformed WebP chunks instead of storing unstripped metadata", () => {
    const malformed = webpWithLocationMetadata();
    new DataView(malformed.buffer).setUint32(16, 0xffffff, true);
    expect(() => stripWebpMetadata(malformed)).toThrow("invalid webp");
  });
});
