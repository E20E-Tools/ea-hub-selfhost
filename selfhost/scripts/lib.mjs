// Shared helpers for the self-host scripts (migrate, admin, start). Plain Node, no build step.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/** Builds a postgres:// URL from parts so passwords with any character work. */
export function databaseUrl({ admin = false } = {}) {
  const direct = admin ? process.env.DATABASE_ADMIN_URL : process.env.DATABASE_URL;
  if (direct?.trim()) return direct.trim();
  const host = process.env.DB_HOST || "db";
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || process.env.POSTGRES_DB || "eahub";
  const user = admin ? process.env.POSTGRES_USER || "postgres" : process.env.APP_DB_USER || "eahub_app";
  const password = admin ? process.env.POSTGRES_PASSWORD : process.env.APP_DB_PASSWORD;
  if (!password) {
    throw new Error(
      admin
        ? "POSTGRES_PASSWORD (or DATABASE_ADMIN_URL) is not set"
        : "APP_DB_PASSWORD (or DATABASE_URL) is not set",
    );
  }
  const ssl = process.env.DB_SSLMODE ? `?sslmode=${encodeURIComponent(process.env.DB_SSLMODE)}` : "";
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}${ssl}`;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "?";
  }
}

// Same format as src/selfhost/server/crypto.ts: scrypt$N$r$p$salt$hash
export function hashPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scryptCb(String(password).normalize("NFKC"), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`),
    ),
  );
}

/** True when password matches a stored scrypt$N$r$p$salt$hash value. */
export function passwordMatches(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return Promise.resolve(false);
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  return new Promise((resolve) =>
    scryptCb(String(password).normalize("NFKC"), Buffer.from(salt, "base64"), expected.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
      (err, key) => resolve(!err && key.length === expected.length && timingSafeEqual(key, expected))),
  );
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
}

/** Creates the admin account if missing; with reset=true also replaces its password. */
export async function ensureAdmin(sql, email, password, { reset = false } = {}) {
  const address = String(email).trim().toLowerCase();
  if (!validEmail(address)) throw new Error("ADMIN_EMAIL is not a valid email address");
  if (String(password ?? "").length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  const [existing] = await sql`select id, encrypted_password from auth.users where lower(email) = ${address} and deleted_at is null`;
  let id = existing?.id;
  let action = "kept";
  if (!id) {
    const [row] = await sql`
      insert into auth.users (email, encrypted_password, email_confirmed_at, raw_app_meta_data)
      values (${address}, ${await hashPassword(password)}, now(), ${JSON.stringify({ provider: "email", providers: ["email"] })}::jsonb)
      returning id`;
    id = row.id;
    action = "created";
  } else if (reset && !(await passwordMatches(password, existing.encrypted_password))) {
    await sql`update auth.users set encrypted_password = ${await hashPassword(password)}, updated_at = now(), banned_until = null where id = ${id}`;
    await sql`update auth.refresh_tokens set revoked_at = now() where user_id = ${id} and revoked_at is null`;
    action = "password reset";
  }
  await sql`insert into public.user_roles (user_id, role) values (${id}, 'admin') on conflict do nothing`;
  return action;
}

export async function waitForDatabase(sql, seconds = 90) {
  const until = Date.now() + seconds * 1000;
  let lastLog = 0;
  for (;;) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      // Say why every 15 s (the message names the problem, never the password).
      if (Date.now() - lastLog > 15_000) {
        lastLog = Date.now();
        console.log(`[migrate] database not ready yet: ${error?.code ?? ""} ${error?.message ?? error}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
