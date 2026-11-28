// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { resetSelfhostConfig } from "../server/config";
import { clientIp, withClientIp } from "../server/http";

beforeEach(() => {
  process.env["APP_ENCRYPTION_KEY"] =
    "test-root-secret-for-client-ip-0123456789";
  process.env["DATABASE_URL"] = "postgres://unused/db";
  process.env["TRUST_PROXY_HOPS"] = "1";
  delete process.env["TRUST_CLOUDFLARE"];
  resetSelfhostConfig();
});

describe("client IP used for rate limits", () => {
  it("ignores a cf-connecting-ip header sent by the client", () => {
    const spoofed = new Request("http://x/api/selfhost/auth/token", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 203.0.113.7",
      },
      body: "{}",
    });
    // The last hop added by the trusted proxy wins; the client's own header is dropped.
    expect(clientIp(withClientIp(spoofed))).toBe("203.0.113.7");
  });

  it("falls back to a shared bucket when there is no proxy header", () => {
    const direct = new Request("http://x/", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    expect(clientIp(withClientIp(direct))).toBe("unknown-client");
  });
});
