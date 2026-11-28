import "./lib/error-capture";
// Self-host: Postgres-backed replacement for Supabase (auth, data, storage, realtime).
import { selfhostFetch } from "./selfhost/server/register";
import { traced } from "./selfhost/server/otel";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  bodyTooLargeResponse,
  isBodyTooLarge,
  limitRequestBody,
} from "./lib/body-limit";

type ServerEntry = {
  fetch: (
    request: Request,
    env: unknown,
    ctx: unknown,
  ) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as {
      unhandled?: unknown;
      message?: unknown;
    };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  fetch: (incoming: Request, env: unknown, ctx: unknown) =>
    traced(incoming, () => handleRequest(incoming, env, ctx)),
};

async function handleRequest(incoming: Request, env: unknown, ctx: unknown) {
  {
    const selfhost = await selfhostFetch(incoming);
    if ("response" in selfhost) return selfhost.response;
    const request = selfhost.request;
    const bounded = limitRequestBody(request);
    if ("response" in bounded) return bounded.response;
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(bounded.request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      if (isBodyTooLarge(error)) return bodyTooLargeResponse();
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }
}
