import { describe, expect, it } from "vitest";
import { footerLinksSchema, linkedFooterParts } from "@/lib/footer-links";
describe("Footer website links", () => {
  it("links only configured names without changing surrounding text", () => {
    expect(
      linkedFooterParts("By E20E.Tools & DT.Guide", [
        { name: "DT.Guide", url: "https://www.dt.guide/" },
      ]),
    ).toEqual([{ text: "By E20E.Tools & " }, { text: "DT.Guide", url: "https://www.dt.guide/" }]);
  });
  it("rejects script links and credentials", () => {
    expect(
      footerLinksSchema.safeParse([{ name: "Site", url: "javascript:alert(1)" }]).success,
    ).toBe(false);
    expect(
      footerLinksSchema.safeParse([{ name: "Site", url: "https://user:pass@example.com" }]).success,
    ).toBe(false);
  });
  it("preserves plain text when no links are configured", () => {
    expect(linkedFooterParts("By E20E.Tools", [])).toEqual([{ text: "By E20E.Tools" }]);
  });
});
