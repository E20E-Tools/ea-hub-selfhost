import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackCatalog } from "@/lib/catalog";

const api = vi.hoisted(() => ({ remove: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/archy-quality.functions", () => ({
  getProductReviews: async () => [],
  rateArchyReply: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/admin.functions", () => ({
  deleteProduct: api.remove,
  saveProduct: api.save,
  uploadAdminImage: vi.fn(),
  listAdminImages: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: vi.fn() } },
}));
import { ProductsTab } from "@/components/admin/content-products";
import { DirtyProvider } from "@/components/admin/ui";

const product = (() => {
  const fixture = fallbackCatalog.products[0];
  if (!fixture) throw new Error("Missing product fixture");
  return fixture;
})();

function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DirtyProvider>
        <ProductsTab catalog={{ ...fallbackCatalog, products: [product] }} />
      </DirtyProvider>
    </QueryClientProvider>,
  );
}

describe("Product deletion and editing", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("does not delete when confirmation is cancelled", async () => {
    open();
    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${product.name}?` }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("deletes exactly the chosen product after confirmation", async () => {
    api.remove.mockResolvedValue({ ok: true });
    open();
    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${product.name}?` }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith({ data: { id: product.id } }),
    );
  });

  it("shows the save bar only after a change and offers to discard it", async () => {
    open();
    fireEvent.click(
      screen.getByRole("button", { name: `Edit ${product.name}` }),
    );
    expect(
      screen.queryByText("You have unsaved changes"),
    ).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Release" }));
    fireEvent.change(screen.getByLabelText("Version"), {
      target: { value: "9.9.9" },
    });
    expect(await screen.findByText("You have unsaved changes")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(
      screen.queryByText("You have unsaved changes"),
    ).not.toBeInTheDocument();
  });

  it("asks before closing an edited product and retains the draft when cancelled", async () => {
    open();
    fireEvent.click(
      screen.getByRole("button", { name: `Edit ${product.name}` }),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Release" }));
    fireEvent.change(screen.getByLabelText("Version"), {
      target: { value: "9.9.9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Products$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Stay" }));
    expect(screen.getByLabelText("Version")).toHaveValue("9.9.9");
  });
});
