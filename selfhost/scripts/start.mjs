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
// Local semantic search runs in-process when the image bundles the model (WITH_LOCAL_MODEL=1).
const model = fileURLToPath(new URL("../../.local/models/minilm/config.json", import.meta.url));
if (!process.env.EA_LOCAL_SEMANTIC && existsSync(model))
  process.env.EA_LOCAL_SEMANTIC = new URL("../../local-backend/semantic.mjs", import.meta.url).href;
process.env.HOST ||= "0.0.0.0";
process.env.PORT ||= "3000";
await import(new URL("../../.output/server/index.mjs", import.meta.url).href);
