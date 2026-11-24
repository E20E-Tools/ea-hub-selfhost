// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  aiBaseUrlProblem,
  boundedAiFetch,
  keyMoveProblem,
  safeAiError,
} from "@/lib/ai-settings.shared";
import {
  CHAT_GLOBAL_DAY_LIMIT,
  RECOMMEND_GLOBAL_DAY_LIMIT,
} from "@/lib/ai-budget.shared";
import { limitRequestBody } from "@/lib/body-limit";
import {
  clearLegacy,
  historyKey,
  loadAccountState,
  parseHistory,
  sessionKey,
} from "@/lib/assistant-storage";
import { readFileSync } from "node:fs";

it("provider error logging excludes echoed credentials, prompts, bodies and nested causes", () => {
  const error = Object.assign(new Error("fixture credential in message"), {
    name: "fixture credential in name",
    statusCode: 401,
    responseBody: "fixture prompt and credential",
    cause: new Error("fixture credential in cause"),
  });
  expect(safeAiError(error)).toBe("provider failure status=401");
  expect(safeAiError({ statusCode: "fixture credential" })).toBe(
    "provider failure",
  );
});

it("keeps the paid AI daily budgets at 500 chat and 500 recommendations", () => {
  expect(CHAT_GLOBAL_DAY_LIMIT).toBe(500);
  expect(RECOMMEND_GLOBAL_DAY_LIMIT).toBe(500);
});

it("rejects AI base URLs with query, fragment, credentials or nonstandard ports", () => {
  expect(aiBaseUrlProblem("https://api.openai.com/v1?x=1")).not.toBeNull();
  expect(aiBaseUrlProblem("https://api.openai.com/v1#a")).not.toBeNull();
  expect(aiBaseUrlProblem("https://u:p@api.openai.com/v1")).not.toBeNull();
  expect(aiBaseUrlProblem("https://api.openai.com:8443/v1")).not.toBeNull();
  expect(aiBaseUrlProblem("https://api.openai.com:443/v1")).toBeNull();
  expect(aiBaseUrlProblem("https://api.groq.com/openai/v1")).toBeNull();
});

it("requires a fresh key when the AI host origin changes", () => {
  const base = { hasSavedKey: true, newKey: "", removeKey: false };
  expect(
    keyMoveProblem({
      ...base,
      previousBaseUrl: "https://a.example.com/v1",
      nextBaseUrl: "https://b.example.com/v1",
    }),
  ).toBe(true);
  expect(
    keyMoveProblem({
      ...base,
      previousBaseUrl: "https://a.example.com/v1",
      nextBaseUrl: "https://a.example.com/v2",
    }),
  ).toBe(false);
  expect(
    keyMoveProblem({
      ...base,
      newKey: "k",
      previousBaseUrl: "https://a.example.com",
      nextBaseUrl: "https://b.example.com",
    }),
  ).toBe(false);
});

it("AI fetch refuses redirects, other origins, and carries an abort signal", async () => {
  const base = vi.fn(async () => new Response("{}"));
  const f = boundedAiFetch("https://api.openai.com/v1", 1000, base as never);
  await f("https://api.openai.com/v1/chat/completions", { method: "POST" });
  const init = (base.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(init.redirect).toBe("manual");
  expect(init.signal).toBeInstanceOf(AbortSignal);
  await expect(f("https://evil.example.net/x")).rejects.toThrow();
  expect(base).toHaveBeenCalledTimes(1);
});

it("AI fetch refuses a redirect response", async () => {
  const base = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://10.0.0.1" },
      }),
  );
  const f = boundedAiFetch("https://api.openai.com/v1", 1000, base as never);
  await expect(f("https://api.openai.com/v1/x")).rejects.toThrow(
    "redirect refused",
  );
});

it("AI fetch aborts after the timeout", async () => {
  const base = (_: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      ),
    );
  const f = boundedAiFetch("https://api.openai.com", 20, base as never);
  await expect(f("https://api.openai.com/x")).rejects.toThrow("aborted");
});

it("rejects a declared oversize body before parsing", () => {
  const req = new Request("https://x.test/_serverFn/a", {
    method: "POST",
    body: "x",
    headers: { "content-length": String(13 * 1024 * 1024) },
  });
  const out = limitRequestBody(req);
  expect("response" in out && out.response.status).toBe(413);
});

it("errors a streamed body without content-length once it passes the limit", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(600));
      c.enqueue(new Uint8Array(600));
      c.close();
    },
  });
  const req = new Request("https://x.test/a", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  const out = limitRequestBody(req, 1000);
  if (!("request" in out)) throw new Error("expected request");
  await expect(out.request.arrayBuffer()).rejects.toThrow();
});

it("passes a valid multipart body through intact", async () => {
  const form = new FormData();
  form.set("name", "Khaled");
  form.set(
    "images",
    new File([new Uint8Array(10)], "a.png", { type: "image/png" }),
  );
  const req = new Request("https://x.test/a", { method: "POST", body: form });
  const out = limitRequestBody(req);
  if (!("request" in out)) throw new Error("expected request");
  const parsed = await out.request.formData();
  expect(parsed.get("name")).toBe("Khaled");
  expect((parsed.get("images") as File).size).toBe(10);
});

function memoryStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

it("never hands unowned legacy chat history to a new account", () => {
  const store = memoryStore({
    "e20e-assistant-chat": JSON.stringify([
      { role: "user", content: "old secret" },
    ]),
    "e20e-assistant-access": JSON.stringify({
      token: "t",
      name: "n",
      exp: Date.now() + 1e6,
    }),
  });
  clearLegacy(store);
  expect(store.data.size).toBe(0);
  expect(loadAccountState(store, "user-b")).toEqual({
    session: null,
    history: [],
  });
});

it("scopes chat state per account and drops expired sessions", () => {
  const store = memoryStore({
    [historyKey("a")]: JSON.stringify([{ role: "user", content: "hi A" }]),
    [sessionKey("a")]: JSON.stringify({ token: "t", name: "A", exp: 1 }),
  });
  const a = loadAccountState(store, "a", 10);
  expect(a.history).toEqual([{ role: "user", content: "hi A" }]);
  expect(a.session).toBeNull();
  expect(store.data.has(sessionKey("a"))).toBe(false);
  expect(loadAccountState(store, "b").history).toEqual([]);
});

it("discards malformed stored messages", () => {
  expect(
    parseHistory(
      JSON.stringify([{ role: "system", content: "x" }, 5, { role: "user" }]),
    ),
  ).toEqual([]);
  expect(parseHistory("not json")).toEqual([]);
});

it("saving general settings never deletes storage files", () => {
  const src = readFileSync("src/lib/admin.functions.ts", "utf8");
  const start = src.indexOf("export const saveGeneralSettings");
  const body = src.slice(start, src.indexOf("export const", start + 10));
  expect(body).not.toMatch(/\.remove\(/);
});

it("AI fetch aborts when an existing Request's own signal aborts", async () => {
  const base = vi.fn(
    (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  const f = boundedAiFetch("https://api.openai.com", 60_000, base as never);
  const caller = new AbortController();
  const request = new Request("https://api.openai.com/x", {
    signal: caller.signal,
  });
  const pending = f(request);
  caller.abort();
  await expect(pending).rejects.toThrow("aborted");
});

it("AI fetch honours both Request.signal and init.signal", async () => {
  let seen: AbortSignal | undefined;
  const base = vi.fn(async (_: unknown, init?: RequestInit) => {
    seen = init?.signal ?? undefined;
    return new Response("{}");
  });
  const f = boundedAiFetch("https://api.openai.com", 60_000, base as never);
  const fromRequest = new AbortController();
  const fromInit = new AbortController();
  await f(
    new Request("https://api.openai.com/x", { signal: fromRequest.signal }),
    {
      signal: fromInit.signal,
    },
  );
  expect(seen?.aborted).toBe(false);
  fromInit.abort();
  expect(seen?.aborted).toBe(true);
  const again = new AbortController();
  await f(new Request("https://api.openai.com/x", { signal: again.signal }), {
    signal: new AbortController().signal,
  });
  again.abort();
  expect(seen?.aborted).toBe(true);
});

it("AI fetch aborts a stream that stalls after headers arrive", async () => {
  const base = async (_: unknown, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        init?.signal?.addEventListener("abort", () =>
          controller.error(new Error("stream aborted")),
        );
      },
    });
    return new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
  };
  const f = boundedAiFetch("https://api.openai.com", 30, base as never);
  const response = await f("https://api.openai.com/stream");
  expect(response.status).toBe(200);
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  await reader.read();
  await expect(reader.read()).rejects.toThrow("stream aborted");
});
