import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/products";

// Isolated fixture catalog: four available tools plus one coming soon. No production data.
const product = (id: string, comingSoon = false): Product => ({
  id,
  name: `Fixture ${id}`,
  category: "architecture",
  label: `أداة ${id}`,
  description: `وصف ${id}`,
  descriptionEn: `Description ${id}`,
  overview: "",
  features: [`Feature of ${id}`],
  url: "",
  keywords: "",
  comingSoon,
});
const fixture = vi.hoisted(() => ({
  search: { ids: undefined as string | undefined },
  navigate: vi.fn(),
}));
const catalog = {
  products: [
    product("alpha"),
    product("bravo"),
    product("charlie"),
    product("delta"),
    product("soon", true),
  ],
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => fixture.search,
    useNavigate: () => fixture.navigate,
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#fixture">{children}</a>,
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<object>()),
  useSuspenseQuery: () => ({ data: catalog }),
}));
vi.mock("@/lib/catalog.functions", () => ({ catalogQueryOptions: {} }));
vi.mock("@/components/product-tools", () => ({ ProductToolsActions: () => null }));
vi.mock("@/components/metrics-preference", () => ({ MetricsPreference: () => null }));
vi.mock("@/lib/journey-client", () => ({ trackJourney: vi.fn() }));

import { Route } from "@/routes/compare";
import { MAX_COMPARE, toggleComparison } from "@/lib/my-tools";

const ComparePage = (Route as unknown as { options: { component: () => React.ReactNode } }).options
  .component;
const columns = () =>
  screen
    .getAllByRole("columnheader")
    .slice(1)
    .map((cell) => within(cell).getByText(/Fixture/).textContent);
const removedNotice = () => screen.queryByText(/removed|حُذف|أُزيل|استُبعد/i);

beforeEach(() => {
  fixture.navigate.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("comparison with an isolated three-plus tool catalog", () => {
  it("shows three available tools side by side without a removal notice", () => {
    fixture.search = { ids: "alpha,bravo,charlie" };
    render(<ComparePage />);
    expect(columns()).toEqual(["Fixture alpha", "Fixture bravo", "Fixture charlie"]);
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument();
    expect(removedNotice()).toBeNull();
  });

  it("caps a four-tool link at three and says some were removed", () => {
    fixture.search = { ids: "alpha,bravo,charlie,delta" };
    render(<ComparePage />);
    expect(MAX_COMPARE).toBe(3);
    expect(columns()).toEqual(["Fixture alpha", "Fixture bravo", "Fixture charlie"]);
    expect(removedNotice()).not.toBeNull();
  });

  it("drops coming-soon, unknown and malformed IDs with a notice", () => {
    fixture.search = { ids: "alpha,soon,missing,BAD!,charlie" };
    render(<ComparePage />);
    expect(columns()).toEqual(["Fixture alpha", "Fixture charlie"]);
    expect(removedNotice()).not.toBeNull();
  });

  it("removing one of three keeps the other two in order", () => {
    fixture.search = { ids: "alpha,bravo,charlie" };
    render(<ComparePage />);
    act(() =>
      within(screen.getByRole("table"))
        .getByRole("button", { name: /Fixture bravo/ })
        .click(),
    );
    expect(fixture.navigate).toHaveBeenCalledWith({
      search: { ids: "alpha,charlie" },
      replace: true,
      resetScroll: false,
    });
  });

  it("refuses a fourth tool at the limit and accepts it after one is removed (replacement)", () => {
    const full = ["alpha", "bravo", "charlie"];
    expect(toggleComparison(full, "delta")).toEqual({ ids: full, limited: true });
    const afterRemoval = toggleComparison(full, "bravo").ids;
    expect(toggleComparison(afterRemoval, "delta")).toEqual({
      ids: ["alpha", "charlie", "delta"],
      limited: false,
    });
    fixture.search = { ids: "alpha,charlie,delta" };
    render(<ComparePage />);
    expect(columns()).toEqual(["Fixture alpha", "Fixture charlie", "Fixture delta"]);
  });
});

it("can start a comparison on the comparison page and saves the selected IDs", () => {
  fixture.search = { ids: "alpha" };
  render(<ComparePage />);
  act(() => screen.getByRole("button", { name: "Fixture bravo" }).click());
  expect(fixture.navigate).toHaveBeenCalledWith({
    search: { ids: "alpha,bravo" },
    replace: true,
    resetScroll: false,
  });
  expect(JSON.parse(localStorage.getItem("e20e-my-tools-v1")!).compare).toEqual(["alpha", "bravo"]);
});
it("hides identical unknown fields when the differences filter is active", () => {
  fixture.search = { ids: "alpha,bravo" };
  render(<ComparePage />);
  const initial = screen.getAllByRole("row").length;
  act(() => screen.getByRole("checkbox", { name: /differences|الفروق/i }).click());
  expect(screen.getAllByRole("row").length).toBeLessThan(initial);
  expect(screen.getByText("Feature of alpha")).toBeInTheDocument();
});
