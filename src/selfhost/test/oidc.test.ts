// @vitest-environment node
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSelfhostConfig } from "../server/config";
import {
  finish,
  openPending,
  oidcSettings,
  readCookie,
  resetOidcCaches,
  sealPending,
  startUrl,
  verifyIdToken,
  type OidcSettings,
} from "../server/oidc";

const ISSUER = "https://idp.example.com/realms/acme";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "k1",
  use: "sig",
  alg: "RS256",
};
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(
  claims: Record<string, unknown>,
  opts: { alg?: string; kid?: string; key?: typeof privateKey } = {},
) {
  const head = b64({
    alg: opts.alg ?? "RS256",
    kid: opts.kid ?? "k1",
    typ: "JWT",
  });
  const body = b64(claims);
  const sig =
    opts.alg === "none"
      ? ""
      : opts.alg === "HS256"
        ? createHmac("sha256", "secret")
            .update(`${head}.${body}`)
            .digest("base64url")
        : sign(
            "sha256",
            Buffer.from(`${head}.${body}`),
            opts.key ?? privateKey,
          ).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const settings: OidcSettings = oidcSettings({
  OIDC_ISSUER: `${ISSUER}/`,
  OIDC_CLIENT_ID: "ea-hub",
  OIDC_CLIENT_SECRET: "client-secret",
  OIDC_ADMIN_EMAILS: "Boss@Acme.example",
  OIDC_ADMIN_GROUPS: "ea-admins",
})!;

const now = Math.floor(Date.now() / 1000);
const good = (extra: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  aud: "ea-hub",
  sub: "user-1",
  exp: now + 300,
  iat: now,
  nonce: "n-1",
  email: "someone@acme.example",
  email_verified: true,
  ...extra,
});

let lastTokenRequest: { headers: Headers; body: URLSearchParams } | undefined;
let nextIdToken = "";

beforeEach(() => {
  process.env["APP_ENCRYPTION_KEY"] =
    "test-root-secret-for-oidc-0123456789abcdef";
  process.env["DATABASE_URL"] = "postgres://unused/db";
  process.env["APP_URL"] = "https://hub.example.com";
  resetSelfhostConfig();
  resetOidcCaches();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${ISSUER}/.well-known/openid-configuration`)
        return Response.json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/auth`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/certs`,
        });
      if (url === `${ISSUER}/certs`) return Response.json({ keys: [jwk] });
      if (url === `${ISSUER}/token`) {
        lastTokenRequest = {
          headers: new Headers(init?.headers),
          body: new URLSearchParams(String(init?.body)),
        };
        return Response.json({ id_token: nextIdToken, access_token: "x" });
      }
      return new Response("not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OIDC settings", () => {
  it("is off without issuer, client id and secret", () => {
    expect(
      oidcSettings({ OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: "x" }),
    ).toBeNull();
  });
  it("normalises issuer and admin e-mails", () => {
    expect(settings.issuer).toBe(ISSUER);
    expect(settings.adminEmails).toEqual(["boss@acme.example"]);
    expect(settings.requireVerifiedEmail).toBe(true);
    expect(settings.autoCreate).toBe(false);
  });
});

describe("ID token verification", () => {
  const verify = (t: string, nonce = "n-1") =>
    verifyIdToken(t, settings, `${ISSUER}/certs`, nonce, now);

  it("accepts a valid token", async () => {
    await expect(verify(idToken(good()))).resolves.toMatchObject({
      sub: "user-1",
    });
  });
  it("rejects alg none and HMAC algorithms", async () => {
    await expect(verify(idToken(good(), { alg: "none" }))).rejects.toThrow(
      /not allowed/,
    );
    await expect(verify(idToken(good(), { alg: "HS256" }))).rejects.toThrow(
      /not allowed/,
    );
  });
  it("rejects a token signed by another key", async () => {
    await expect(
      verify(idToken(good(), { key: other.privateKey })),
    ).rejects.toThrow(/signature/);
  });
  it("rejects an unknown key id", async () => {
    await expect(verify(idToken(good(), { kid: "nope" }))).rejects.toThrow(
      /signing key/,
    );
  });
  it("checks issuer, audience, azp, expiry and nonce", async () => {
    await expect(
      verify(idToken(good({ iss: "https://evil.example" }))),
    ).rejects.toThrow(/issuer/);
    await expect(verify(idToken(good({ aud: "other-app" })))).rejects.toThrow(
      /audience/,
    );
    await expect(
      verify(idToken(good({ aud: ["ea-hub", "other"], azp: "other" }))),
    ).rejects.toThrow(/authorized party/);
    await expect(verify(idToken(good({ exp: now - 600 })))).rejects.toThrow(
      /expired/,
    );
    await expect(verify(idToken(good()), "n-2")).rejects.toThrow(/nonce/);
    await expect(verify(idToken(good({ nonce: undefined })))).rejects.toThrow(
      /nonce/,
    );
  });
});

describe("state cookie", () => {
  it("round-trips and rejects tampering or expiry", () => {
    const sealed = sealPending({
      state: "s",
      nonce: "n",
      verifier: "v",
      redirect: "https://hub.example.com/admin",
      exp: Date.now() + 60_000,
    });
    expect(openPending(sealed)?.state).toBe("s");
    const [body, mac] = sealed.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        state: "s",
        nonce: "n",
        verifier: "v",
        redirect: "https://evil",
        exp: Date.now() + 60_000,
      }),
    ).toString("base64url");
    expect(openPending(`${forged}.${mac}`)).toBeNull();
    expect(openPending(`${body}.x${mac!.slice(1)}`)).toBeNull();
    expect(
      openPending(
        sealPending({
          state: "s",
          nonce: "n",
          verifier: "v",
          redirect: "",
          exp: 1,
        }),
      ),
    ).toBeNull();
    expect(readCookie("a=1; eahub_oidc=abc.def; b=2", "eahub_oidc")).toBe(
      "abc.def",
    );
  });
});

describe("authorization code flow", () => {
  async function begin() {
    const { url, cookie } = await startUrl(
      settings,
      "https://hub.example.com/admin",
    );
    const u = new URL(url);
    const value = cookie.split(";")[0]!.split("=").slice(1).join("=");
    const pending = openPending(value)!;
    return { u, cookie, value, pending };
  }

  it("redirects with PKCE, state and nonce, and a secure HttpOnly cookie", async () => {
    const { u, cookie, pending } = await begin();
    expect(u.origin + u.pathname).toBe(`${ISSUER}/auth`);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://hub.example.com/api/selfhost/auth/oidc/callback",
    );
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(pending.state);
    expect(u.searchParams.get("nonce")).toBe(pending.nonce);
    expect(cookie).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  });

  it("exchanges the code and returns the verified identity", async () => {
    const { value, pending } = await begin();
    nextIdToken = idToken(
      good({
        nonce: pending.nonce,
        groups: ["staff", "ea-admins"],
        name: "Sam",
      }),
    );
    const cb = new URL(
      `https://hub.example.com/api/selfhost/auth/oidc/callback?code=abc&state=${pending.state}`,
    );
    const who = await finish(settings, cb, value);
    expect(who).toEqual({
      email: "someone@acme.example",
      name: "Sam",
      isAdmin: true,
      redirect: "https://hub.example.com/admin",
    });
    expect(lastTokenRequest?.body.get("code_verifier")).toBe(pending.verifier);
    expect(lastTokenRequest?.body.get("grant_type")).toBe("authorization_code");
    expect(lastTokenRequest?.headers.get("authorization")).toMatch(/^Basic /);
  });

  it("grants admin by listed e-mail, and not otherwise", async () => {
    const a = await begin();
    nextIdToken = idToken(
      good({ nonce: a.pending.nonce, email: "BOSS@acme.example" }),
    );
    const who = await finish(
      settings,
      new URL(`https://h/cb?code=c&state=${a.pending.state}`),
      a.value,
    );
    expect(who.isAdmin).toBe(true);
    const b = await begin();
    nextIdToken = idToken(good({ nonce: b.pending.nonce }));
    const plain = await finish(
      settings,
      new URL(`https://h/cb?code=c&state=${b.pending.state}`),
      b.value,
    );
    expect(plain.isAdmin).toBe(false);
  });

  it("refuses a wrong state, a missing cookie and an unverified e-mail", async () => {
    const { value, pending } = await begin();
    nextIdToken = idToken(good({ nonce: pending.nonce }));
    await expect(
      finish(settings, new URL("https://h/cb?code=c&state=wrong"), value),
    ).rejects.toThrow(/state/);
    await expect(
      finish(
        settings,
        new URL(`https://h/cb?code=c&state=${pending.state}`),
        undefined,
      ),
    ).rejects.toThrow(/cookie/);
    nextIdToken = idToken(
      good({ nonce: pending.nonce, email_verified: false }),
    );
    await expect(
      finish(
        settings,
        new URL(`https://h/cb?code=c&state=${pending.state}`),
        value,
      ),
    ).rejects.toThrow(/verified/);
  });

  it("does not accept the ID token of another login (nonce binding)", async () => {
    const first = await begin();
    const second = await begin();
    nextIdToken = idToken(good({ nonce: first.pending.nonce }));
    await expect(
      finish(
        settings,
        new URL(`https://h/cb?code=c&state=${second.pending.state}`),
        second.value,
      ),
    ).rejects.toThrow(/nonce/);
  });
});
