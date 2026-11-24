import { describe, expect, it } from "vitest";
import {
  previewUrl,
  resolvePreviewTheme,
  stripPreviewParam,
} from "@/themes/preview";

describe("theme preview param", () => {
  it("a valid param wins over the tab's stored value", () => {
    expect(resolvePreviewTheme("?preview-theme=circuit-core", "classic")).toBe(
      "circuit-core",
    );
  });
  it("keeps the stored preview while browsing without the param", () => {
    expect(resolvePreviewTheme("?q=apm", "circuit-core")).toBe("circuit-core");
  });
  it("ignores unknown or retired ids", () => {
    expect(resolvePreviewTheme("?preview-theme=holo-grid", null)).toBeNull();
    expect(resolvePreviewTheme("", "neo-spectrum")).toBeNull();
  });
  it("builds and strips the preview URL", () => {
    expect(previewUrl("circuit-core")).toBe("/?preview-theme=circuit-core");
    expect(stripPreviewParam("?preview-theme=circuit-core&q=x")).toBe("?q=x");
    expect(stripPreviewParam("?preview-theme=circuit-core")).toBe("");
  });
});
