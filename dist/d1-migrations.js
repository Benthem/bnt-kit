// Compiled from src/d1-migrations.ts by scripts/build.mjs. Do not edit.
const MIGRATIONS_TABLE = "d1_migrations";
function statements(sql) {
  const out = [];
  let current = [];
  for (const line of sql.split("\n")) {
    if (!current.length && (!line.trim() || line.trim().startsWith("--"))) continue;
    current.push(line);
    const head = current[0].trim().toUpperCase();
    const done = head.startsWith("CREATE TRIGGER") ? /\bEND;\s*$/i.test(line) : /;\s*$/.test(line);
    if (done) {
      out.push(current.join("\n").trim().replace(/;$/, ""));
      current = [];
    }
  }
  if (current.some((line) => line.trim())) throw new Error(`Unterminated statement: ${current.join("\n").slice(0, 120)}`);
  return out;
}
function summary(sql) {
  const lines = [];
  for (const line of sql.split("\n")) {
    if (!line.trim().startsWith("--")) break;
    lines.push(line.trim().replace(/^--\s?/, ""));
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}
async function logged(db) {
  const table = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1").bind(MIGRATIONS_TABLE).first();
  if (!table) return null;
  const { results } = await db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`).all();
  return results.map((r) => r.name);
}
async function migrationStatus(db, bundle, options = {}) {
  const applied = await logged(db);
  const known = new Set(bundle.map((m) => m.name));
  if (applied === null) {
    const schema = options.schemaTable ? await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1").bind(options.schemaTable).first() : null;
    return {
      applied: [],
      unknown: [],
      untracked: Boolean(schema),
      pending: schema ? [] : bundle.map((m) => ({ name: m.name, summary: summary(m.sql), statements: statements(m.sql).length }))
    };
  }
  const done = new Set(applied);
  return {
    applied,
    pending: bundle.filter((m) => !done.has(m.name)).map((m) => ({ name: m.name, summary: summary(m.sql), statements: statements(m.sql).length })),
    unknown: applied.filter((name) => !known.has(name)),
    untracked: false
  };
}
class MigrationError extends Error {
  migration;
  constructor(migration, message, options) {
    super(message, options);
    this.migration = migration;
  }
}
async function applyMigrations(db, bundle, options = {}) {
  const before = await migrationStatus(db, bundle, options);
  if (before.untracked) throw new MigrationError("", "The database has a schema but no migration log; apply migrations with Wrangler so nothing runs twice.");
  if (before.unknown.length) throw new MigrationError(before.unknown[0], `The database already has migrations this version doesn't know (${before.unknown.join(", ")}). Deploy the latest version first.`);
  const applied = [];
  if (before.pending.length) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}(
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`).run();
  }
  for (const { name } of before.pending) {
    const sql = bundle.find((m) => m.name === name).sql;
    try {
      await db.batch([
        ...statements(sql).map((statement) => db.prepare(statement)),
        db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?1)`).bind(name)
      ]);
    } catch (error) {
      throw new MigrationError(name, `${name} could not be applied and was rolled back: ${error.message}`, { cause: error });
    }
    applied.push(name);
  }
  return { applied, status: await migrationStatus(db, bundle, options) };
}
const ready = /* @__PURE__ */ new WeakMap();
function ensureSchema(db, bundle, options = {}) {
  let p = ready.get(db);
  if (!p) {
    p = (async () => {
      try {
        await applyMigrations(db, bundle, options);
      } catch (error) {
        const status = await migrationStatus(db, bundle, options);
        if (status.pending.length || status.untracked || status.unknown.length) throw error;
      }
    })().catch((error) => {
      ready.delete(db);
      throw error;
    });
    ready.set(db, p);
  }
  return p;
}
export {
  MIGRATIONS_TABLE,
  MigrationError,
  applyMigrations,
  ensureSchema,
  migrationStatus,
  statements,
  summary
};
