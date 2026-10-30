// Applying D1 migrations from the Worker. Uses Wrangler's own log table
// (d1_migrations, one row per file name), so `wrangler d1 migrations list/apply`
// and the Worker always agree. Each migration runs in one batch with its log
// row: all of it or none. Bundle migrations/*.sql into the Worker with
// `bnt-bundle-migrations` (bin/bundle-migrations.mjs).

export const MIGRATIONS_TABLE = "d1_migrations";

/**
 * Split a migration into statements. Statements end with ';' at the end of a
 * line; a CREATE TRIGGER runs until its 'END;'. Leading comment lines are dropped.
 */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of sql.split("\n")) {
    if (!current.length && (!line.trim() || line.trim().startsWith("--"))) continue;
    current.push(line);
    const head = current[0]!.trim().toUpperCase();
    const done = head.startsWith("CREATE TRIGGER") ? /\bEND;\s*$/i.test(line) : /;\s*$/.test(line);
    if (done) {
      out.push(current.join("\n").trim().replace(/;$/, ""));
      current = [];
    }
  }
  if (current.some((line) => line.trim())) throw new Error(`Unterminated statement: ${current.join("\n").slice(0, 120)}`);
  return out;
}

/** The migration's opening comment, as one paragraph: what it changes and why. */
export function summary(sql: string): string {
  const lines: string[] = [];
  for (const line of sql.split("\n")) {
    if (!line.trim().startsWith("--")) break;
    lines.push(line.trim().replace(/^--\s?/, ""));
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

export interface MigrationStatus {
  /** Applied according to the log, in order. */
  applied: string[];
  /** Bundled with this build and not applied yet, in order. */
  pending: { name: string; summary: string; statements: number }[];
  /** Applied in the database but unknown to this build (an older build is running). */
  unknown: string[];
  /**
   * The schema exists but has no migration log, so what ran is unknown:
   * applying anything could repeat a migration. Nothing is offered.
   */
  untracked: boolean;
}

export type Bundle = readonly { name: string; sql: string }[];

export interface MigrationOptions {
  /**
   * A table the first migration creates. When it exists without a migration
   * log, the schema was made by hand and nothing is applied.
   */
  schemaTable?: string;
}

async function logged(db: D1Database): Promise<string[] | null> {
  const table = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1").bind(MIGRATIONS_TABLE).first();
  if (!table) return null;
  const { results } = await db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`).all<{ name: string }>();
  return results.map((r) => r.name);
}

export async function migrationStatus(db: D1Database, bundle: Bundle, options: MigrationOptions = {}): Promise<MigrationStatus> {
  const applied = await logged(db);
  const known = new Set(bundle.map((m) => m.name));
  if (applied === null) {
    const schema = options.schemaTable
      ? await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1").bind(options.schemaTable).first()
      : null;
    return {
      applied: [], unknown: [], untracked: Boolean(schema),
      pending: schema ? [] : bundle.map((m) => ({ name: m.name, summary: summary(m.sql), statements: statements(m.sql).length })),
    };
  }
  const done = new Set(applied);
  return {
    applied,
    pending: bundle.filter((m) => !done.has(m.name)).map((m) => ({ name: m.name, summary: summary(m.sql), statements: statements(m.sql).length })),
    unknown: applied.filter((name) => !known.has(name)),
    untracked: false,
  };
}

export class MigrationError extends Error {
  constructor(readonly migration: string, message: string, options?: { cause?: unknown }) { super(message, options); }
}

/**
 * Apply every pending migration in name order, each atomically with its log row.
 * Stops at the first failure; earlier ones stay applied. Refuses when the log is
 * missing for an existing schema, or the database holds migrations this build lacks.
 */
export async function applyMigrations(db: D1Database, bundle: Bundle, options: MigrationOptions = {}): Promise<{ applied: string[]; status: MigrationStatus }> {
  const before = await migrationStatus(db, bundle, options);
  if (before.untracked) throw new MigrationError("", "The database has a schema but no migration log; apply migrations with Wrangler so nothing runs twice.");
  if (before.unknown.length) throw new MigrationError(before.unknown[0]!, `The database already has migrations this version doesn't know (${before.unknown.join(", ")}). Deploy the latest version first.`);
  const applied: string[] = [];
  if (before.pending.length) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}(
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`).run();
  }
  for (const { name } of before.pending) {
    const sql = bundle.find((m) => m.name === name)!.sql;
    try {
      await db.batch([
        ...statements(sql).map((statement) => db.prepare(statement)),
        db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?1)`).bind(name),
      ]);
    } catch (error) {
      throw new MigrationError(name, `${name} could not be applied and was rolled back: ${(error as Error).message}`, { cause: error });
    }
    applied.push(name);
  }
  return { applied, status: await migrationStatus(db, bundle, options) };
}

const ready = new WeakMap<D1Database, Promise<void>>();

/**
 * Applies pending migrations once per isolate, before the first query, so a
 * fresh database works without running Wrangler. Two isolates racing each try;
 * the loser's batch fails on the log's unique name and rolls back, and the
 * check afterwards sees the migration applied. Retried after a real failure.
 */
export function ensureSchema(db: D1Database, bundle: Bundle, options: MigrationOptions = {}): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = (async () => {
      try {
        await applyMigrations(db, bundle, options);
      } catch (error) {
        const status = await migrationStatus(db, bundle, options);
        if (status.pending.length || status.untracked || status.unknown.length) throw error;
      }
    })().catch((error) => { ready.delete(db); throw error; });
    ready.set(db, p);
  }
  return p;
}
