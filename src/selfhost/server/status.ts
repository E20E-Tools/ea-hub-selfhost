import { access, constants } from "node:fs/promises";
import { selfhostConfig } from "./config";
import { db, serviceRunsAsOwner } from "./db";
import { verifiedClaims } from "./auth";
import { oidcSettings } from "./oidc";

/**
 * GET /api/selfhost/status: operational status for administrators (Bearer = their session).
 * Reports configuration as on/off only; never returns secrets, addresses of other systems or
 * user data.
 */

export type Check = { ok: boolean | null; detail: string };

const started = Date.now();

async function isAdmin(token: string): Promise<boolean> {
  const claims = await verifiedClaims(token);
  if (!claims) return false;
  const rows = await db().unsafe(
    "select 1 from public.user_roles where user_id = $1 and role = 'admin' limit 1",
    [String(claims["sub"])],
  );
  return rows.length > 0;
}

const set = (name: string) => Boolean(process.env[name]?.trim());

export async function statusReport(): Promise<Record<string, unknown>> {
  const cfg = selfhostConfig();
  const checks: Record<string, Check> = {};

  try {
    const [row] = await db().unsafe<
      { version: string; size: string; now: Date }[]
    >(
      "select current_setting('server_version') as version, pg_size_pretty(pg_database_size(current_database())) as size, now() as now",
    );
    checks["database"] = {
      ok: true,
      detail: `PostgreSQL ${row?.version} · ${row?.size}${(await serviceRunsAsOwner()) ? " · owner mode" : ""}`,
    };
  } catch (e) {
    checks["database"] = { ok: false, detail: (e as Error).message };
  }

  try {
    const [m] = await db().unsafe<{ count: number; last: string | null }[]>(
      "select count(*)::int as count, max(created_at)::text as last from drizzle.__drizzle_migrations",
    );
    checks["migrations"] = {
      ok: true,
      detail: `${m?.count ?? 0} applied${m?.last ? ` · latest ${new Date(Number(m.last)).toISOString().slice(0, 10)}` : ""}`,
    };
  } catch {
    checks["migrations"] = { ok: null, detail: "not readable" };
  }

  const backend =
    (process.env["STORAGE_BACKEND"] ?? "filesystem").trim() || "filesystem";
  if (backend === "s3") {
    checks["storage"] = {
      ok: set("S3_BUCKET"),
      detail: `S3 bucket ${set("S3_BUCKET") ? "configured" : "missing"}`,
    };
  } else {
    let writable = false;
    try {
      await access(cfg.storageDir, constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
    checks["storage"] = {
      ok: writable,
      detail: `volume ${writable ? "writable" : "NOT writable"}`,
    };
  }

  const mail = set("SMTP_HOST")
    ? "SMTP"
    : set("RESEND_API_KEY")
      ? "Resend"
      : "";
  checks["mail"] = {
    ok: mail ? true : null,
    detail: mail
      ? `${mail} configured`
      : "not configured (password reset e-mails are off)",
  };
  const sso = oidcSettings();
  checks["sso"] = {
    ok: sso ? true : null,
    detail: sso ? `on · ${new URL(sso.issuer).host}` : "off",
  };
  checks["scheduledJobs"] = {
    ok: set("CRON_SECRET"),
    detail: set("CRON_SECRET")
      ? "secret configured"
      : "CRON_SECRET missing: daily jobs cannot run",
  };
  checks["metrics"] = {
    ok: set("METRICS_TOKEN") ? true : null,
    detail: set("METRICS_TOKEN") ? "/metrics on" : "off",
  };
  checks["semanticSearch"] = {
    ok: set("OPENAI_API_KEY") || set("EA_LOCAL_SEMANTIC") ? true : null,
    detail: set("OPENAI_API_KEY")
      ? "OpenAI embeddings"
      : set("EA_LOCAL_SEMANTIC")
        ? "local model"
        : "off",
  };

  return {
    version: process.env["EA_HUB_VERSION"] ?? "dev",
    node: process.version,
    uptimeSeconds: Math.round((Date.now() - started) / 1000),
    appUrl: cfg.appUrl,
    checks,
  };
}

export async function statusResponse(request: Request): Promise<Response> {
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
  };
  if (!token || !(await isAdmin(token)))
    return new Response(JSON.stringify({ message: "Admins only" }), {
      status: 403,
      headers,
    });
  return new Response(JSON.stringify(await statusReport()), { headers });
}
