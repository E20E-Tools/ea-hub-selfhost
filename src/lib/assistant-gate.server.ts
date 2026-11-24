// Server-only: signs and verifies the assistant gate tokens. The HMAC key is a
// subkey derived (HKDF, label "assistant-gate-v1") from the server-only service key,
// so tokens cannot be forged from the browser and the raw key is never used for signing.
import { deriveSigningSecret, deriveSigningSecrets } from "./server-keys.server";

export const GATE_KEY_LABEL = "assistant-gate-v1";
/** Signs new tokens with the current root. */
export function gateSecret(): Promise<string> {
  return deriveSigningSecret(GATE_KEY_LABEL);
}
/** Verifies with the current and previous roots, so passes survive the key switch-over. */
export function gateSecrets(): Promise<string[]> {
  return deriveSigningSecrets(GATE_KEY_LABEL);
}

/** One secret, or several tried in order (current first). */
export type VerifySecrets = string | readonly string[];
const secretList = (secrets: VerifySecrets) => (typeof secrets === "string" ? [secrets] : secrets);

export type ChallengePayload = { kind: "challenge"; answer: number; exp: number };
export type AccessPayload = {
  kind: "access";
  name: string;
  email: string;
  exp: number;
  visitorId?: string;
};

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign<T extends object>(secret: string, payload: T): Promise<string> {
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${await hmac(secret, body)}`;
}

async function verify<T>(secrets: VerifySecrets, token: string, now: number): Promise<T | null> {
  for (const secret of secretList(secrets)) {
    const payload = await verifyOne<T>(secret, token, now);
    if (payload) return payload;
  }
  return null;
}

async function verifyOne<T>(secret: string, token: string, now: number): Promise<T | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmac(secret, body);
  if (signature.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i++)
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(fromBase64Url(body)) as T & { exp?: number };
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function randomDigit(): number {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return ((bytes[0] ?? 0) % 9) + 1;
}

// The challenge answer is AES-GCM encrypted (HKDF subkey "assistant-challenge-v1"
// derived from the signing secret), then the ciphertext is HMAC-signed, so
// decoding the token never reveals the answer.
export const CHALLENGE_KEY_LABEL = "assistant-challenge-v1";
const b64u = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const unb64u = (value: string) => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};
async function challengeKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(CHALLENGE_KEY_LABEL),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
type SealedChallenge = { kind: "challenge"; iv: string; ct: string; exp: number };

/** Issues a signed math question the visitor must solve to prove they are human. */
export async function issueChallenge(
  secret: string,
  now = Date.now(),
): Promise<{ a: number; b: number; token: string }> {
  const a = randomDigit();
  const b = randomDigit();
  const exp = now + CHALLENGE_TTL_MS;
  const plain: ChallengePayload = { kind: "challenge", answer: a + b, exp };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await challengeKey(secret),
      new TextEncoder().encode(JSON.stringify(plain)),
    ),
  );
  const token = await sign<SealedChallenge>(secret, {
    kind: "challenge",
    iv: b64u(iv),
    ct: b64u(ct),
    exp,
  });
  return { a, b, token };
}

export async function verifyChallenge(
  secrets: VerifySecrets,
  token: string,
  answer: string,
  now = Date.now(),
): Promise<boolean> {
  for (const secret of secretList(secrets)) {
    const sealed = await verifyOne<SealedChallenge>(secret, token, now);
    if (!sealed || sealed.kind !== "challenge") continue;
    try {
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64u(sealed.iv) },
          await challengeKey(secret),
          unb64u(sealed.ct),
        ),
      );
      const payload = JSON.parse(new TextDecoder().decode(plain)) as ChallengePayload;
      if (payload.kind !== "challenge" || payload.exp < now) return false;
      return Number(answer.trim()) === payload.answer;
    } catch {
      return false;
    }
  }
  return false;
}

/** True when the token carries a valid signature (any root), whatever the answer. */
export async function challengeSigned(
  secrets: VerifySecrets,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const sealed = await verify<SealedChallenge>(secrets, token, now);
  return Boolean(sealed && sealed.kind === "challenge");
}

/** After a verified registration, grants chat access for 24 hours. */
export async function issueAccessToken(
  secret: string,
  name: string,
  email: string,
  now = Date.now(),
  visitorId?: string,
): Promise<{ token: string; exp: number }> {
  const exp = now + ACCESS_TTL_MS;
  const token = await sign<AccessPayload>(secret, {
    kind: "access",
    name,
    email,
    exp,
    ...(visitorId ? { visitorId } : {}),
  });
  return { token, exp };
}

export async function verifyAccessToken(
  secret: VerifySecrets,
  token: string,
  now = Date.now(),
): Promise<AccessPayload | null> {
  const payload = await verify<AccessPayload>(secret, token, now);
  if (!payload || payload.kind !== "access") return null;
  return payload;
}

/** A separate signed browser identifier scopes registration without using the corporate IP. */
export async function registrationBrowser(create: boolean): Promise<string | null> {
  const { getCookie, setCookie } = await import("@tanstack/react-start/server");
  const secure = process.env["NODE_ENV"] === "production";
  const name = secure ? "__Host-archy-registration" : "archy-registration";
  const cookie = getCookie(name);
  const secrets = await gateSecrets();
  if (cookie && cookie.length < 1024) {
    const payload = await verify<{kind:string; id:string}>(secrets, cookie, Date.now());
    if (payload?.kind === "registration-browser" && typeof payload.id === "string") return payload.id;
  }
  if (!create) return null;
  const id = crypto.randomUUID();
  const maxAge = 30 * 86400;
  const token = await sign(secrets[0]!, {kind:"registration-browser", id, exp:Date.now()+maxAge*1000});
  setCookie(name,token,{path:"/",secure,httpOnly:true,sameSite:"lax",maxAge});
  return id;
}
