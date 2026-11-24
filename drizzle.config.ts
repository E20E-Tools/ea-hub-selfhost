import { defineConfig } from "drizzle-kit";

// Migrations are hand-written SQL in ./drizzle/migrations (schema.ts is intentionally empty);
// drizzle-kit is used only to apply them: `npx drizzle-kit migrate`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env["DATABASE_MIGRATION_URL"] ?? process.env["LOVABLE_DB_MIGRATION_URL"] ?? "",
  },
});
