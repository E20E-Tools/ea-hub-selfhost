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
import { asRole, SERVICE, type RequestAuth } from "./db";
import { hmac, safeEqual } from "./crypto";

/**
 * File storage on the local disk (a Docker volume or a Kubernetes PVC). Metadata lives in
 * storage.objects so the upstream storage RLS policies still decide who may read or write.
 */

type StorageError = { message: string; statusCode: string; name: string };
const storageError = (message: string, statusCode = "400"): StorageError => ({
  message,
  statusCode,
  name: "StorageApiError",
});

const BUCKET = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export function safeObjectPath(name: string): string | null {
  const p = String(name ?? "").replace(/^\/+/, "");
  if (!p || p.length > 1024 || /[\\\0]/.test(p)) return null;
  const parts = p.split("/");
  if (parts.some((s) => !s || s === "." || s === "..")) return null;
  return parts.join("/");
}

function filePath(bucket: string, name: string): string {
  const root = path.resolve(selfhostConfig().storageDir);
  const full = path.resolve(root, bucket, ...name.split("/"));
  if (!full.startsWith(root + path.sep))
    throw new Error("path escapes storage root");
  return full;
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (typeof Blob !== "undefined" && body instanceof Blob)
    return Buffer.from(await body.arrayBuffer());
  if (typeof body === "string") return Buffer.from(body, "utf8");
  throw new Error("Unsupported upload body");
}

function guessType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".avif": "image/avif",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".txt": "text/plain; charset=utf-8",
      ".json": "application/json",
    }[ext] ?? "application/octet-stream"
  );
}

export class StorageBucket {
  constructor(
    private readonly bucket: string,
    private readonly auth: RequestAuth,
  ) {}

  private check(name: string): string | StorageError {
    if (!BUCKET.test(this.bucket)) return storageError("Invalid bucket", "400");
    return safeObjectPath(name) ?? storageError("Invalid key", "400");
  }

  async upload(
    name: string,
    body: unknown,
    options: {
      contentType?: string;
      upsert?: boolean;
      cacheControl?: string;
    } = {},
  ) {
    const key = this.check(name);
    if (typeof key !== "string") return { data: null, error: key };
    let data: Buffer;
    try {
      data = await toBuffer(body);
    } catch (e) {
      return { data: null, error: storageError((e as Error).message) };
    }
    if (data.length > selfhostConfig().maxUploadBytes)
      return {
        data: null,
        error: storageError(
          "The object exceeded the maximum allowed size",
          "413",
        ),
      };
    const contentType =
      options.contentType ||
      (typeof Blob !== "undefined" && body instanceof Blob && body.type) ||
      guessType(key);
    const metadata = {
      mimetype: contentType,
      size: data.length,
      cacheControl: `max-age=${options.cacheControl ?? "3600"}`,
      lastModified: new Date().toISOString(),
    };
    const owner =
      typeof this.auth.claims["sub"] === "string"
        ? this.auth.claims["sub"]
        : null;
    try {
      const id = await asRole(this.auth, async (tx) => {
        const rows = await tx.unsafe<{ id: string }[]>(
          `insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
           values ($1, $2, $3::uuid, $3, $4::jsonb)
           on conflict (bucket_id, name) do ${options.upsert ? "update set metadata = excluded.metadata, owner = excluded.owner, updated_at = now()" : "nothing"}
           returning id`,
          [this.bucket, key, owner, JSON.stringify(metadata)],
        );
        if (!rows[0]) return null;
        const target = filePath(this.bucket, key);
        await mkdir(path.dirname(target), { recursive: true });
        const tmp = `${target}.${randomUUID()}.tmp`;
        await writeFile(tmp, data, { mode: 0o640 });
        await rename(tmp, target);
        return rows[0].id;
      });
      if (!id)
        return {
          data: null,
          error: storageError("The resource already exists", "409"),
        };
      return {
        data: { id, path: key, fullPath: `${this.bucket}/${key}` },
        error: null,
      };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "42501")
        return {
          data: null,
          error: storageError(
            "new row violates row-level security policy",
            "403",
          ),
        };
      if (code === "23503")
        return { data: null, error: storageError("Bucket not found", "404") };
      console.error("[selfhost] upload failed", (e as Error).message);
      return { data: null, error: storageError("Upload failed", "500") };
    }
  }

  async visible(key: string): Promise<{ mimetype: string } | null> {
    return asRole(this.auth, async (tx) => {
      const rows = await tx.unsafe<
        { metadata: { mimetype?: string } | null }[]
      >(
        "select metadata from storage.objects where bucket_id = $1 and name = $2",
        [this.bucket, key],
      );
      const row = rows[0];
      return row
        ? { mimetype: row.metadata?.mimetype || guessType(key) }
        : null;
    });
  }

  async download(name: string) {
    const key = this.check(name);
    if (typeof key !== "string") return { data: null, error: key };
    const meta = await this.visible(key);
    if (!meta)
      return { data: null, error: storageError("Object not found", "404") };
    try {
      const bytes = await readFile(filePath(this.bucket, key));
      return { data: new Blob([bytes], { type: meta.mimetype }), error: null };
    } catch {
      return { data: null, error: storageError("Object not found", "404") };
    }
  }

  async remove(names: string[]) {
    const keys = (names ?? [])
      .map((n) => safeObjectPath(n))
      .filter((k): k is string => Boolean(k));
    if (!BUCKET.test(this.bucket))
      return { data: null, error: storageError("Invalid bucket") };
    const removed = await asRole(this.auth, async (tx) =>
      tx.unsafe<{ name: string; id: string; bucket_id: string }[]>(
        "delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning id, name, bucket_id",
        [this.bucket, keys],
      ),
    );
    for (const row of removed)
      await unlink(filePath(this.bucket, row.name)).catch(() => undefined);
    return { data: removed.map((r) => ({ ...r })), error: null };
  }

  async list(
    prefix = "",
    options: { limit?: number; offset?: number; search?: string } = {},
  ) {
    if (!BUCKET.test(this.bucket))
      return { data: null, error: storageError("Invalid bucket") };
    const folder = prefix ? `${prefix.replace(/\/+$/, "")}/` : "";
    const rows = await asRole(this.auth, async (tx) =>
      tx.unsafe<
        {
          id: string;
          name: string;
          metadata: unknown;
          created_at: Date;
          updated_at: Date;
        }[]
      >(
        `select id, name, metadata, created_at, updated_at from storage.objects
         where bucket_id = $1 and name like $2 escape '\\' and name not like $3 escape '\\'
           and ($4 = '' or name ilike '%' || $4 || '%')
         order by name limit $5 offset $6`,
        [
          this.bucket,
          `${folder.replace(/[\\%_]/g, "\\$&")}%`,
          `${folder.replace(/[\\%_]/g, "\\$&")}%/%`,
          options.search ?? "",
          Math.min(options.limit ?? 100, 1000),
          options.offset ?? 0,
        ],
      ),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name.slice(folder.length),
        metadata: r.metadata,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      })),
      error: null,
    };
  }

  async createSignedUrl(
    name: string,
    expiresIn: number,
    options: { download?: boolean | string | undefined } = {},
  ) {
    const key = this.check(name);
    if (typeof key !== "string") return { data: null, error: key };
    if (!(await this.visible(key)))
      return { data: null, error: storageError("Object not found", "404") };
    return {
      data: {
        signedUrl: signedUrl(this.bucket, key, expiresIn, options.download),
      },
      error: null,
    };
  }

  async createSignedUrls(names: string[], expiresIn: number) {
    const out = [];
    for (const n of names ?? []) {
      const r = await this.createSignedUrl(n, expiresIn);
      out.push({
        path: n,
        signedUrl: r.data?.signedUrl ?? null,
        error: r.error?.message ?? null,
      });
    }
    return { data: out, error: null };
  }

  getPublicUrl(name: string) {
    const key = safeObjectPath(name) ?? "";
    return {
      data: {
        publicUrl: `${selfhostConfig().appUrl}/api/selfhost/storage/object/public/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
      },
    };
  }
}

// ---------- signed URLs ----------
function signature(bucket: string, key: string, exp: number): string {
  return hmac(selfhostConfig().storageSigningKey, `${bucket}/${key}:${exp}`);
}

function signedUrl(
  bucket: string,
  key: string,
  expiresIn: number,
  download?: boolean | string,
): string {
  const seconds = Math.min(
    Math.max(1, Math.floor(Number(expiresIn) || 60)),
    60 * 60 * 24 * 365,
  );
  const exp = Math.floor(Date.now() / 1000) + seconds;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const q = new URLSearchParams({
    token: `${exp}.${signature(bucket, key, exp)}`,
  });
  if (download) q.set("download", typeof download === "string" ? download : "");
  return `${selfhostConfig().appUrl}/api/selfhost/storage/object/sign/${bucket}/${encoded}?${q.toString()}`;
}

/** GET /api/selfhost/storage/object/{sign|public}/<bucket>/<path> */
export async function serveObject(
  url: URL,
  kind: "sign" | "public",
  rest: string,
): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404 });
  const slash = rest.indexOf("/");
  if (slash < 1) return notFound();
  const bucket = rest.slice(0, slash);
  let key: string | null;
  try {
    key = safeObjectPath(
      rest
        .slice(slash + 1)
        .split("/")
        .map(decodeURIComponent)
        .join("/"),
    );
  } catch {
    return notFound();
  }
  if (!BUCKET.test(bucket) || !key) return notFound();
  let meta: { mimetype: string } | null;
  if (kind === "sign") {
    const [expText, sig] = (url.searchParams.get("token") ?? "").split(".");
    const exp = Number(expText);
    if (!sig || !Number.isFinite(exp) || exp < Date.now() / 1000)
      return new Response("Expired", { status: 400 });
    if (!safeEqual(sig, signature(bucket, key, exp)))
      return new Response("Invalid signature", { status: 400 });
    meta = await new StorageBucket(bucket, SERVICE).visible(key);
  } else {
    const isPublic = await asRole(SERVICE, async (tx) => {
      const rows = await tx.unsafe(
        "select 1 from storage.buckets where id = $1 and public",
        [bucket],
      );
      return rows.length > 0;
    });
    if (!isPublic) return notFound();
    meta = await new StorageBucket(bucket, SERVICE).visible(key);
  }
  if (!meta) return notFound();
  const file = filePath(bucket, key);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return notFound();
  }
  const download = url.searchParams.get("download");
  const inlineSafe =
    /^image\/(png|jpeg|webp|gif|avif)$|^application\/pdf$|^text\/plain/.test(
      meta.mimetype,
    );
  const headers = new Headers({
    "content-type": meta.mimetype,
    "content-length": String(size),
    "cache-control":
      kind === "public" ? "public, max-age=3600" : "private, max-age=3600",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    "cross-origin-resource-policy": "same-site",
  });
  if (download !== null || !inlineSafe) {
    const fname = (download || key.split("/").pop() || "file").replace(
      /[^\w.\- ]+/g,
      "_",
    );
    headers.set("content-disposition", `attachment; filename="${fname}"`);
  }
  return new Response(
    Readable.toWeb(createReadStream(file)) as ReadableStream,
    { status: 200, headers },
  );
}
