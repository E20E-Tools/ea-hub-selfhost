import { describe, expect, it } from "vitest";
import { languageFromSearch, shareImageMeta } from "./share";
describe("share links", () => {
  it("uses the current public origin for product previews", () => {
    expect(shareImageMeta("tools")[0]?.content).toBe(
      "https://www.e20e.tools/og/tools.jpg",
    );
  });
  it("reads lang=ar from the link", () => {
    expect(languageFromSearch("?lang=ar")).toBe("ar");
  });
  it("ignores unknown languages", () => {
    expect(languageFromSearch("?lang=fr")).toBeNull();
  });
});
