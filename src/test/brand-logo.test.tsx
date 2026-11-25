import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "@/components/brand-logo";

const mark = (src: string) =>
  render(<BrandLogo src={src} className="nx-brand-mark" />).container
    .firstElementChild as HTMLElement;

describe("site logo", () => {
  it("tints a same-origin logo with the design colours through a mask", () => {
    const el = mark("/_vercel/image?url=logo.png&w=256&q=75");
    expect(el.className).toBe("brand-logo nx-brand-mark");
    expect(el.hasAttribute("data-masked")).toBe(true);
    expect(el.style.getPropertyValue("--brand-logo-src")).toBe(
      'url("/_vercel/image?url=logo.png&w=256&q=75")',
    );
    // The image stays in place for the logo's own proportions and as the fallback.
    expect(el.querySelector("img")?.getAttribute("src")).toContain("logo.png");
  });

  it("shows a cross-origin logo as the plain image until CORS is confirmed", () => {
    const el = mark("https://storage.example.com/logo.png");
    expect(el.hasAttribute("data-masked")).toBe(false);
    expect(el.style.getPropertyValue("--brand-logo-src")).toBe("");
    expect(el.querySelector("img")).not.toBeNull();
  });

  it("cannot break out of the url() token", () => {
    const el = mark('/logo.png");background:red;x("');
    const value = el.style.getPropertyValue("--brand-logo-src");
    expect(value.startsWith('url("/logo.png%22')).toBe(true);
    expect(value.slice(5, -2)).not.toContain('"');
  });

  it("has no card, border or shadow around the header logo", () => {
    const css = readFileSync("src/studio/workspace.css", "utf8");
    const rule = css.slice(css.indexOf(".nx-brand > .nx-brand-mark {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).not.toMatch(/background|border|box-shadow|padding/);
  });
});
