import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog.functions", async () => {
  const { fallbackCatalog } = await import("@/lib/catalog");
  const base = fallbackCatalog.products[0];
  if (!base) throw new Error("Missing catalog fixture");
  const catalog = {
    ...fallbackCatalog,
    products: [
      { ...base, id: "itfm", name: "ITFM" },
      { ...base, id: "innovation", name: "Innovation" },
    ],
  };
  return {
    catalogQueryOptions: { queryKey: ["catalog"], queryFn: async () => catalog, staleTime: 60_000 },
  };
});
vi.mock("@/lib/contact.functions", () => ({
  DEFAULT_CONTACT_EMAIL: "ea@e20e.tools",
  getPublicContactEmail: vi.fn(async () => "ea@e20e.tools"),
}));
vi.mock("@/lib/recommend.functions", () => ({
  recommendTools: vi.fn(async () => ({
    ok: true,
    recommendation: {
      summary: "أدوات مناسبة",
      picks: [
        { id: "itfm", reason: "التكاليف" },
        { id: "innovation", reason: "الأفكار" },
      ],
    },
  })),
}));
// The route test does not invoke real counting/server transport or load the 3D scene.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock("@/components/visit-tracker", () => ({ VisitTracker: () => null }));
vi.mock("@/components/assistant-chat", () => ({ AssistantChat: () => null }));

import { routeTree } from "@/routeTree.gen";
import { LANGUAGE_STORAGE_KEY } from "@/lib/language-core";

describe("Dynamic recommendation previews", () => {
  it("resolves ITFM and Innovation from query data rather than the static fallback", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      history: createMemoryHistory({ initialEntries: ["/request"] }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    fireEvent.change(await screen.findByLabelText("ما الذي تحتاجه؟"), {
      target: { value: "نحتاج إدارة التكاليف والأفكار" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حلّل احتياجي" }));
    expect(await screen.findByRole("link", { name: "ITFM" })).toHaveAttribute(
      "href",
      "/product/itfm",
    );
    expect(await screen.findByRole("link", { name: "Innovation" })).toHaveAttribute(
      "href",
      "/product/innovation",
    );
  }, 15000);
});
