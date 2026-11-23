import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/rate-limit.server";
import { sanitizeRecommendation } from "@/lib/recommend.shared";

describe("rate limit subject", () => {
  it("ignores spoofed x-forwarded-for", () => {
    const r = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(clientIp(r)).toBe("unknown-client");
  });
  it("uses the trusted edge IP", () => {
    const r = new Request("http://x", { headers: { "cf-connecting-ip": "9.9.9.9" } });
    expect(clientIp(r)).toBe("9.9.9.9");
  });
});

describe("live catalog recommendations", () => {
  const live = [
    { id: "newtool", name: "New", label: "", description: "", comingSoon: false },
    { id: "soon", name: "Soon", label: "", description: "", comingSoon: true },
  ];
  it("accepts products that exist only in the live database", () => {
    expect(
      sanitizeRecommendation({ summary: "s", picks: [{ id: "newtool", reason: "r" }] }, live).picks,
    ).toHaveLength(1);
  });
  it("drops coming-soon products", () => {
    expect(
      sanitizeRecommendation({ summary: "s", picks: [{ id: "soon", reason: "r" }] }, live).picks,
    ).toHaveLength(0);
  });
});
