import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { selfhostConfig } from "./config";
import { s3Delete, s3Get, s3Put, type S3Settings } from "./s3";

/**
 * Where uploaded file bytes live. Metadata and access rules stay in storage.objects either way.
 *   STORAGE_BACKEND=filesystem (default)  files under STORAGE_DIR (a volume / PVC)
 *   STORAGE_BACKEND=s3                    objects in an S3-compatible bucket; lets several app
 *                                         replicas share uploads without a ReadWriteMany volume
 */
export interface BlobStore {
  put(
    bucket: string,
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<void>;
  get(bucket: string, key: string): Promise<Buffer | null>;
  open(
    bucket: string,
    key: string,
  ): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
  remove(bucket: string, key: string): Promise<void>;
}

function filePath(bucket: string, name: string): string {
  const root = path.resolve(selfhostConfig().storageDir);
  const full = path.resolve(root, bucket, ...name.split("/"));
  if (!full.startsWith(root + path.sep))
    throw new Error("path escapes storage root");
  return full;
}

export const filesystemStore: BlobStore = {
  async put(bucket, key, data) {
    const target = filePath(bucket, key);
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, data, { mode: 0o640 });
    await rename(tmp, target);
  },
  async get(bucket, key) {
    try {
      return await readFile(filePath(bucket, key));
    } catch {
      return null;
    }
  },
  async open(bucket, key) {
    const file = filePath(bucket, key);
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return null;
    }
    return {
      body: Readable.toWeb(
        createReadStream(file),
      ) as ReadableStream<Uint8Array>,
      size,
    };
  },
  async remove(bucket, key) {
    await unlink(filePath(bucket, key)).catch(() => undefined);
  },
};

export function s3SettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3Settings & { prefix: string } {
  const v = (name: string) => env[name]?.trim() ?? "";
  const bucket = v("S3_BUCKET");
  if (!bucket) throw new Error("STORAGE_BACKEND=s3 needs S3_BUCKET");
  const accessKeyId = v("S3_ACCESS_KEY_ID") || v("AWS_ACCESS_KEY_ID");
  const secretAccessKey =
    v("S3_SECRET_ACCESS_KEY") || v("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey)
    throw new Error(
      "STORAGE_BACKEND=s3 needs S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  const endpoint = v("S3_ENDPOINT").replace(/\/+$/, "");
  const pathStyle = v("S3_FORCE_PATH_STYLE");
  return {
    bucket,
    region: v("S3_REGION") || v("AWS_REGION") || "us-east-1",
    endpoint,
    accessKeyId,
    secretAccessKey,
    sessionToken: v("AWS_SESSION_TOKEN") || undefined,
    forcePathStyle: pathStyle ? pathStyle === "true" : Boolean(endpoint),
    prefix: v("S3_PREFIX").replace(/^\/+|\/+$/g, ""),
  };
}

export function s3Store(settings: S3Settings & { prefix: string }): BlobStore {
  const k = (bucket: string, key: string) =>
    [settings.prefix, bucket, key].filter(Boolean).join("/");
  return {
    put: (bucket, key, data, contentType) =>
      s3Put(settings, k(bucket, key), data, contentType),
    async get(bucket, key) {
      const obj = await s3Get(settings, k(bucket, key));
      if (!obj) return null;
      return Buffer.from(await new Response(obj.body).arrayBuffer());
    },
    open: (bucket, key) => s3Get(settings, k(bucket, key)),
    remove: (bucket, key) => s3Delete(settings, k(bucket, key)),
  };
}

let store: BlobStore | undefined;

export function blobStore(): BlobStore {
  if (store) return store;
  const backend = (process.env["STORAGE_BACKEND"] ?? "filesystem")
    .trim()
    .toLowerCase();
  if (backend === "s3") store = s3Store(s3SettingsFromEnv());
  else if (backend === "filesystem" || backend === "") store = filesystemStore;
  else
    throw new Error(`Unknown STORAGE_BACKEND "${backend}" (filesystem or s3)`);
  return store;
}

/** Test hook. */
export function resetBlobStore(): void {
  store = undefined;
}
