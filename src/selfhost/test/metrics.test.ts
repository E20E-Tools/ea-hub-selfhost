// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const select = vi.fn(async () => [{ "?column?": 1 }]);
vi.mock("../server/db", () => ({ db: () => select }));

import { countRequest, metricsResponse } from "../server/metrics";

const get = (auth?: string) =>
  new Request(
    "http://x/metrics",
    auth ? { headers: { authorization: auth } } : {},
  );

describe("self-host /metrics", () => {
  afterEach(() => {
    delete process.env["METRICS_TOKEN"];
  });

  it("is hidden when METRICS_TOKEN is not set", async () => {
    expect((await metricsResponse(get("Bearer anything"))).status).toBe(404);
  });

  it("rejects a missing or wrong token", async () => {
    process.env["METRICS_TOKEN"] = "metrics-token-123";
    expect((await metricsResponse(get())).status).toBe(401);
    expect(
      (await metricsResponse(get("Bearer metrics-token-124"))).status,
    ).toBe(401);
  });

  it("serves Prometheus text with the right token", async () => {
    process.env["METRICS_TOKEN"] = "metrics-token-123";
    countRequest("GET");
    countRequest("WEIRD");
    const res = await metricsResponse(get("Bearer metrics-token-123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("eahub_up 1");
    expect(body).toContain("eahub_database_up 1");
    expect(body).toMatch(/eahub_http_requests_total\{method="GET"\} \d+/);
    expect(body).toMatch(/eahub_http_requests_total\{method="OTHER"\} \d+/);
  });

  it("reports the database as down when the query fails", async () => {
    process.env["METRICS_TOKEN"] = "t";
    select.mockRejectedValueOnce(new Error("down"));
    const body = await (await metricsResponse(get("Bearer t"))).text();
    expect(body).toContain("eahub_database_up 0");
  });
});
