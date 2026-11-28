import type { QuerySpec } from "../supabase-js/spec";
import { selfhostConfig } from "./config";
import { ANON, db, type RequestAuth } from "./db";
import { executeSpec } from "./execute";
import * as auth from "./auth";
import { serveObject, StorageBucket } from "./storage";
import { realtimeStream, type Subscription } from "./realtime";
import { metricsResponse } from "./metrics";

/**
 * HTTP endpoints of the self-hosted backend, served by the app itself under /api/selfhost/*.
 * They replace what the browser used to call on Supabase (Auth, PostgREST, Storage, Realtime).
 */

const PREFIX = "/api/selfhost/";
const MAX_JSON = 1024 * 1024;

const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extra },
  });

function bearer(request: Request): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  return m?.[1];
}

async function requestAuth(request: Request): Promise<RequestAuth | "invalid"> {
  const token = bearer(request);
  if (!token) return ANON;
  const claims = await auth.verifiedClaims(token);
  return claims ? { role: "authenticated", claims } : "invalid";
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_JSON) throw new Error("too large");
  const text = await request.text();
  if (text.length > MAX_JSON) throw new Error("too large");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function crossSite(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
}

/**
 * Behind Caddy/Traefik/ingress-nginx the client address arrives in X-Forwarded-For. Upstream
 * EA-Hub reads the client IP from `cf-connecting-ip` (Cloudflare) only, so translate the
 * trusted hop into that header and drop any value the client sent itself.
 */
export function withClientIp(request: Request): Request {
  const hops = selfhostConfig().trustProxyHops;
  const behindCloudflare = process.env["TRUST_CLOUDFLARE"] === "true";
  const headers = new Headers(request.headers);
  if (!behindCloudflare) headers.delete("cf-connecting-ip");
  if (!headers.has("cf-connecting-ip") && hops > 0) {
    const chain = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = chain[chain.length - hops];
    if (ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip))
      headers.set("cf-connecting-ip", ip);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  return new Request(request.url, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    signal: request.signal,
    redirect: request.redirect,
    // @ts-expect-error Node needs duplex for streaming request bodies
    duplex: hasBody ? "half" : undefined,
  });
}

async function health(): Promise<Response> {
  try {
    await db()`select 1`;
    return json({ ok: true, database: "ok" });
  } catch {
    return json({ ok: false, database: "unreachable" }, 503);
  }
}

export async function handleSelfhost(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/healthz" || url.pathname === "/api/selfhost/health")
    return health();
  if (url.pathname === "/metrics" && request.method === "GET")
    return metricsResponse(request);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const route = url.pathname.slice(PREFIX.length);
  const method = request.method.toUpperCase();
  try {
    // ---------- storage files (GET, signed or public) ----------
    if (method === "GET" && route.startsWith("storage/object/sign/"))
      return await serveObject(
        url,
        "sign",
        route.slice("storage/object/sign/".length),
      );
    if (method === "GET" && route.startsWith("storage/object/public/"))
      return await serveObject(
        url,
        "public",
        route.slice("storage/object/public/".length),
      );

    // ---------- recovery link from the email ----------
    if (method === "GET" && route === "auth/verify") {
      const target = await auth.verifyRecovery(
        url.searchParams.get("token") ?? "",
        url.searchParams.get("redirect_to") ?? undefined,
      );
      return new Response(null, {
        status: 303,
        headers: {
          location: target,
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        },
      });
    }

    if (
      method !== "POST" &&
      !(method === "GET" && route === "auth/user") &&
      !(method === "PUT" && route === "auth/user")
    )
      return json({ message: "Method not allowed" }, 405);
    if (method !== "GET" && crossSite(request))
      return json({ message: "Cross-site request refused" }, 403);

    switch (route) {
      case "auth/token": {
        const body = await readJson(request);
        const grant = url.searchParams.get("grant_type") ?? body["grant_type"];
        const r =
          grant === "refresh_token"
            ? await auth.refreshSession(String(body["refresh_token"] ?? ""))
            : await auth.signInWithPassword(
                String(body["email"] ?? ""),
                String(body["password"] ?? ""),
                clientIp(request),
              );
        if (r.error)
          return json(
            {
              error: r.error.code,
              code: r.error.code,
              message: r.error.message,
            },
            r.error.status,
          );
        return json(r.session);
      }
      case "auth/logout": {
        const token = bearer(request);
        const scope = url.searchParams.get("scope");
        if (token)
          await auth.signOut(
            token,
            scope === "global" || scope === "others" ? scope : "local",
          );
        return new Response(null, { status: 204 });
      }
      case "auth/recover": {
        const body = await readJson(request);
        await auth.sendRecovery(
          String(body["email"] ?? ""),
          (body["redirect_to"] as string) || undefined,
          clientIp(request),
        );
        return json({});
      }
      case "auth/user": {
        const token = bearer(request);
        if (!token)
          return json(
            { code: "session_not_found", message: "Auth session missing!" },
            401,
          );
        if (method === "PUT") {
          const body = await readJson(request);
          const r = await auth.updateOwnUser(token, {
            password:
              typeof body["password"] === "string"
                ? body["password"]
                : undefined,
            data: body["data"] as Record<string, unknown> | undefined,
          });
          return r.error
            ? json(
                { code: r.error.code, message: r.error.message },
                r.error.status,
              )
            : json(r.user);
        }
        const r = await auth.userFromToken(token);
        return r.error
          ? json(
              { code: r.error.code, message: r.error.message },
              r.error.status,
            )
          : json(r.user);
      }
    }

    const who = await requestAuth(request);
    if (who === "invalid")
      return json({ code: "PGRST301", message: "JWT expired or invalid" }, 401);

    switch (route) {
      case "rest": {
        const body = await readJson(request);
        const spec = body["spec"] as QuerySpec;
        if (!spec || typeof spec !== "object")
          return json({ message: "Missing spec" }, 400);
        const result = await executeSpec({ ...spec, schema: "public" }, who);
        return json(result, 200);
      }
      case "storage/sign": {
        const body = await readJson(request);
        const bucket = new StorageBucket(String(body["bucket"] ?? ""), who);
        const r = await bucket.createSignedUrl(
          String(body["path"] ?? ""),
          Number(body["expiresIn"] ?? 60),
          {
            download: body["download"] as boolean | string | undefined,
          },
        );
        return json(r, 200);
      }
      case "realtime": {
        const body = await readJson(request);
        const subs = Array.isArray(body["subscriptions"])
          ? (body["subscriptions"] as Subscription[])
          : [];
        const token = bearer(request);
        return realtimeStream(subs, who, request.signal, async () =>
          token ? Boolean(await auth.verifiedClaims(token)) : true,
        );
      }
    }
    return json({ message: "Not found" }, 404);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as Error)?.message === "too large"
    )
      return json({ message: "Invalid request body" }, 400);
    console.error(
      "[selfhost] request failed",
      (error as Error)?.message ?? error,
    );
    return json({ message: "Server error" }, 500);
  }
}
