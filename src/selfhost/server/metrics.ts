import { timingSafeEqual } from "node:crypto";
import { db } from "./db";

/**
 * Prometheus metrics at GET /metrics, in the text exposition format.
 * Enabled only when METRICS_TOKEN is set; scrapers send "Authorization: Bearer <token>".
 * Without the token the path answers 404, as if it did not exist.
 */

const started = Date.now();
const requests = new Map<string, number>();

export function countRequest(method: string): void {
  const key = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ].includes(method)
    ? method
    : "OTHER";
  requests.set(key, (requests.get(key) ?? 0) + 1);
}

function tokenMatches(header: string | null, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function metricsResponse(request: Request): Promise<Response> {
  const token = process.env["METRICS_TOKEN"]?.trim();
  if (!token) return new Response("Not found", { status: 404 });
  if (!tokenMatches(request.headers.get("authorization"), token))
    return new Response("Unauthorized", { status: 401 });

  let dbUp = 0;
  let dbSeconds = 0;
  try {
    const t0 = performance.now();
    await db()`select 1`;
    dbSeconds = (performance.now() - t0) / 1000;
    dbUp = 1;
  } catch {
    dbUp = 0;
  }
  const mem = process.memoryUsage();
  const lines: string[] = [
    "# HELP eahub_up 1 when the app process is serving requests.",
    "# TYPE eahub_up gauge",
    "eahub_up 1",
    "# HELP eahub_database_up 1 when PostgreSQL answered the health query.",
    "# TYPE eahub_database_up gauge",
    `eahub_database_up ${dbUp}`,
    "# HELP eahub_database_ping_seconds Time taken by the health query.",
    "# TYPE eahub_database_ping_seconds gauge",
    `eahub_database_ping_seconds ${dbSeconds.toFixed(6)}`,
    "# HELP eahub_http_requests_total HTTP requests received, by method.",
    "# TYPE eahub_http_requests_total counter",
    ...[...requests.entries()].map(
      ([m, n]) => `eahub_http_requests_total{method="${m}"} ${n}`,
    ),
    "# HELP process_uptime_seconds Seconds since the app process started.",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${((Date.now() - started) / 1000).toFixed(0)}`,
    "# HELP process_resident_memory_bytes Resident memory size in bytes.",
    "# TYPE process_resident_memory_bytes gauge",
    `process_resident_memory_bytes ${mem.rss}`,
    "# HELP nodejs_heap_used_bytes V8 heap in use.",
    "# TYPE nodejs_heap_used_bytes gauge",
    `nodejs_heap_used_bytes ${mem.heapUsed}`,
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
