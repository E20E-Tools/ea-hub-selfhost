import { randomUUID } from "node:crypto";
import { selfhostConfig } from "./config";
import { asRole, db, SERVICE } from "./db";
import {
  hashPassword,
  randomToken,
  sha256,
  signJwt,
  verifyJwt,
  verifyPassword,
} from "./crypto";
import { sendMail } from "./mail";

/**
 * Email + password accounts for EA-Hub, stored in auth.users of the app's own Postgres.
 * Shapes (User, Session, error codes) follow what supabase-js returned, so the upstream UI
 * code keeps working unchanged.
 */

export type AuthError = {
  message: string;
  code: string;
  status: number;
  name: string;
};
const authError = (message: string, code: string, status = 400): AuthError => ({
  message,
  code,
  status,
  name: "AuthApiError",
});

type UserRow = {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  last_sign_in_at: Date | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  banned_until: Date | null;
  deleted_at: Date | null;
  phone: string | null;
  is_anonymous: boolean;
};

export type User = {
  id: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  phone: string;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
  is_anonymous: boolean;
  banned_until?: string | null;
};

export type Session = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: User;
};

const iso = (d: Date | string | null | undefined) =>
  d ? (d instanceof Date ? d.toISOString() : new Date(d).toISOString()) : null;

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email ?? "",
    email_confirmed_at: iso(row.email_confirmed_at),
    confirmed_at: iso(row.email_confirmed_at),
    phone: row.phone ?? "",
    last_sign_in_at: iso(row.last_sign_in_at),
    app_metadata: {
      provider: "email",
      providers: ["email"],
      ...(row.raw_app_meta_data ?? {}),
    },
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
    is_anonymous: row.is_anonymous,
    banned_until: iso(row.banned_until),
  };
}

const USER_COLUMNS =
  "id, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until, deleted_at, phone, is_anonymous";

async function userById(id: string): Promise<UserRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const rows = await db().unsafe<UserRow[]>(
    `select ${USER_COLUMNS} from auth.users where id = $1 and deleted_at is null`,
    [id],
  );
  return rows[0];
}

async function userByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db().unsafe<UserRow[]>(
    `select ${USER_COLUMNS} from auth.users where lower(email) = lower($1) and deleted_at is null`,
    [email.trim()],
  );
  return rows[0];
}

const banned = (row: UserRow) =>
  Boolean(row.banned_until && row.banned_until.getTime() > Date.now());

// ---------- sessions ----------
async function issueSession(
  row: UserRow,
  sessionId: string = randomUUID(),
  method: "password" | "oidc" = "password",
): Promise<Session> {
  const cfg = selfhostConfig();
  const now = Math.floor(Date.now() / 1000);
  const user = toUser(row);
  const claims = {
    iss: `${cfg.appUrl}/auth/v1`,
    aud: "authenticated",
    sub: row.id,
    email: user.email,
    phone: "",
    role: "authenticated",
    aal: "aal1",
    amr: [{ method, timestamp: now }],
    session_id: sessionId,
    is_anonymous: false,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    iat: now,
    exp: now + cfg.accessTokenSeconds,
  };
  const refresh = randomToken(32);
  await db().unsafe(
    `insert into auth.refresh_tokens (token_hash, user_id, session_id, expires_at)
     values ($1, $2, $3, now() + make_interval(days => $4))`,
    [sha256(refresh), row.id, sessionId, cfg.refreshTokenDays],
  );
  return {
    access_token: signJwt(claims, cfg.jwtSecret),
    token_type: "bearer",
    expires_in: cfg.accessTokenSeconds,
    expires_at: claims.exp,
    refresh_token: refresh,
    user,
  };
}

async function sessionLive(sessionId: unknown): Promise<boolean> {
  if (typeof sessionId !== "string") return false;
  const rows = await db().unsafe(
    `select 1 from auth.refresh_tokens where session_id = $1 and revoked_at is null and expires_at > now() limit 1`,
    [sessionId],
  );
  return rows.length > 0;
}

/** Verifies signature, expiry, that the session was not signed out and the user still exists. */
export async function verifiedClaims(
  token: string,
): Promise<Record<string, unknown> | null> {
  const claims = verifyJwt(token, selfhostConfig().jwtSecret);
  if (
    !claims ||
    claims["role"] !== "authenticated" ||
    typeof claims["sub"] !== "string"
  )
    return null;
  if (!(await sessionLive(claims["session_id"]))) return null;
  return claims;
}

export async function userFromToken(
  token: string,
): Promise<{ user: User | null; error: AuthError | null }> {
  const claims = await verifiedClaims(token);
  if (!claims)
    return {
      user: null,
      error: authError("Auth session missing!", "session_not_found", 403),
    };
  const row = await userById(claims["sub"] as string);
  if (!row || banned(row))
    return {
      user: null,
      error: authError("User not found", "user_not_found", 403),
    };
  return { user: toUser(row), error: null };
}

async function allowAttempt(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
) {
  try {
    const ok = await asRole(SERVICE, async (tx) => {
      const rows = await tx.unsafe(
        "select public.consume_rate_limit(_bucket => $1, _subject => $2, _limit => $3, _window_seconds => $4) as ok",
        [bucket, sha256(subject), limit, windowSeconds],
      );
      return (rows[0] as { ok: boolean } | undefined)?.ok;
    });
    return ok !== false;
  } catch {
    // The limiter is a guard rail; scrypt already makes guessing slow.
    return true;
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
  ip = "unknown-client",
): Promise<{
  session: Session | null;
  user: User | null;
  error: AuthError | null;
}> {
  const address = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!address || !password)
    return {
      session: null,
      user: null,
      error: authError("Invalid login credentials", "invalid_credentials"),
    };
  const allowed =
    (await allowAttempt("selfhost-signin-email", address, 10, 900)) &&
    (await allowAttempt("selfhost-signin-ip", ip, 30, 900));
  if (!allowed)
    return {
      session: null,
      user: null,
      error: authError(
        "Too many sign-in attempts. Try again later.",
        "over_request_rate_limit",
        429,
      ),
    };
  const row = await userByEmail(address);
  const ok = await verifyPassword(String(password), row?.encrypted_password);
  if (!row || !ok || banned(row))
    return {
      session: null,
      user: null,
      error: authError("Invalid login credentials", "invalid_credentials"),
    };
  await db().unsafe(
    "update auth.users set last_sign_in_at = now() where id = $1",
    [row.id],
  );
  row.last_sign_in_at = new Date();
  const session = await issueSession(row);
  return { session, user: session.user, error: null };
}

/**
 * Single sign-on: the identity provider has already proven who this is (oidc.ts verified the
 * ID token). Links to an existing account by e-mail; creates one only when allowed; grants the
 * admin role only when the e-mail or a group is listed in the configuration.
 */
export async function ssoSignIn(params: {
  email: string;
  name: string | undefined;
  /** false = the provider did not confirm the address: never link it to an existing account. */
  emailVerified: boolean;
  isAdmin: boolean;
  autoCreate: boolean;
}): Promise<
  | { session: Session }
  | { error: "not_allowed" | "banned" | "unverified_email" }
> {
  const email = params.email.trim().toLowerCase();
  let row = await userByEmail(email);
  if (row && !params.emailVerified) return { error: "unverified_email" };
  if (!row) {
    if (!params.isAdmin && !params.autoCreate) return { error: "not_allowed" };
    const rows = await db().unsafe<UserRow[]>(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       values ($1, null, now(), $2::jsonb, $3::jsonb)
       on conflict do nothing
       returning ${USER_COLUMNS}`,
      [
        email,
        JSON.stringify(params.name ? { full_name: params.name } : {}),
        JSON.stringify({ provider: "oidc", providers: ["oidc"] }),
      ],
    );
    row = rows[0] ?? (await userByEmail(email));
    if (!row) return { error: "not_allowed" };
  }
  if (banned(row)) return { error: "banned" };
  if (params.isAdmin)
    await db().unsafe(
      "insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict do nothing",
      [row.id],
    );
  await db().unsafe(
    "update auth.users set last_sign_in_at = now(), email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1",
    [row.id],
  );
  row.last_sign_in_at = new Date();
  return { session: await issueSession(row, undefined, "oidc") };
}

/** Puts a session in a URL fragment, the way the browser client reads it after a redirect. */
export function sessionFragment(s: Session, type: string): string {
  return new URLSearchParams({
    access_token: s.access_token,
    expires_at: String(s.expires_at),
    expires_in: String(s.expires_in),
    refresh_token: s.refresh_token,
    token_type: "bearer",
    type,
  }).toString();
}

export async function refreshSession(
  refreshToken: string,
): Promise<{ session: Session | null; error: AuthError | null }> {
  const rows = await db().unsafe<{ user_id: string; session_id: string }[]>(
    `update auth.refresh_tokens set revoked_at = now()
     where token_hash = $1 and revoked_at is null and expires_at > now()
     returning user_id, session_id`,
    [sha256(String(refreshToken ?? ""))],
  );
  const hit = rows[0];
  if (!hit)
    return {
      session: null,
      error: authError("Invalid Refresh Token", "refresh_token_not_found"),
    };
  const row = await userById(hit.user_id);
  if (!row || banned(row))
    return {
      session: null,
      error: authError("User not found", "user_not_found", 403),
    };
  return { session: await issueSession(row, hit.session_id), error: null };
}

export async function signOut(
  token: string,
  scope: "local" | "global" | "others" = "local",
): Promise<void> {
  const claims = verifyJwt(token, selfhostConfig().jwtSecret);
  if (!claims) return;
  if (scope === "global")
    await db().unsafe(
      "update auth.refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null",
      [claims["sub"] as string],
    );
  else if (scope === "others")
    await db().unsafe(
      "update auth.refresh_tokens set revoked_at = now() where user_id = $1 and session_id <> $2 and revoked_at is null",
      [claims["sub"] as string, claims["session_id"] as string],
    );
  else
    await db().unsafe(
      "update auth.refresh_tokens set revoked_at = now() where session_id = $1 and revoked_at is null",
      [claims["session_id"] as string],
    );
}

export async function updateOwnUser(
  token: string,
  attrs: {
    password?: string | undefined;
    data?: Record<string, unknown> | undefined;
  },
): Promise<{ user: User | null; error: AuthError | null }> {
  const current = await userFromToken(token);
  if (!current.user) return current;
  if (attrs.password !== undefined) {
    if (String(attrs.password).length < 10)
      return {
        user: null,
        error: authError(
          "Password should be at least 10 characters.",
          "weak_password",
          422,
        ),
      };
    await db().unsafe(
      "update auth.users set encrypted_password = $2, updated_at = now() where id = $1",
      [current.user.id, await hashPassword(String(attrs.password))],
    );
  }
  if (attrs.data && typeof attrs.data === "object")
    await db().unsafe(
      "update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1",
      [current.user.id, JSON.stringify(attrs.data)],
    );
  const row = await userById(current.user.id);
  return { user: row ? toUser(row) : null, error: null };
}

// ---------- password recovery ----------
export function safeRedirect(redirectTo: string | undefined): string {
  const { appUrl } = selfhostConfig();
  try {
    const target = new URL(redirectTo || `${appUrl}/reset-password`, appUrl);
    if (target.origin === new URL(appUrl).origin)
      return target.href.split("#")[0]!;
  } catch {
    /* fall through */
  }
  return `${appUrl}/reset-password`;
}

/** Always resolves without telling whether the address exists. */
export async function sendRecovery(
  email: string,
  redirectTo: string | undefined,
  ip: string,
): Promise<void> {
  const address = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!address) return;
  if (!(await allowAttempt("selfhost-recover-email", address, 3, 3600))) return;
  if (!(await allowAttempt("selfhost-recover-ip", ip, 10, 3600))) return;
  const row = await userByEmail(address);
  if (!row || banned(row)) return;
  const token = randomToken(32);
  await db().unsafe(
    `insert into auth.one_time_tokens (token_hash, user_id, purpose, expires_at)
     values ($1, $2, 'recovery', now() + interval '1 hour')`,
    [sha256(token), row.id],
  );
  await db().unsafe(
    "update auth.users set recovery_sent_at = now() where id = $1",
    [row.id],
  );
  const { appUrl } = selfhostConfig();
  const link = `${appUrl}/api/selfhost/auth/verify?type=recovery&token=${encodeURIComponent(token)}&redirect_to=${encodeURIComponent(safeRedirect(redirectTo))}`;
  const sent = await sendMail({
    to: address,
    subject: "إعادة تعيين كلمة المرور — Reset your password",
    text: `لإعادة تعيين كلمة مرور EA-Hub افتح الرابط التالي خلال ساعة:\n${link}\n\nTo reset your EA-Hub password, open this link within one hour:\n${link}\n\nإن لم تطلب ذلك فتجاهل الرسالة. If you did not ask for this, ignore this email.`,
    html: `<div dir="rtl"><p>لإعادة تعيين كلمة مرور EA-Hub اضغط الرابط التالي خلال ساعة:</p><p><a href="${link}">إعادة تعيين كلمة المرور</a></p></div><div dir="ltr"><p>To reset your EA-Hub password, open this link within one hour:</p><p><a href="${link}">Reset password</a></p></div><p style="color:#666">إن لم تطلب ذلك فتجاهل الرسالة. If you did not ask for this, ignore this email.</p>`,
  });
  if (!sent)
    console.warn(
      "[selfhost] password recovery requested but no mail transport is configured (SMTP_HOST or RESEND_API_KEY); use `reset-admin-password` instead",
    );
}

/** Exchanges a recovery link for a session; returns the redirect URL with tokens in the fragment. */
export async function verifyRecovery(
  token: string,
  redirectTo: string | undefined,
): Promise<string> {
  const target = safeRedirect(redirectTo);
  const rows = await db().unsafe<{ user_id: string }[]>(
    `update auth.one_time_tokens set used_at = now()
     where token_hash = $1 and purpose = 'recovery' and used_at is null and expires_at > now()
     returning user_id`,
    [sha256(String(token ?? ""))],
  );
  const hit = rows[0];
  const row = hit ? await userById(hit.user_id) : undefined;
  if (!row || banned(row))
    return `${target}#error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent("Email link is invalid or has expired")}`;
  await db().unsafe(
    "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1",
    [row.id],
  );
  const s = await issueSession(row);
  const hash = new URLSearchParams({
    access_token: s.access_token,
    expires_at: String(s.expires_at),
    expires_in: String(s.expires_in),
    refresh_token: s.refresh_token,
    token_type: "bearer",
    type: "recovery",
  });
  return `${target}#${hash.toString()}`;
}

// ---------- admin API (service role only) ----------
export async function adminGetUserById(id: string) {
  const row = await userById(id);
  return row
    ? { data: { user: toUser(row) }, error: null }
    : {
        data: { user: null },
        error: authError("User not found", "user_not_found", 404),
      };
}

export async function adminListUsers(page = 1, perPage = 50) {
  const size = Math.min(Math.max(1, Math.floor(perPage)), 1000);
  const p = Math.max(1, Math.floor(page));
  const rows = await db().unsafe<UserRow[]>(
    `select ${USER_COLUMNS} from auth.users where deleted_at is null order by created_at, id limit $1 offset $2`,
    [size, (p - 1) * size],
  );
  const total = Number(
    (
      (
        await db().unsafe(
          "select count(*)::int as n from auth.users where deleted_at is null",
        )
      )[0] as unknown as { n: number }
    ).n,
  );
  const lastPage = Math.max(1, Math.ceil(total / size));
  return {
    data: {
      users: rows.map(toUser),
      aud: "authenticated",
      nextPage: p < lastPage ? p + 1 : null,
      lastPage,
      total,
    },
    error: null,
  };
}

type AdminAttrs = {
  email?: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  ban_duration?: string;
};

function banUntil(duration: string | undefined): Date | null | undefined {
  if (duration === undefined) return undefined;
  if (duration === "none") return null;
  const m = /^(\d+)h$/.exec(duration);
  if (!m) return undefined;
  return new Date(Date.now() + Number(m[1]) * 3600_000);
}

export async function adminCreateUser(attrs: AdminAttrs) {
  const email = String(attrs.email ?? "")
    .trim()
    .toLowerCase();
  if (!email)
    return {
      data: { user: null },
      error: authError("Email is required", "validation_failed", 422),
    };
  if (await userByEmail(email))
    return {
      data: { user: null },
      error: authError(
        "A user with this email address has already been registered",
        "email_exists",
        422,
      ),
    };
  const hash = attrs.password ? await hashPassword(attrs.password) : null;
  const rows = await db().unsafe<UserRow[]>(
    `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
     values ($1, $2, case when $3::boolean then now() end, $4::jsonb, $5::jsonb)
     returning ${USER_COLUMNS}`,
    [
      email,
      hash,
      attrs.email_confirm === true,
      JSON.stringify(attrs.user_metadata ?? {}),
      JSON.stringify(attrs.app_metadata ?? {}),
    ],
  );
  return { data: { user: toUser(rows[0]!) }, error: null };
}

export async function adminUpdateUserById(id: string, attrs: AdminAttrs) {
  const row = await userById(id);
  if (!row)
    return {
      data: { user: null },
      error: authError("User not found", "user_not_found", 404),
    };
  const ban = banUntil(attrs.ban_duration);
  await db().begin(async (tx) => {
    if (attrs.password !== undefined)
      await tx.unsafe(
        "update auth.users set encrypted_password = $2 where id = $1",
        [id, await hashPassword(attrs.password)],
      );
    if (attrs.email !== undefined)
      await tx.unsafe("update auth.users set email = $2 where id = $1", [
        id,
        attrs.email.trim().toLowerCase(),
      ]);
    if (attrs.email_confirm === true)
      await tx.unsafe(
        "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1",
        [id],
      );
    if (attrs.user_metadata)
      await tx.unsafe(
        "update auth.users set raw_user_meta_data = $2::jsonb where id = $1",
        [id, JSON.stringify(attrs.user_metadata)],
      );
    if (attrs.app_metadata)
      await tx.unsafe(
        "update auth.users set raw_app_meta_data = $2::jsonb where id = $1",
        [id, JSON.stringify(attrs.app_metadata)],
      );
    if (ban !== undefined) {
      await tx.unsafe("update auth.users set banned_until = $2 where id = $1", [
        id,
        ban,
      ]);
      if (ban)
        await tx.unsafe(
          "update auth.refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null",
          [id],
        );
    }
    await tx.unsafe("update auth.users set updated_at = now() where id = $1", [
      id,
    ]);
  });
  const updated = await userById(id);
  return { data: { user: updated ? toUser(updated) : null }, error: null };
}

export async function adminDeleteUser(id: string) {
  const rows = await db().unsafe(
    "delete from auth.users where id = $1 returning id",
    [id],
  );
  return rows.length
    ? { data: { user: null }, error: null }
    : {
        data: { user: null },
        error: authError("User not found", "user_not_found", 404),
      };
}
