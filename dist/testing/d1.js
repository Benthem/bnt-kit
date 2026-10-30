// Compiled from src/testing/d1.ts by scripts/build.mjs. Do not edit.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { statements } from "../d1-migrations.js";
async function migrationFiles(dir) {
  return (await readdir(dir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
}
async function openD1({ configPath, migrationsDir, migrate = true }) {
  const proxy = await getPlatformProxy({ configPath, persist: false, remoteBindings: false });
  const db = proxy.env.DB;
  if (migrate && migrationsDir) {
    for (const file of await migrationFiles(migrationsDir)) {
      for (const sql of statements(await readFile(join(migrationsDir, file), "utf8"))) await db.prepare(sql).run();
    }
  }
  return { db, dispose: () => proxy.dispose() };
}
export {
  migrationFiles,
  openD1
};
