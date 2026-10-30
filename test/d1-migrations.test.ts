import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, ensureSchema, migrationStatus, statements, summary, type Bundle } from "../src/d1-migrations";
import { migrationFiles, openD1 } from "../src/testing/d1";

const dir = fileURLToPath(new URL("./fixtures/migrations/", import.meta.url));
const configPath = fileURLToPath(new URL("./d1.wrangler.jsonc", import.meta.url));
const bundle = async (): Promise<Bundle> => Promise.all((await migrationFiles(dir)).map(async (name) => ({ name, sql: await readFile(dir + name, "utf8") })));

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => { await dispose?.(); dispose = undefined; });

describe("statements", () => {
  it("splits on line ends, keeps triggers whole, ignores semicolons in comments", async () => {
    const sql = await readFile(dir + "0001_first.sql", "utf8");
    const parts = statements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatch(/^CREATE TRIGGER[\s\S]*END$/);
    expect(summary(sql)).toBe("Things; money is cents.");
  });
});

describe("applying migrations", () => {
  it("applies pending files once and records them like wrangler", async () => {
    const d1 = await openD1({ configPath }); dispose = d1.dispose;
    const all = await bundle();
    expect((await migrationStatus(d1.db, all)).pending.map((p) => p.name)).toEqual(["0001_first.sql", "0002_second.sql"]);
    expect((await applyMigrations(d1.db, all)).applied).toEqual(["0001_first.sql", "0002_second.sql"]);
    expect((await applyMigrations(d1.db, all)).applied).toEqual([]);
    await expect(d1.db.prepare("DELETE FROM things").run()).resolves.toBeDefined();
  });

  it("lets two isolates race on a fresh database", async () => {
    const d1 = await openD1({ configPath }); dispose = d1.dispose;
    const all = await bundle();
    // Two databases objects (as two isolates have) applying at once.
    const other = new Proxy(d1.db, {});
    await Promise.all([ensureSchema(d1.db, all), ensureSchema(other, all)]);
    expect((await migrationStatus(d1.db, all)).applied).toEqual(["0001_first.sql", "0002_second.sql"]);
  });

  it("refuses a hand-made schema without a log", async () => {
    const d1 = await openD1({ configPath }); dispose = d1.dispose;
    await d1.db.prepare("CREATE TABLE things (id TEXT)").run();
    const status = await migrationStatus(d1.db, await bundle(), { schemaTable: "things" });
    expect(status).toMatchObject({ untracked: true, pending: [] });
    await expect(applyMigrations(d1.db, await bundle(), { schemaTable: "things" })).rejects.toThrow(/no migration log/);
  });

  it("opens a test database with migrations applied", async () => {
    const d1 = await openD1({ configPath, migrationsDir: dir }); dispose = d1.dispose;
    await d1.db.prepare("INSERT INTO things (id, cents) VALUES ('a', 1)").run();
    expect(await d1.db.prepare("SELECT note FROM things").first("note")).toBe("");
  });
});
