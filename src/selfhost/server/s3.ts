import { createHash, createHmac } from "node:crypto";

/**
 * A minimal S3 client (AWS Signature Version 4) for the four calls the storage layer needs:
 * PUT, GET, HEAD and DELETE of one object. Works with AWS S3 and S3-compatible services
 * (MinIO, Ceph RGW, Cloudflare R2, Wasabi, DigitalOcean Spaces…). No SDK dependency.
 */

export type S3Settings = {
  bucket: string;
  region: string;
  /** Empty for AWS; e.g. https://minio.example.com for others. */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  /** Path-style URLs (endpoint/bucket/key). Defaults to true when an endpoint is set. */
  forcePathStyle: boolean;
};

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const hmacRaw = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding of one path segment, as SigV4 requires. */
export function encodeSegment(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function objectUrl(s: S3Settings, key: string): URL {
  const path = key.split("/").map(encodeSegment).join("/");
  if (s.endpoint) {
    const base = new URL(s.endpoint);
    const prefix = base.pathname.replace(/\/+$/, "");
    if (s.forcePathStyle)
      return new URL(
        `${base.protocol}//${base.host}${prefix}/${encodeSegment(s.bucket)}/${path}`,
      );
    return new URL(
      `${base.protocol}//${s.bucket}.${base.host}${prefix}/${path}`,
    );
  }
  const host =
    s.region === "us-east-1"
      ? "s3.amazonaws.com"
      : `s3.${s.region}.amazonaws.com`;
  return s.forcePathStyle
    ? new URL(`https://${host}/${encodeSegment(s.bucket)}/${path}`)
    : new URL(`https://${s.bucket}.${host}/${path}`);
}

/** Signs a request in place and returns the headers to send. */
export function signRequest(
  s: S3Settings,
  method: string,
  url: URL,
  payloadHash: string,
  extra: Record<string, string> = {},
  now = new Date(),
): Record<string, string> {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
  };
  if (s.sessionToken) headers["x-amz-security-token"] = s.sessionToken;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeSegment(k), encodeSegment(v)])
    .sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [
    method,
    url.pathname,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${day}/${s.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const kDate = hmacRaw(`AWS4${s.secretAccessKey}`, day);
  const kRegion = hmacRaw(kDate, s.region);
  const kService = hmacRaw(kRegion, "s3");
  const kSigning = hmacRaw(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");
  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${s.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  delete headers["host"]; // fetch sets it from the URL
  return headers;
}

async function call(
  s: S3Settings,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  body?: Buffer,
  extra: Record<string, string> = {},
): Promise<Response> {
  const url = objectUrl(s, key);
  const headers = signRequest(
    s,
    method,
    url,
    body ? sha256(body) : EMPTY_SHA256,
    extra,
  );
  // Uploads run inside a database transaction: never wait on a hung endpoint for long.
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(method === "PUT" ? 60_000 : 30_000),
  };
  if (body) init.body = new Uint8Array(body);
  return fetch(url, init);
}

async function fail(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? res.statusText;
  throw new Error(`S3 ${what} failed: HTTP ${res.status} ${code}`);
}

export async function s3Put(
  s: S3Settings,
  key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const res = await call(s, "PUT", key, data, { "content-type": contentType });
  if (!res.ok) await fail(res, "upload");
  await res.body?.cancel();
}

export async function s3Get(
  s: S3Settings,
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null> {
  const res = await call(s, "GET", key);
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok || !res.body) return fail(res, "download");
  return {
    body: res.body,
    size: Number(res.headers.get("content-length") ?? 0),
  };
}

export async function s3Delete(s: S3Settings, key: string): Promise<void> {
  const res = await call(s, "DELETE", key);
  if (!res.ok && res.status !== 404) await fail(res, "delete");
  await res.body?.cancel();
}

export async function s3Head(s: S3Settings, key: string): Promise<boolean> {
  const res = await call(s, "HEAD", key);
  await res.body?.cancel();
  if (res.status === 404) return false;
  if (!res.ok) return fail(res, "check");
  return true;
}
