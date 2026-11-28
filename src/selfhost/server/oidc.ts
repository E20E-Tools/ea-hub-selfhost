import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
  constants,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";
import { selfhostConfig } from "./config";
import { hmac, safeEqual } from "./crypto";

/**
 * OpenID Connect single sign-on (authorization code flow with PKCE), for Microsoft Entra ID,
 * Keycloak, Okta, Auth0, Google Workspace, Authentik and other OIDC providers.
 *
 * Off unless OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are set. Security rules:
 *  - state, nonce and PKCE (S256) are bound to the browser in a signed, HttpOnly cookie
 *  - the ID token signature is checked against the provider's JWKS (asymmetric algorithms only),
 *    as are iss, aud (+ azp), exp, iat and nonce
 *  - the redirect URI is fixed to APP_URL; post-login redirects stay on APP_URL's origin
 *  - accounts are linked by e-mail only when the provider says the e-mail is verified
 *    (see identityFrom); OIDC_ALLOWED_DOMAINS limits sign-in to your own domains
 *  - the admin role is granted only to e-mails / groups listed in OIDC_ADMIN_EMAILS /
 *    OIDC_ADMIN_GROUPS; other people may sign in only if they already have an account
 *    (or OIDC_AUTO_CREATE=true together with OIDC_ALLOWED_DOMAINS)
 */

export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  label: string;
  adminEmails: string[];
  adminGroups: string[];
  groupsClaim: string;
  autoCreate: boolean;
  requireVerifiedEmail: boolean;
  /** Lower-case e-mail domains allowed to sign in; empty = any (see emailAllowed). */
  allowedDomains: string[];
};

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function oidcSettings(
  env: NodeJS.ProcessEnv = process.env,
): OidcSettings | null {
  const issuer = env["OIDC_ISSUER"]?.trim().replace(/\/+$/, "");
  const clientId = env["OIDC_CLIENT_ID"]?.trim();
  const clientSecret = env["OIDC_CLIENT_SECRET"]?.trim();
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    scopes: env["OIDC_SCOPES"]?.trim() || "openid email profile",
    label: env["OIDC_BUTTON_LABEL"]?.trim() || "Single sign-on",
    adminEmails: list(env["OIDC_ADMIN_EMAILS"]).map((e) => e.toLowerCase()),
    adminGroups: list(env["OIDC_ADMIN_GROUPS"]),
    groupsClaim: env["OIDC_GROUPS_CLAIM"]?.trim() || "groups",
    autoCreate: env["OIDC_AUTO_CREATE"]?.trim() === "true",
    requireVerifiedEmail:
      env["OIDC_REQUIRE_VERIFIED_EMAIL"]?.trim() !== "false",
    allowedDomains: list(env["OIDC_ALLOWED_DOMAINS"]).map((d) =>
      d.toLowerCase().replace(/^@/, ""),
    ),
  };
}

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

/** https only, except a provider on this machine (development and tests). */
function secureUrl(u: string): boolean {
  return u.startsWith("https://") || LOCAL.test(u);
}

// ---------- discovery and keys ----------

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

let discovery: { at: number; issuer: string; doc: Discovery } | undefined;
let jwks: { at: number; uri: string; keys: JsonWebKey[] } | undefined;

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

export async function discover(s: OidcSettings): Promise<Discovery> {
  if (
    discovery &&
    discovery.issuer === s.issuer &&
    Date.now() - discovery.at < 3_600_000
  )
    return discovery.doc;
  if (!secureUrl(s.issuer)) throw new Error("OIDC_ISSUER must be an https URL");
  const doc = (await getJson(
    `${s.issuer}/.well-known/openid-configuration`,
  )) as Discovery;
  if (doc.issuer?.replace(/\/+$/, "") !== s.issuer)
    throw new Error("OIDC discovery issuer does not match OIDC_ISSUER");
  for (const k of [
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
  ] as const)
    if (typeof doc[k] !== "string" || !secureUrl(doc[k]))
      throw new Error(`OIDC discovery: ${k} must be an https URL`);
  discovery = { at: Date.now(), issuer: s.issuer, doc };
  return doc;
}

const KTY = { rsa: "RSA", pss: "RSA", ec: "EC" } as const;

async function keyFor(
  uri: string,
  kid: string | undefined,
  alg: string,
): Promise<KeyObject> {
  const kty = KTY[ALGS[alg]!.kind];
  const pick = (keys: JsonWebKey[]) =>
    keys.filter(
      (k) =>
        k.kty === kty &&
        (k as { use?: string }).use !== "enc" &&
        (kid ? (k as { kid?: string }).kid === kid : true) &&
        (!(k as { alg?: string }).alg || (k as { alg?: string }).alg === alg),
    );
  let found =
    jwks && jwks.uri === uri && Date.now() - jwks.at < 3_600_000
      ? pick(jwks.keys)
      : [];
  // Unknown key id: the provider may have rotated keys; refetch at most once a minute.
  if (
    !found.length &&
    (!jwks || jwks.uri !== uri || Date.now() - jwks.at > 60_000)
  ) {
    const doc = (await getJson(uri)) as { keys?: JsonWebKey[] };
    jwks = {
      at: Date.now(),
      uri,
      keys: Array.isArray(doc.keys) ? doc.keys : [],
    };
    found = pick(jwks.keys);
  }
  if (found.length !== 1)
    throw new Error("no unique signing key for the ID token");
  return createPublicKey({ key: found[0]!, format: "jwk" });
}

// ---------- ID token ----------

const ALGS: Record<string, { hash: string; kind: "rsa" | "pss" | "ec" }> = {
  RS256: { hash: "sha256", kind: "rsa" },
  RS384: { hash: "sha384", kind: "rsa" },
  RS512: { hash: "sha512", kind: "rsa" },
  PS256: { hash: "sha256", kind: "pss" },
  PS384: { hash: "sha384", kind: "pss" },
  PS512: { hash: "sha512", kind: "pss" },
  ES256: { hash: "sha256", kind: "ec" },
  ES384: { hash: "sha384", kind: "ec" },
  ES512: { hash: "sha512", kind: "ec" },
};

const b64url = (s: string) => Buffer.from(s, "base64url");

export type IdClaims = Record<string, unknown>;

export async function verifyIdToken(
  token: string,
  s: OidcSettings,
  jwksUri: string,
  nonce: string,
  now = Math.floor(Date.now() / 1000),
): Promise<IdClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed ID token");
  const header = JSON.parse(b64url(parts[0]!).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  const alg = ALGS[header.alg ?? ""];
  if (!alg) throw new Error(`ID token algorithm not allowed: ${header.alg}`);
  const key = await keyFor(jwksUri, header.kid, header.alg!);
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = b64url(parts[2]!);
  const ok = verifySignature(
    alg.hash,
    signed,
    alg.kind === "pss"
      ? {
          key,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
        }
      : alg.kind === "ec"
        ? { key, dsaEncoding: "ieee-p1363" }
        : key,
    signature,
  );
  if (!ok) throw new Error("ID token signature is invalid");
  const claims = JSON.parse(b64url(parts[1]!).toString("utf8")) as IdClaims;
  const iss = String(claims["iss"] ?? "").replace(/\/+$/, "");
  if (iss !== s.issuer) throw new Error("ID token issuer mismatch");
  const aud = claims["aud"];
  const auds = Array.isArray(aud) ? aud : [aud];
  if (!auds.includes(s.clientId)) throw new Error("ID token audience mismatch");
  if (auds.length > 1 && claims["azp"] !== s.clientId)
    throw new Error("ID token authorized party mismatch");
  const skew = 120;
  if (typeof claims["exp"] !== "number" || claims["exp"] + skew < now)
    throw new Error("ID token expired");
  if (typeof claims["iat"] === "number" && claims["iat"] - skew > now)
    throw new Error("ID token issued in the future");
  if (typeof claims["nonce"] !== "string" || !safeEqual(claims["nonce"], nonce))
    throw new Error("ID token nonce mismatch");
  return claims;
}

// ---------- the signed browser cookie that carries state, nonce and the PKCE verifier ----------

export const COOKIE = "eahub_oidc";
type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  exp: number;
};

function cookieKey(): Buffer {
  return createHash("sha256")
    .update(selfhostConfig().storageSigningKey)
    .update("oidc-cookie")
    .digest();
}

export function sealPending(p: Pending): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${hmac(cookieKey(), body)}`;
}

export function openPending(
  value: string | undefined,
  now = Date.now(),
): Pending | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac || !safeEqual(mac, hmac(cookieKey(), body))) return null;
  try {
    const p = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Pending;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}

export function readCookie(
  header: string | null,
  name: string,
): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function cookieHeader(value: string, maxAge: number): string {
  const secure = selfhostConfig().appUrl.startsWith("https://")
    ? "; Secure"
    : "";
  return `${COOKIE}=${value}; Path=/api/selfhost/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function redirectUri(): string {
  return `${selfhostConfig().appUrl}/api/selfhost/auth/oidc/callback`;
}

/** Step 1: send the browser to the provider. */
export async function startUrl(
  s: OidcSettings,
  redirect: string,
): Promise<{ url: string; cookie: string }> {
  const doc = await discover(s);
  const pending: Pending = {
    state: token(),
    nonce: token(),
    verifier: token(48),
    redirect,
    exp: Date.now() + 10 * 60_000,
  };
  const challenge = createHash("sha256")
    .update(pending.verifier)
    .digest("base64url");
  const url = new URL(doc.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: s.clientId,
    redirect_uri: redirectUri(),
    scope: s.scopes,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.href, cookie: cookieHeader(sealPending(pending), 600) };
}

export type SsoIdentity = {
  email: string;
  name: string | undefined;
  emailVerified: boolean;
  isAdmin: boolean;
  redirect: string;
};

/** Step 2: the provider sent the browser back with a code. */
export async function finish(
  s: OidcSettings,
  url: URL,
  cookie: string | undefined,
): Promise<SsoIdentity> {
  const pending = openPending(cookie);
  if (!pending) throw new Error("sign-in session expired or cookie missing");
  const state = url.searchParams.get("state") ?? "";
  if (!safeEqual(state, pending.state)) throw new Error("state mismatch");
  const providerError = url.searchParams.get("error");
  if (providerError) throw new Error(`provider returned ${providerError}`);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("no authorization code");

  const doc = await discover(s);
  const basic = Buffer.from(
    `${encodeURIComponent(s.clientId)}:${encodeURIComponent(s.clientSecret)}`,
  ).toString("base64");
  const tokens = (await getJson(doc.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
      client_id: s.clientId,
    }),
  })) as { id_token?: string };
  if (!tokens.id_token) throw new Error("provider returned no ID token");
  const claims = await verifyIdToken(
    tokens.id_token,
    s,
    doc.jwks_uri,
    pending.nonce,
  );

  return identityFrom(s, claims, pending.redirect);
}

/** Refusals the sign-in page explains to the user (other failures show a generic message). */
export class SsoRefused extends Error {
  constructor(readonly code: "not_allowed" | "unverified_email") {
    super(code);
  }
}

const yes = (v: unknown) => v === true || v === "true";

/**
 * Turns verified ID token claims into an identity and applies the access rules:
 *  - the e-mail counts as verified when email_verified is true, or (Microsoft Entra ID)
 *    xms_edov is true: the e-mail's domain is verified by the tenant
 *  - OIDC_ALLOWED_DOMAINS, when set, limits who may sign in at all
 *  - an unverified e-mail is accepted only with OIDC_REQUIRE_VERIFIED_EMAIL=false AND an
 *    allowed-domain list; it can never match OIDC_ADMIN_EMAILS (only groups) and ssoSignIn
 *    never links it to an existing account
 */
export function identityFrom(
  s: OidcSettings,
  claims: IdClaims,
  redirect: string,
): SsoIdentity {
  const email =
    typeof claims["email"] === "string"
      ? claims["email"].trim().toLowerCase()
      : "";
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1)
    throw new Error("the provider sent no e-mail address");
  const domain = email.slice(at + 1);
  if (s.allowedDomains.length && !s.allowedDomains.includes(domain))
    throw new SsoRefused("not_allowed");
  const emailVerified =
    yes(claims["email_verified"]) || yes(claims["xms_edov"]);
  if (!emailVerified && (s.requireVerifiedEmail || !s.allowedDomains.length))
    throw new SsoRefused("unverified_email");
  const raw = claims[s.groupsClaim];
  const groups = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? [raw]
      : [];
  const isAdmin =
    (emailVerified && s.adminEmails.includes(email)) ||
    groups.some((g) => s.adminGroups.includes(g));
  const name = typeof claims["name"] === "string" ? claims["name"] : undefined;
  return { email, name, emailVerified, isAdmin, redirect };
}

/** Test hook. */
export function resetOidcCaches(): void {
  discovery = undefined;
  jwks = undefined;
}
