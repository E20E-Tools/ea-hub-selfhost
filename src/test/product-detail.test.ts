import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { getProduct, products } from "@/lib/products";

describe("Product detail pages", () => {
  it("carries the content every product page needs", () => {
    for (const product of products) {
      expect(product.overview.length, product.id).toBeGreaterThan(40);
      expect(product.features.length, product.id).toBeGreaterThanOrEqual(4);
      expect("pricing" in product, product.id).toBe(false);
    }
  });

  it("resolves a catalogue id and rejects anything else", () => {
    expect(getProduct("archone")?.name).toBe("ArchONE");
    expect(getProduct("nope")).toBeUndefined();
  });

  it("serves a product page at /product/<id> instead of the root fallback", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });
    const matches = router.matchRoutes("/product/archone");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.at(-1)?.pathname).toBe("/product/archone");
  });

  it("keeps EA Tool the only product whose page has no live system to open", () => {
    expect(
      products
        .filter((product) => product.comingSoon)
        .map((product) => product.id),
    ).toEqual(["platform"]);
    expect(getProduct("radar")?.comingSoon).toBeUndefined();
  });
});
