import { deriveSigningSecret } from "./server-keys.server";
const enc = new TextEncoder();
async function key() {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(await deriveSigningSecret("retention-preview-v1")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export async function signRetentionPreview(
  actor: string,
  type: string,
  revision: number,
  ids: string[],
  now = Date.now(),
) {
  const body = JSON.stringify({
    actor,
    type,
    revision,
    ids,
    expires: now + 10 * 60000,
  });
  return {
    body,
    signature: encode(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", await key(), enc.encode(body)),
      ),
    ),
  };
}
export async function verifyRetentionPreview(
  token: { body: string; signature: string },
  actor: string,
  type: string,
  revision: number,
  ids: string[],
  now = Date.now(),
) {
  try {
    const bytes = Uint8Array.from(atob(token.signature), (c) =>
      c.charCodeAt(0),
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key(),
        bytes,
        enc.encode(token.body),
      ))
    )
      return false;
    const p = JSON.parse(token.body);
    return (
      p.actor === actor &&
      p.type === type &&
      p.revision === revision &&
      p.expires > now &&
      JSON.stringify(p.ids) === JSON.stringify(ids)
    );
  } catch {
    return false;
  }
}
