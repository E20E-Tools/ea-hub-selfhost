import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";

// ---------- passwords ----------
// Format: scrypt$N$r$p$<salt b64>$<hash b64>. scripts/selfhost/lib.mjs writes the same format.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(
      password.normalize("NFKC"),
      salt,
      KEYLEN,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const DUMMY = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEYLEN).toString("base64")}`;

/** Constant work whether or not the user exists. */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parts = (stored || DUMMY).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash!, "base64");
  const actual = await scrypt(
    password,
    Buffer.from(salt!, "base64"),
    Number(n),
    Number(r),
    Number(p),
  );
  return (
    Boolean(stored) &&
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

// ---------- tokens ----------
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------- JWT (HS256) ----------
const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

export function signJwt(
  payload: Record<string, unknown>,
  secret: Buffer,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(
  token: string,
  secret: Buffer,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  try {
    const head = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8"),
    ) as { alg?: string };
    if (head.alg !== "HS256") return null;
    const expected = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return null;
    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims["exp"] !== "number" || claims["exp"] <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

export function hmac(secret: Buffer, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
