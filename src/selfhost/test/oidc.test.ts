// @vitest-environment node
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSelfhostConfig } from "../server/config";
import {
  finish,
  identityFrom,
  SsoRefused,
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
    // Change the first MAC character to a different one (a fixed "x" is a no-op 1 in 64 times).
    const flipped = (mac![0] === "A" ? "B" : "A") + mac!.slice(1);
    expect(openPending(`${body}.${flipped}`)).toBeNull();
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
      emailVerified: true,
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

describe("access rules (identityFrom)", () => {
  const base = { email: "a@acme.example", email_verified: true };
  const s = (extra: Record<string, string>) =>
    oidcSettings({
      OIDC_ISSUER: ISSUER,
      OIDC_CLIENT_ID: "ea-hub",
      OIDC_CLIENT_SECRET: "x",
      OIDC_ADMIN_EMAILS: "a@acme.example",
      ...extra,
    })!;
  const refused = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(SsoRefused);
      expect((e as SsoRefused).code).toBe(code);
      return;
    }
    throw new Error("expected a refusal");
  };

  it("limits sign-in to the allowed domains", () => {
    const only = s({ OIDC_ALLOWED_DOMAINS: "acme.example, @acme.org" });
    expect(identityFrom(only, base, "/").email).toBe("a@acme.example");
    expect(
      identityFrom(only, { ...base, email: "b@ACME.org" }, "/").email,
    ).toBe("b@acme.org");
    refused(
      () => identityFrom(only, { ...base, email: "x@evil.example" }, "/"),
      "not_allowed",
    );
    refused(
      () => identityFrom(only, { ...base, email: "x@sub.acme.example" }, "/"),
      "not_allowed",
    );
  });

  it("treats Entra's xms_edov as a verified e-mail", () => {
    const who = identityFrom(
      s({}),
      { email: "a@acme.example", xms_edov: true },
      "/",
    );
    expect(who).toMatchObject({ emailVerified: true, isAdmin: true });
  });

  it("refuses unverified e-mails unless allowed AND domains are limited", () => {
    refused(
      () => identityFrom(s({}), { email: "a@acme.example" }, "/"),
      "unverified_email",
    );
    refused(
      () =>
        identityFrom(
          s({ OIDC_REQUIRE_VERIFIED_EMAIL: "false" }),
          { email: "a@acme.example" },
          "/",
        ),
      "unverified_email",
    );
    const relaxed = s({
      OIDC_REQUIRE_VERIFIED_EMAIL: "false",
      OIDC_ALLOWED_DOMAINS: "acme.example",
      OIDC_ADMIN_GROUPS: "g1",
    });
    // Accepted, but a listed admin e-mail does not count without verification…
    expect(
      identityFrom(relaxed, { email: "a@acme.example" }, "/"),
    ).toMatchObject({
      emailVerified: false,
      isAdmin: false,
    });
    // …only a group does.
    expect(
      identityFrom(relaxed, { email: "a@acme.example", groups: ["g1"] }, "/")
        .isAdmin,
    ).toBe(true);
  });

  it("needs a real e-mail address", () => {
    expect(() => identityFrom(s({}), { email_verified: true }, "/")).toThrow(
      /no e-mail/,
    );
    expect(() =>
      identityFrom(
        s({}),
        { email: "@acme.example", email_verified: true },
        "/",
      ),
    ).toThrow(/no e-mail/);
  });
});

describe("provider configuration safety", () => {
  it("refuses an http issuer (except localhost)", async () => {
    const insecure = oidcSettings({
      OIDC_ISSUER: "http://idp.example.com",
      OIDC_CLIENT_ID: "a",
      OIDC_CLIENT_SECRET: "b",
    })!;
    await expect(startUrl(insecure, "/")).rejects.toThrow(/https/);
  });

  it("allows an http issuer only with OIDC_ALLOW_HTTP_ISSUER=true (test labs)", async () => {
    const lab = oidcSettings({
      OIDC_ISSUER: "http://keycloak:8180/realms/lab",
      OIDC_CLIENT_ID: "a",
      OIDC_CLIENT_SECRET: "b",
    })!;
    await expect(startUrl(lab, "/")).rejects.toThrow(/https/);
    process.env["OIDC_ALLOW_HTTP_ISSUER"] = "true";
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            issuer: "http://keycloak:8180/realms/lab",
            authorization_endpoint: "http://keycloak:8180/realms/lab/auth",
            token_endpoint: "http://keycloak:8180/realms/lab/token",
            jwks_uri: "http://keycloak:8180/realms/lab/certs",
          }),
        ),
      );
      resetOidcCaches();
      const { url } = await startUrl(lab, "/");
      expect(url).toMatch(/^http:\/\/keycloak:8180\/realms\/lab\/auth\?/);
    } finally {
      delete process.env["OIDC_ALLOW_HTTP_ISSUER"];
    }
  });

  it("ignores keys of the wrong type for the token's algorithm", async () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ecJwk = { ...ec.publicKey.export({ format: "jwk" }), kid: "k1" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [ecJwk] })),
    );
    await expect(
      verifyIdToken(idToken(good()), settings, `${ISSUER}/certs`, "n-1", now),
    ).rejects.toThrow(/signing key/);
  });
});
