import { randomBytes } from "node:crypto";

/**
 * Minimal OpenTelemetry tracing: one SERVER span per HTTP request, exported as OTLP/HTTP JSON
 * to any collector (OpenTelemetry Collector, Jaeger, Tempo, Datadog Agent, Azure Monitor via
 * the collector…). No SDK dependency. W3C `traceparent` from the caller is continued.
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT   e.g. http://otel-collector:4318  (off when empty)
 *   OTEL_EXPORTER_OTLP_HEADERS    optional "key=value,key2=value2" (API keys)
 *   OTEL_SERVICE_NAME             default "ea-hub"
 *   OTEL_TRACES_SAMPLER_ARG       sampling ratio 0..1 for new traces, default 1
 */

type Span = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: { key: string; value: Record<string, unknown> }[];
  status: { code: number };
};

const queue: Span[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

function endpoint(): string | undefined {
  const e = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  return e ? e.replace(/\/+$/, "") : undefined;
}

export function tracingEnabled(): boolean {
  return Boolean(endpoint());
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  for (const pair of (process.env["OTEL_EXPORTER_OTLP_HEADERS"] ?? "").split(
    ",",
  )) {
    const i = pair.indexOf("=");
    if (i > 0)
      h[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return h;
}

const nowNanos = () =>
  (
    BigInt(Date.now()) * 1_000_000n +
    (process.hrtime.bigint() % 1_000_000n)
  ).toString();

/** Route without ids, to keep span names low-cardinality. */
export function routeName(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) =>
      /^[0-9a-f-]{16,}$/i.test(seg) || /^\d+$/.test(seg) ? ":id" : seg,
    )
    .slice(0, 6)
    .join("/");
}

const attr = (key: string, value: string | number) => ({
  key,
  value:
    typeof value === "number"
      ? { intValue: String(value) }
      : { stringValue: value },
});

export async function flush(): Promise<void> {
  const url = endpoint();
  if (!url || !queue.length) return;
  const spans = queue.splice(0, queue.length);
  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attr("service.name", process.env["OTEL_SERVICE_NAME"] || "ea-hub"),
            attr("service.version", process.env["EA_HUB_VERSION"] || "dev"),
          ],
        },
        scopeSpans: [{ scope: { name: "ea-hub-selfhost" }, spans }],
      },
    ],
  };
  try {
    await fetch(`${url}/v1/traces`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Tracing must never affect the app; spans are dropped when the collector is down.
  }
}

/** Runs the handler inside a SERVER span (when tracing is configured). */
export async function traced(
  request: Request,
  handle: () => Promise<Response>,
): Promise<Response> {
  if (!tracingEnabled()) return handle();
  const incoming = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(
    request.headers.get("traceparent") ?? "",
  );
  const ratio = Number(process.env["OTEL_TRACES_SAMPLER_ARG"] ?? 1);
  const sampled = incoming
    ? (parseInt(incoming[3]!, 16) & 1) === 1
    : Math.random() < (Number.isFinite(ratio) ? ratio : 1);
  if (!sampled) return handle();
  const traceId = incoming?.[1] ?? randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const start = nowNanos();
  const url = new URL(request.url);
  let status = 500;
  try {
    const response = await handle();
    status = response.status;
    return response;
  } finally {
    const route = routeName(url.pathname);
    const span: Span = {
      traceId,
      spanId,
      name: `${request.method} ${route}`,
      kind: 2, // SERVER
      startTimeUnixNano: start,
      endTimeUnixNano: nowNanos(),
      attributes: [
        attr("http.request.method", request.method),
        attr("url.path", url.pathname),
        attr("http.route", route),
        attr("http.response.status_code", status),
      ],
      status: { code: status >= 500 ? 2 : 0 },
    };
    if (incoming) span.parentSpanId = incoming[2]!;
    queue.push(span);
    if (queue.length > 5000) queue.splice(0, queue.length - 5000);
    if (!timer) {
      timer = setInterval(() => void flush(), 5000);
      timer.unref?.();
    }
  }
}
