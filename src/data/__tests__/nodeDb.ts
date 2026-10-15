import type { CryptoAdapter, DbAdapter, SqlParam } from '../adapter';

// Node's built-in SQLite (Node 22.5+), loaded outside Jest's module registry.
const { DatabaseSync } = (globalThis as unknown as { process: { getBuiltinModule(id: string): any } })
  .process.getBuiltinModule('node:sqlite');

export function nodeDb(): DbAdapter {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: async (sql) => { db.exec(sql); },
    run: async (sql, params: SqlParam[] = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    all: async <T,>(sql: string, params: SqlParam[] = []) => db.prepare(sql).all(...params) as T[],
    transaction: async (task) => {
      if (depth > 0) return task();
      depth++;
      db.exec('BEGIN');
      try { await task(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth--; }
    },
  };
}

export const fakeCrypto: CryptoAdapter = {
  encrypt: async (s) => 'enc:' + [...s].reverse().join(''),
  decrypt: async (s) => [...s.slice(4)].reverse().join(''),
};

