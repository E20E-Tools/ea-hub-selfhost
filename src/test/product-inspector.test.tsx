import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    className,
  }: {
    children: ReactNode;
    params: { productId: string };
    className?: string;
  }) => (
    <a href={`/product/${params.productId}`} className={className}>
      {children}
    </a>
  ),
}));
import { InspectorPanel, useProductInspector } from "@/themes/product-inspector";
import { products } from "@/lib/products";
import type { Product } from "@/lib/catalog";

afterEach(cleanup);

function Harness({ product }: { product: Product }) {
  const inspector = useProductInspector();
  return (
    <div>
      <button type="button" onClick={(e) => inspector.open(product.id, e.currentTarget)}>
        node
      </button>
      <span>outside</span>
      {inspector.openId ? (
        <InspectorPanel product={product} title="inspect" onClose={inspector.close} />
      ) : null}
    </div>
  );
}

const base = products[0] as Product;
const available: Product = {
  ...base,
  id: "apm",
  comingSoon: false,
  url: "https://example.com/apm",
};
const soon: Product = {
  ...base,
  id: "future",
  comingSoon: true,
  url: "https://example.com/x",
  publicationDate: "2099-01-01",
};

describe("product inspector", () => {
  it("opens on activation, closes with Esc and returns focus to the node", () => {
    render(<Harness product={available} />);
    const node = screen.getByRole("button", { name: "node" });
    node.focus();
    fireEvent.click(node);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(node);
  });
  it("closes on an outside click", () => {
    render(<Harness product={available} />);
    fireEvent.click(screen.getByRole("button", { name: "node" }));
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("available product: Details and Open tool in a new tab", () => {
    render(<Harness product={available} />);
    fireEvent.click(screen.getByRole("button", { name: "node" }));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/product/apm",
      "https://example.com/apm",
    ]);
    expect(links[1]?.getAttribute("target")).toBe("_blank");
  });
  it("coming soon product: Details only, with launch date and countdown", () => {
    render(<Harness product={soon} />);
    fireEvent.click(screen.getByRole("button", { name: "node" }));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/product/future"]);
    expect(screen.getByRole("dialog").textContent).toMatch(/2099/);
    expect(screen.getByRole("dialog").textContent).toMatch(/\d+ (days|يوم)/);
  });
});
