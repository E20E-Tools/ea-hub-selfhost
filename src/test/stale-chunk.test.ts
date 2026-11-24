import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "@/lib/stale-chunk";

describe("stale page files after publish", () => {
  it("recognises a missing page file", () => {
    expect(
      isStaleChunkError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://x/assets/a.js",
        ),
      ),
    ).toBe(true);
  });
  it("ignores ordinary errors", () => {
    expect(isStaleChunkError(new Error("permission denied"))).toBe(false);
  });
});
