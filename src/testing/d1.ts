// A fresh local D1 (workerd, through wrangler's platform proxy) with the app's
// migrations applied the way production applies them, for tests against real
// SQLite. Needs a wrangler config with a D1 binding named DB.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { statements } from "../d1-migrations";

export interface OpenD1Options {
  /** A wrangler config with a D1 binding named DB, e.g. test/d1.wrangler.jsonc. */
  configPath: string;
  /** migrations/ with NNNN_name.sql files; omit for an empty database. */
  migrationsDir?: string;
  /** Leave migrations unapplied, like a database whose migrations haven't run. */
  migrate?: boolean;
}

export async function migrationFiles(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
}

export async function openD1({ configPath, migrationsDir, migrate = true }: OpenD1Options): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: false, remoteBindings: false });
  const db = proxy.env.DB;
  if (migrate && migrationsDir) {
    for (const file of await migrationFiles(migrationsDir)) {
      for (const sql of statements(await readFile(join(migrationsDir, file), "utf8"))) await db.prepare(sql).run();
    }
  }
  return { db, dispose: () => proxy.dispose() };
}
