#!/usr/bin/env node
// Public-key encryption for EA-Hub backups (runs in the app image: no extra tools needed).
//
//   node selfhost/scripts/backup-crypt.mjs keygen
//        prints a key pair: keep the PRIVATE key offline; configure only the PUBLIC key
//   node selfhost/scripts/backup-crypt.mjs encrypt-dir <backups-dir>
//        encrypts every finished backup folder (database.dump, storage.tar.gz -> *.enc) with
//        BACKUP_PUBLIC_KEY and removes the plain files
//   node selfhost/scripts/backup-crypt.mjs decrypt-dir <backup-folder>
//        restores the plain files with BACKUP_PRIVATE_KEY (before backup.sh restore)
//   node selfhost/scripts/backup-crypt.mjs watch <backups-dir>
//        encrypt-dir every minute (Docker Compose)
//
// Format (EAHUBBK1): magic | ephemeral X25519 public key (32) | nonce prefix (4) | chunks.
// Key = HKDF-SHA256(X25519(ephemeral, recipient), salt = ephemeral||recipient). Each chunk:
// length (u32) | AES-256-GCM ciphertext | tag (16); nonce = prefix || chunk index (u64);
// the AAD marks the last chunk, so truncating or reordering the file is detected.
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const MAGIC = Buffer.from("EAHUBBK1");
const CHUNK = 1024 * 1024;
const PLAIN = ["database.dump", "storage.tar.gz"];

const b64urlToBuf = (s) => Buffer.from(s.trim(), "base64url");
// DER prefixes for raw X25519 keys (RFC 8410).
const SPKI = Buffer.from("302a300506032b656e032100", "hex");
const PKCS8 = Buffer.from("302e020100300506032b656e04220420", "hex");
const pubFromRaw = (raw) =>
  createPublicKey({
    key: Buffer.concat([SPKI, raw]),
    format: "der",
    type: "spki",
  });

export function publicKeyFrom(text) {
  const raw = b64urlToBuf(text.replace(/^ea-hub-backup-pub:/, ""));
  if (raw.length !== 32) throw new Error("invalid public key");
  return { key: pubFromRaw(raw), raw };
}
export function privateKeyFrom(text) {
  const raw = b64urlToBuf(text.replace(/^ea-hub-backup-key:/, ""));
  if (raw.length !== 32) throw new Error("invalid private key");
  return createPrivateKey({
    key: Buffer.concat([PKCS8, raw]),
    format: "der",
    type: "pkcs8",
  });
}

export function keygen() {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const pub = publicKey.export({ format: "jwk" }).x;
  const priv = privateKey.export({ format: "jwk" }).d;
  return {
    publicKey: `ea-hub-backup-pub:${pub}`,
    privateKey: `ea-hub-backup-key:${priv}`,
  };
}

function deriveKey(shared, ephRaw, recipientRaw) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      Buffer.concat([ephRaw, recipientRaw]),
      "ea-hub-backup v1",
      32,
    ),
  );
}

function nonce(prefix, index) {
  const n = Buffer.alloc(12);
  prefix.copy(n, 0);
  n.writeBigUInt64BE(BigInt(index), 4);
  return n;
}
const aad = (index, last) => {
  const a = Buffer.alloc(9);
  a.writeBigUInt64BE(BigInt(index), 0);
  a[8] = last ? 1 : 0;
  return a;
};

async function* chunks(file, size) {
  const stream = createReadStream(file, { highWaterMark: size });
  let pending = Buffer.alloc(0);
  for await (const part of stream) {
    pending = Buffer.concat([pending, part]);
    while (pending.length >= size) {
      yield pending.subarray(0, size);
      pending = pending.subarray(size);
    }
  }
  yield pending; // last (possibly empty) chunk
}

function writeAll(out, buf) {
  return new Promise((resolve, reject) =>
    out.write(buf, (err) => (err ? reject(err) : resolve())),
  );
}

export async function encryptFile(input, output, publicKeyText) {
  const { key: recipient, raw: recipientRaw } = publicKeyFrom(publicKeyText);
  const eph = generateKeyPairSync("x25519");
  const ephRaw = Buffer.from(
    eph.publicKey.export({ format: "jwk" }).x,
    "base64url",
  );
  const key = deriveKey(
    diffieHellman({ privateKey: eph.privateKey, publicKey: recipient }),
    ephRaw,
    recipientRaw,
  );
  const prefix = randomBytes(4);
  const out = createWriteStream(output, { mode: 0o640 });
  await writeAll(out, Buffer.concat([MAGIC, ephRaw, prefix]));
  // Read one chunk ahead so the last chunk can be marked.
  let index = 0;
  let previous;
  for await (const chunk of chunks(input, CHUNK)) {
    if (previous !== undefined) {
      await writeChunk(out, key, prefix, index++, previous, false);
    }
    previous = Buffer.from(chunk);
  }
  await writeChunk(out, key, prefix, index, previous ?? Buffer.alloc(0), true);
  await new Promise((resolve, reject) =>
    out.end((err) => (err ? reject(err) : resolve())),
  );
}

async function writeChunk(out, key, prefix, index, plain, last) {
  const c = createCipheriv("aes-256-gcm", key, nonce(prefix, index));
  c.setAAD(aad(index, last));
  const body = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  await writeAll(out, Buffer.concat([len, body]));
}

export async function decryptFile(input, output, privateKeyText) {
  const priv = privateKeyFrom(privateKeyText);
  const recipientRaw = Buffer.from(
    createPublicKey(priv).export({ format: "jwk" }).x,
    "base64url",
  );
  const data = createReadStream(input);
  let buf = Buffer.alloc(0);
  const need = async (n) => {
    while (buf.length < n) {
      const { value, done } = await iterator.next();
      if (done) return false;
      buf = Buffer.concat([buf, value]);
    }
    return true;
  };
  const iterator = data[Symbol.asyncIterator]();
  if (!(await need(44)) || !buf.subarray(0, 8).equals(MAGIC))
    throw new Error("not an EA-Hub encrypted backup");
  const ephRaw = buf.subarray(8, 40);
  const prefix = Buffer.from(buf.subarray(40, 44));
  buf = buf.subarray(44);
  const eph = pubFromRaw(Buffer.from(ephRaw));
  const key = deriveKey(
    diffieHellman({ privateKey: priv, publicKey: eph }),
    Buffer.from(ephRaw),
    recipientRaw,
  );
  const out = createWriteStream(output, { mode: 0o640 });
  let index = 0;
  let sawLast = false;
  while (await need(4)) {
    const len = buf.readUInt32BE(0);
    if (len < 16 || len > CHUNK + 16)
      throw new Error("corrupt backup (chunk size)");
    if (!(await need(4 + len))) throw new Error("corrupt backup (truncated)");
    const body = buf.subarray(4, 4 + len);
    buf = buf.subarray(4 + len);
    const last = buf.length === 0 && !(await need(1));
    const d = createDecipheriv("aes-256-gcm", key, nonce(prefix, index));
    d.setAAD(aad(index, last));
    d.setAuthTag(body.subarray(len - 16));
    try {
      await writeAll(
        out,
        Buffer.concat([d.update(body.subarray(0, len - 16)), d.final()]),
      );
    } catch {
      out.destroy();
      throw new Error("wrong key, or the backup was modified/truncated");
    }
    index++;
    if (last) sawLast = true;
  }
  await new Promise((resolve, reject) =>
    out.end((err) => (err ? reject(err) : resolve())),
  );
  if (!sawLast) throw new Error("corrupt backup (missing last chunk)");
}

export async function encryptDir(dir, publicKeyText) {
  let count = 0;
  for (const name of (await readdir(dir)).sort()) {
    if (!/^20\d\d-\d\d-\d\d_\d{4}$/.test(name)) continue; // finished backups only (not *.partial)
    const folder = path.join(dir, name);
    for (const file of PLAIN) {
      const plain = path.join(folder, file);
      try {
        await stat(plain);
      } catch {
        continue;
      }
      const tmp = `${plain}.enc.partial`;
      await encryptFile(plain, tmp, publicKeyText);
      await rename(tmp, `${plain}.enc`);
      await rm(plain);
      count++;
    }
  }
  return count;
}

export async function decryptDir(folder, privateKeyText) {
  let count = 0;
  for (const file of PLAIN) {
    const enc = path.join(folder, `${file}.enc`);
    try {
      await stat(enc);
    } catch {
      continue;
    }
    await decryptFile(enc, path.join(folder, file), privateKeyText);
    count++;
  }
  return count;
}

async function main() {
  const [cmd, target] = process.argv.slice(2);
  const log = (m) => console.log(`[backup-crypt] ${m}`);
  if (cmd === "keygen") {
    const k = keygen();
    console.log(`BACKUP_PUBLIC_KEY=${k.publicKey}`);
    console.log(
      `# Keep this PRIVATE key offline (password manager / safe); it is needed to restore:`,
    );
    console.log(`BACKUP_PRIVATE_KEY=${k.privateKey}`);
    return;
  }
  if (cmd === "encrypt-dir" || cmd === "watch") {
    const pub = process.env.BACKUP_PUBLIC_KEY;
    if (!pub) throw new Error("BACKUP_PUBLIC_KEY is not set");
    const dir = target ?? "/backups";
    do {
      const n = await encryptDir(dir, pub);
      if (n) log(`encrypted ${n} file(s) in ${dir}`);
      if (cmd === "watch") await new Promise((r) => setTimeout(r, 60_000));
    } while (cmd === "watch");
    return;
  }
  if (cmd === "decrypt-dir") {
    const priv = process.env.BACKUP_PRIVATE_KEY;
    if (!priv) throw new Error("BACKUP_PRIVATE_KEY is not set");
    if (!target) throw new Error("usage: decrypt-dir <backup-folder>");
    log(`decrypted ${await decryptDir(target, priv)} file(s) in ${target}`);
    return;
  }
  console.log(
    "usage: backup-crypt.mjs keygen | encrypt-dir <dir> | watch <dir> | decrypt-dir <folder>",
  );
  process.exitCode = 2;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("backup-crypt.mjs")
) {
  main().catch((e) => {
    console.error(`[backup-crypt] ${e.message}`);
    process.exit(1);
  });
}
