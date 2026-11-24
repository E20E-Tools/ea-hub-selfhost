import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DRIZZLE = "drizzle/migrations";
const LOCAL = "local-backend/supabase/migrations";
const sqlFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
const topic = (file: string) => file.replace(/^\d{4}_/, "");

describe("migration sources stay in step", () => {
  it("every Drizzle migration file is registered in the journal, in order", () => {
    const journal = JSON.parse(
      readFileSync(`${DRIZZLE}/meta/_journal.json`, "utf8"),
    ) as {
      entries: { idx: number; tag: string }[];
    };
    const tags = sqlFiles(DRIZZLE).map((f) => f.slice(0, -4));
    expect(journal.entries.map((e) => e.tag)).toEqual(tags);
    expect(journal.entries.map((e) => e.idx)).toEqual(tags.map((_, i) => i));
  });

  it("every migration after the local schema snapshot also exists for the local backend", () => {
    // local-backend 0001-0004 squash Drizzle 0000-0075; later migrations are copied one by one.
    const local = new Set(sqlFiles(LOCAL).map(topic));
    const missing = sqlFiles(DRIZZLE)
      .filter((f) => Number(f.slice(0, 4)) >= 76)
      .map(topic)
      .filter((t) => !local.has(t));
    expect(missing).toEqual([]);
  });
});
