import { describe, expect, it } from "vitest";
import { createRecommendationGuard, RECOMMEND_LIMIT_MESSAGE } from "@/lib/recommend-guard.server";

function request(site: string | null = "same-origin", ip = "192.0.2.1") {
  const headers = new Headers({ "cf-connecting-ip": ip });
  if (site !== null) headers.set("sec-fetch-site", site);
  return new Request("https://hub.e20e.tools/", { headers });
}

describe("Recommendation request admission", () => {
  it.each(["cross-site", "same-site", "", null])("rejects Fetch Metadata %s", (site) => {
    expect(createRecommendationGuard()(request(site), 0)).not.toBeNull();
  });
  it.each(["same-origin", "none"])("allows Fetch Metadata %s", (site) => {
    expect(createRecommendationGuard()(request(site), 0)).toBeNull();
  });
  it("allows exactly four requests per IP in ten minutes", () => {
    const guard = createRecommendationGuard();
    for (let i = 0; i < 4; i++) expect(guard(request(), i)).toBeNull();
    expect(guard(request(), 599_999)).toBe(RECOMMEND_LIMIT_MESSAGE);
    expect(guard(request(), 600_000)).toBeNull();
  });
  it("admits only four parallel requests", async () => {
    const guard = createRecommendationGuard();
    const results = await Promise.all(Array.from({ length: 20 }, async () => guard(request(), 0)));
    expect(results.filter((result) => result === null)).toHaveLength(4);
    expect(results.filter((result) => result === RECOMMEND_LIMIT_MESSAGE)).toHaveLength(16);
  });
  it("keeps client quotas independent", () => {
    const guard = createRecommendationGuard();
    for (let i = 0; i < 4; i++) guard(request(), 0);
    expect(guard(request("same-origin", "192.0.2.2"), 0)).toBeNull();
  });
  it("does not let forged forwarding headers bypass the missing-IP quota", () => {
    const guard = createRecommendationGuard();
    for (let i = 0; i < 5; i++) {
      const req = new Request("https://hub.e20e.tools/", {
        headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": `192.0.2.${i}` },
      });
      expect(guard(req, 0)).toBe(i < 4 ? null : RECOMMEND_LIMIT_MESSAGE);
    }
  });
});
