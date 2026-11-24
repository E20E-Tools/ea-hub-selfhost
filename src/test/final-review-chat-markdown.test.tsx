import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to} data-internal="">
      {children}
    </a>
  ),
}));
import type React from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { chatLinkTarget, chatProductId } from "@/lib/chat-links";

const html = (text: string) =>
  render(<ChatMarkdown>{text}</ChatMarkdown>).container;

describe("chat replies never load remote images", () => {
  it("shows the image description instead of an image", () => {
    const view = html("See ![tracking pixel](https://evil.example/p.png) here");
    expect(view.querySelector("img")).toBeNull();
    expect(view.innerHTML).not.toContain("evil.example");
    expect(view.textContent).toContain("[tracking pixel]");
  });

  it("ignores raw HTML images", () => {
    const view = html('<img src="https://evil.example/p.png">');
    expect(view.querySelector("img")).toBeNull();
  });
});

describe("chat reply links", () => {
  it("never turns a backslash path into another host", () => {
    expect(chatLinkTarget("/\\evil.example")).toBeNull();
    // Markdown percent-encodes the backslash, leaving a harmless same-site path.
    const href =
      html("[x](/\\evil.example)").querySelector("a")?.getAttribute("href") ??
      "";
    expect(href.startsWith("//")).toBe(false);
    expect(href === "" || href.startsWith("/%5C")).toBe(true);
  });

  it("keeps same-site paths in the app", () => {
    const link = html("[Compare](/compare?ids=radar)").querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/compare?ids=radar");
    expect(link.hasAttribute("data-internal")).toBe(true);
  });

  it("opens a tool reply link directly in the chat instead of routing away", () => {
    const onOpenProduct = vi.fn(() => true);
    const view = render(
      <ChatMarkdown onOpenProduct={onOpenProduct}>
        {"[Landscape](/product/landscape)"}
      </ChatMarkdown>,
    );
    const link = view.getByRole("link", { name: "Landscape" });
    fireEvent.click(link);
    expect(onOpenProduct).toHaveBeenCalledWith("landscape");
    expect(link.getAttribute("href")).toBe("/product/landscape");
    expect(link.hasAttribute("data-internal")).toBe(false);
  });

  it("does not mistake the general home page for a tool page", () => {
    expect(chatProductId("/")).toBeNull();
    expect(chatProductId("https://www.e20e.tools")).toBeNull();
    expect(chatProductId("/product/landscape")).toBe("landscape");
  });

  it("opens https links safely", () => {
    const link = html("[Docs](https://example.com/a)").querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "//evil.example/x",
    "https://user:pw@evil.example/",
    "ftp://example.com/f",
  ])("makes %s plain text", (href) => {
    expect(chatLinkTarget(href)).toBeNull();
    expect(html(`[click](${href})`).querySelector("a")).toBeNull();
  });
});
