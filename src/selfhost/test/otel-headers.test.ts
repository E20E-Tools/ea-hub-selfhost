// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, routeName, traced } from "../server/otel";
import { withApiSecurityHeaders } from "../server/register";

afterEach(() => {
  delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  delete process.env["OTEL_EXPORTER_OTLP_HEADERS"];
  vi.unstubAllGlobals();
});

describe("OpenTelemetry request spans", () => {
  it("does nothing without an endpoint", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    const res = await traced(
      new Request("http://x/"),
      async () => new Response("ok"),
    );
    expect(await res.text()).toBe("ok");
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("exports a SERVER span as OTLP JSON and continues the caller's trace", async () => {
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://collector:4318/";
    process.env["OTEL_EXPORTER_OTLP_HEADERS"] = "x-api-key=abc%20123";
    const send = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", send);
    const parent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    await traced(
      new Request("http://x/api/selfhost/rest/products/123", {
        headers: { traceparent: parent },
      }),
      async () => new Response("x", { status: 404 }),
    );
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://collector:4318/v1/traces");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      "abc 123",
    );
    const body = JSON.parse(String(init.body));
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(span.parentSpanId).toBe("b7ad6b7169203331");
    expect(span.name).toBe("GET /api/selfhost/rest/products/:id");
    expect(span.kind).toBe(2);
    expect(span.attributes).toContainEqual({
      key: "http.response.status_code",
      value: { intValue: "404" },
    });
  });

  it("never breaks the request when the collector is down", async () => {
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://collector:4318";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const res = await traced(
      new Request("http://x/healthz"),
      async () => new Response("ok"),
    );
    expect(res.status).toBe(200);
    await expect(flush()).resolves.toBeUndefined();
  });

  it("keeps span names low-cardinality", () => {
    expect(
      routeName("/admin/products/0b6c1f9e-1d2a-4c8e-9f00-123456789abc/edit"),
    ).toBe("/admin/products/:id/edit");
    expect(routeName("/api/public/jobs/daily-cleanup")).toBe(
      "/api/public/jobs/daily-cleanup",
    );
  });
});

describe("self-host API security headers", () => {
  it("adds strict headers and keeps the ones a handler set", () => {
    const res = withApiSecurityHeaders(
      new Response("{}", {
        headers: { "cross-origin-resource-policy": "same-site" },
      }),
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
  });
});
