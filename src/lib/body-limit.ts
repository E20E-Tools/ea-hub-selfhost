/** Largest request body accepted before any parsing (request form: 3 images x 3 MB + fields). */
export const MAX_BODY_BYTES = 12 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
  }
}

function tooLarge(): Response {
  return new Response("Payload Too Large", {
    status: 413,
    headers: { "content-type": "text/plain; charset=utf-8", connection: "close" },
  });
}

/**
 * Enforces the body limit at the request boundary. A declared content-length over the limit
 * is rejected at once; otherwise (including chunked bodies without content-length) the body
 * is streamed through a counter that errors past the limit, so parsers never buffer more.
 */
export function limitRequestBody(
  request: Request,
  max = MAX_BODY_BYTES,
): { request: Request } | { response: Response } {
  if (!request.body || request.method === "GET" || request.method === "HEAD") return { request };
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isFinite(size) || size < 0 || size > max) return { response: tooLarge() };
  }
  let seen = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) controller.error(new BodyTooLargeError());
      else controller.enqueue(chunk);
    },
  });
  const body = request.body.pipeThrough(counter);
  // Copy fields explicitly: passing the incoming Request as init fails on some runtimes'
  // Request implementations ("Cannot read properties of undefined (reading 'window')").
  const limited = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    body,
    // Required by Node/undici for streamed bodies; ignored by workerd.
    duplex: "half",
  } as RequestInit);
  return { request: limited };
}

/** True when an error (possibly wrapped) came from the body counter. */
export function isBodyTooLarge(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof BodyTooLargeError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const bodyTooLargeResponse = tooLarge;
