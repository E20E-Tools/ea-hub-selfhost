// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  signJwt,
  verifyJwt,
  verifyPassword,
} from "../server/crypto";
// The migrate/admin scripts are plain Node; they must write hashes the app can verify.
// @ts-expect-error untyped .mjs helper
import {
  hashPassword as scriptHash,
  passwordMatches,
} from "../../../selfhost/scripts/lib.mjs";
import { safeObjectPath } from "../server/storage";

describe("self-host crypto", () => {
  it("app and setup scripts share one password format", async () => {
    const fromScript = (await scriptHash("correct horse battery")) as string;
    expect(await verifyPassword("correct horse battery", fromScript)).toBe(
      true,
    );
    expect(await verifyPassword("wrong", fromScript)).toBe(false);
    const fromApp = await hashPassword("another long secret");
    expect(await passwordMatches("another long secret", fromApp)).toBe(true);
    expect(await verifyPassword("x", null)).toBe(false);
  });

  it("verifies JWT signature and expiry", () => {
    const key = Buffer.alloc(32, 7);
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: "u", exp: now + 60 }, key);
    expect(verifyJwt(token, key)?.["sub"]).toBe("u");
    expect(verifyJwt(token, Buffer.alloc(32, 8))).toBeNull();
    expect(verifyJwt(signJwt({ sub: "u", exp: now - 1 }, key), key)).toBeNull();
    const [h, , s] = token.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: "admin", exp: now + 60 })).toString("base64url")}.${s}`;
    expect(verifyJwt(forged, key)).toBeNull();
  });

  it("refuses storage paths that escape the bucket", () => {
    expect(safeObjectPath("a/b.png")).toBe("a/b.png");
    expect(safeObjectPath("/a/b.png")).toBe("a/b.png");
    for (const bad of ["../x", "a/../../x", "a//b", "a\\b", "", "a/./b"])
      expect(safeObjectPath(bad)).toBeNull();
  });
});
