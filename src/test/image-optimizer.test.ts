import { afterEach, describe, expect, it, vi } from "vitest";
import { optimizedImage } from "@/lib/catalog.functions";

const signed =
  "https://abc.supabase.co/storage/v1/object/sign/library-assets/products/radar.jpg?token=t";

describe("optimizedImage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("routes storage uploads through the Vercel optimizer on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(optimizedImage(signed, 640)).toBe(
      `/_vercel/image?url=${encodeURIComponent(signed)}&w=640&q=78`,
    );
  });

  it("keeps the original URL off Vercel", () => {
    vi.stubEnv("VERCEL", "");
    expect(optimizedImage(signed, 640)).toBe(signed);
  });

  it("leaves non-storage and empty URLs alone", () => {
    vi.stubEnv("VERCEL", "1");
    expect(optimizedImage("/assets/logo.png", 256)).toBe("/assets/logo.png");
    expect(optimizedImage("https://example.com/a.jpg", 256)).toBe("https://example.com/a.jpg");
    expect(optimizedImage("", 256)).toBe("");
  });
});
