// Server-only key derivation and at-rest encryption for saved secrets.
// Subkeys are derived with HKDF from a root secret, each with its own label, so the raw
// root is never used directly for signing or encryption. The root is the dedicated
// APP_ENCRYPTION_KEY when set; otherwise (and as the previous key during the switch-over)
// the server-only service key.

const encoder = new TextEncoder();
const PREFIX = "enc:v1:";

/** Root secrets, current first. With APP_ENCRYPTION_KEY set, the service key is the previous one. */
export function rootSecrets(): string[] {
  const dedicated = process.env["APP_ENCRYPTION_KEY"]?.trim();
  const legacy = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const roots = [dedicated, legacy].filter((v): v is string => Boolean(v));
  if (roots.length === 0) throw new Error("Server secret not configured");
  return [...new Set(roots)];
}

function rootSecret(): string {
  return rootSecrets()[0]!;
}

/** Derives 32 bytes for a given purpose label (HKDF-SHA256). */
export async function deriveSubkey(
  label: string,
  secret = rootSecret(),
): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("e20e-hub"),
      info: encoder.encode(label),
    },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** Hex form of a derived subkey, for HMAC-based token signing. */
export async function deriveSigningSecret(
  label: string,
  secret?: string,
): Promise<string> {
  const bytes = await deriveSubkey(label, secret);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Signing secrets for verification, current first: tokens from either root stay valid. */
export async function deriveSigningSecrets(label: string): Promise<string[]> {
  return Promise.all(
    rootSecrets().map((root) => deriveSigningSecret(label, root)),
  );
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function aesKey(secret?: string) {
  return crypto.subtle.importKey(
    "raw",
    await deriveSubkey("settings-encryption-v1", secret),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export const isEncrypted = (value: string | null | undefined) =>
  typeof value === "string" && value.startsWith(PREFIX);

export async function encryptSecret(
  plain: string,
  secret?: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(secret),
      encoder.encode(plain),
    ),
  );
  return `${PREFIX}${toB64(iv)}:${toB64(cipher)}`;
}

async function decryptWith(
  iv: string,
  cipher: string,
  secret?: string,
): Promise<string | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) },
      await aesKey(secret),
      fromB64(cipher),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/**
 * Decrypts a stored value, trying the current root then the previous one. `rewrap` is true
 * when the caller should store it again with encryptSecret: legacy plain text, or a value
 * that only the previous key could open.
 */
export async function openSecret(
  stored: string | null | undefined,
  secrets?: readonly string[],
): Promise<{ plain: string; rewrap: boolean }> {
  if (!stored) return { plain: "", rewrap: false };
  if (!isEncrypted(stored)) return { plain: stored, rewrap: true };
  const [iv, cipher] = stored.slice(PREFIX.length).split(":");
  if (!iv || !cipher) return { plain: "", rewrap: false };
  const roots = secrets ?? rootSecrets();
  for (let i = 0; i < roots.length; i++) {
    const plain = await decryptWith(iv, cipher, roots[i]);
    if (plain !== null) return { plain, rewrap: i > 0 };
  }
  return { plain: "", rewrap: false };
}

/** Decrypts a stored value; legacy plain-text values are returned unchanged. */
export async function decryptSecret(
  stored: string | null | undefined,
  secret?: string,
): Promise<string> {
  return (await openSecret(stored, secret === undefined ? undefined : [secret]))
    .plain;
}
