// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { install } from "../../../selfhost/scripts/http-defaults.mjs";

let server: http.Server;
let base = "";

beforeAll(async () => {
  install();
  server = http.createServer((req, res) => {
    if (req.url === "/guide.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<p>guide</p>");
    } else if (req.url === "/app") {
      res.writeHead(200, {
        "content-type": "text/html",
        "content-security-policy": "default-src 'none'",
        "x-frame-options": "DENY",
      });
      res.end("app");
    } else {
      res.setHeader("content-type", "text/css");
      res.end("body{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("default security headers on every Node response", () => {
  it("adds nosniff and frame protection to static files", async () => {
    const res = await fetch(`${base}/assets/a.css`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("gives static HTML a restrictive CSP", async () => {
    const res = await fetch(`${base}/guide.html`);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
  });

  it("never replaces headers the app set", async () => {
    const res = await fetch(`${base}/app`);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
