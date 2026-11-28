// Container entry point: derives DATABASE_URL from parts when needed, then starts the
// standalone Node server built by Nitro (`.output/server/index.mjs`).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { databaseUrl } from "./lib.mjs";

if (!process.env.DATABASE_URL?.trim()) {
  try {
    process.env.DATABASE_URL = databaseUrl();
  } catch (error) {
    console.error(`[start] ${error.message}`);
    process.exit(2);
  }
}
for (const name of ["APP_ENCRYPTION_KEY", "CRON_SECRET", "APP_URL"]) {
  if (!process.env[name]?.trim()) console.warn(`[start] ${name} is not set — see .env.example`);
}
// Platforms without init containers or one-off jobs (Cloud Run, Azure Container Apps, ECS…)
// can prepare the database on every start. Uses DATABASE_ADMIN_URL / POSTGRES_PASSWORD when
// set, otherwise the app's own connection (owner mode on managed PostgreSQL).
if (process.env.MIGRATE_ON_START === "true") {
  const { spawnSync } = await import("node:child_process");
  const env = { ...process.env };
  if (!env.DATABASE_ADMIN_URL && !env.POSTGRES_PASSWORD) env.DATABASE_ADMIN_URL = env.DATABASE_URL;
  const migrate = fileURLToPath(new URL("./migrate.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [migrate], { stdio: "inherit", env });
  if (result.status !== 0) {
    console.error("[start] database preparation failed; not starting");
    process.exit(result.status ?? 1);
  }
}
// Local semantic search runs in-process when the image bundles the model (WITH_LOCAL_MODEL=1).
const model = fileURLToPath(new URL("../../.local/models/minilm/config.json", import.meta.url));
if (!process.env.EA_LOCAL_SEMANTIC && existsSync(model))
  process.env.EA_LOCAL_SEMANTIC = new URL("../../local-backend/semantic.mjs", import.meta.url).href;
// Security headers for the static files Nitro serves itself (the app sets its own on pages).
(await import("./http-defaults.mjs")).install();
process.env.HOST ||= "0.0.0.0";
process.env.PORT ||= "3000";
await import(new URL("../../.output/server/index.mjs", import.meta.url).href);
