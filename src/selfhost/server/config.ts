import { hkdfSync } from "node:crypto";

export type SelfhostConfig = {
  databaseUrl: string;
  databasePoolSize: number;
  appUrl: string;
  storageDir: string;
  maxUploadBytes: number;
  trustProxyHops: number;
  jwtSecret: Buffer;
  storageSigningKey: Buffer;
  serviceKey: string;
  accessTokenSeconds: number;
  refreshTokenDays: number;
};

let cached: SelfhostConfig | undefined;

function derive(root: string, label: string): Buffer {
  return Buffer.from(hkdfSync("sha256", root, "ea-hub-selfhost", label, 32));
}

function rootSecret(): string {
  const root = process.env["APP_ENCRYPTION_KEY"]?.trim();
  if (!root || root.length < 32)
    throw new Error("APP_ENCRYPTION_KEY must be set (at least 32 characters)");
  return root;
}

/** The internal value that plays the role of Supabase's service-role key. Never leaves the server. */
export function deriveServiceKey(root = rootSecret()): string {
  return `selfhost_service_${derive(root, "service-key").toString("hex")}`;
}

export function selfhostConfig(): SelfhostConfig {
  if (cached) return cached;
  const root = rootSecret();
  const databaseUrl = process.env["DATABASE_URL"]?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const appUrl = (process.env["APP_URL"] ?? "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
  cached = {
    databaseUrl,
    databasePoolSize: Math.max(
      2,
      Number(process.env["DATABASE_POOL_SIZE"] ?? 10) || 10,
    ),
    appUrl,
    storageDir: process.env["STORAGE_DIR"]?.trim() || "/data/storage",
    maxUploadBytes:
      Math.max(1, Number(process.env["STORAGE_MAX_UPLOAD_MB"] ?? 10) || 10) *
      1024 *
      1024,
    trustProxyHops: Math.max(
      0,
      Number(process.env["TRUST_PROXY_HOPS"] ?? 1) || 0,
    ),
    jwtSecret: derive(root, "auth-jwt"),
    storageSigningKey: derive(root, "storage-url"),
    serviceKey: deriveServiceKey(root),
    accessTokenSeconds: 3600,
    refreshTokenDays: 30,
  };
  return cached;
}

/** Test hook. */
export function resetSelfhostConfig(): void {
  cached = undefined;
}
