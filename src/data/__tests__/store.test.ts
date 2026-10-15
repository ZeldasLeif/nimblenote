import { parse } from '../../core/parse';
import type { CryptoAdapter, DbAdapter, SqlParam } from '../adapter';
import { Store } from '../store';

// Node's built-in SQLite (Node 22.5+), loaded outside Jest's module registry.
const { DatabaseSync } = (globalThis as unknown as { process: { getBuiltinModule(id: string): any } })
  .process.getBuiltinModule('node:sqlite');

function nodeDb(): DbAdapter {
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

const fakeCrypto: CryptoAdapter = {
  encrypt: async (s) => 'enc:' + [...s].reverse().join(''),
  decrypt: async (s) => [...s.slice(4)].reverse().join(''),
};

let clock = 1_000_000;
async function makeStore() {
  const db = nodeDb();
  const store = new Store(db, fakeCrypto, () => ++clock);
  await store.init();
  return { store, db };
}

async function run(store: Store, input: string, ctx?: { kind: 'category'; key: string }) {
  const cmd = parse(input, store.catalog(), ctx);
  if (cmd.kind !== 'write') throw new Error(`not a write: ${JSON.stringify(cmd)}`);
  return store.applyWrite(cmd);
}

describe('Store', () => {
  it('implicit creation, then adds to the same list (no duplicates)', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs, milk, olive oil');
    await run(store, 'new list groceries toilet paper');
    await run(store, '+ Grocery bread');
    const cats = store.getState().categories.filter((c) => c.key === 'grocery');
    expect(cats).toHaveLength(1);
    expect(store.entriesOf(cats[0].id).map((e) => e.value)).toEqual(['eggs', 'milk', 'olive oil', 'toilet paper', 'bread']);
  });

  it('skips items already on the list', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs');
    const out = await run(store, '+ groceries Eggs, milk');
    expect(out.message).toMatch(/already there: Eggs/);
    expect(store.getState().entries).toHaveLength(2);
  });

  it('facts upsert by key and undo restores the old value', async () => {
    const { store } = await makeStore();
    await run(store, '+ bank pin: 4533');
    await run(store, '+ bank pin: 9999');
    const bank = store.categoryByKey('bank')!;
    expect(store.entriesOf(bank.id).map((e) => [e.key, e.value])).toEqual([['pin', '9999']]);
    await store.undo();
    expect(store.entriesOf(bank.id).map((e) => e.value)).toEqual(['4533']);
  });

  it('undo of the first write removes the implicitly created category', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs');
    expect(store.getState().categories).toHaveLength(1);
    await store.undo();
    expect(store.getState().categories).toHaveLength(0);
    expect(store.getState().entries).toHaveLength(0);
    // and it can be created again without a unique-key clash
    await run(store, '+ groceries eggs');
    expect(store.getState().categories).toHaveLength(1);
  });

  it('passwords are sensitive by default and stored encrypted', async () => {
    const { store, db } = await makeStore();
    await run(store, '+pw bankpin2 4321');
    const e = store.getState().entries[0];
    expect(e.value).toBeNull();
    expect(e.secret).toMatch(/^enc:/);
    expect(await store.reveal(e)).toBe('4321');
    const raw = await db.all<{ value: string | null }>('SELECT value FROM entries');
    expect(raw[0].value).toBeNull();
    expect(JSON.stringify(store.docs())).not.toContain('4321');
  });

  it('toggling sensitive encrypts and decrypts existing values, undoable', async () => {
    const { store } = await makeStore();
    await run(store, '+ wifi home: abc123');
    const wifi = store.categoryByKey('wifi')!;
    await store.setCategorySensitive(wifi.id, true);
    expect(store.getState().entries[0].value).toBeNull();
    await store.undo();
    expect(store.getState().entries[0].value).toBe('abc123');
  });

  it("where's-what keeps history and offers frequent locations as chips", async () => {
    const { store } = await makeStore();
    for (const loc of ['sofa', 'kitchen', 'sofa', 'hallway', 'sofa', 'kitchen', 'desk']) await run(store, `+ keys ${loc}`);
    const keys = store.categoryByKey('key')!;
    expect(keys.type).toBe('place');
    expect(store.placeHistory(keys.id)[0].value).toBe('desk');
    expect(store.placeChips(keys.id)).toEqual(['sofa', 'kitchen', 'hallway']);
    // context mode: plain text moves the keys
    await run(store, 'sofa', { kind: 'category', key: 'key' });
    expect(store.placeHistory(keys.id)[0].value).toBe('sofa');
  });

  it('delete entry and undo', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs, milk');
    const eggs = store.getState().entries.find((e) => e.value === 'eggs')!;
    await store.deleteEntry(eggs.id);
    expect(store.getState().entries.map((e) => e.value)).toEqual(['milk']);
    await store.undo();
    expect(store.getState().entries.map((e) => e.value)).toEqual(['eggs', 'milk']);
  });

  it('delete category and undo; undo refuses to create a duplicate', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs');
    const g = store.categoryByKey('grocery')!;
    await store.deleteCategory(g.id);
    expect(store.getState().categories).toHaveLength(0);
    await run(store, '+ groceries jam'); // recreate the same name
    await store.undo(); // undoes the recreate
    await expect(store.undo()).resolves.toBe('Deleted groceries');
    expect(store.getState().categories.map((c) => c.name)).toEqual(['groceries']);
    expect(store.getState().entries.map((e) => e.value)).toEqual(['eggs']);
  });

  it('notes with timestamps and undo', async () => {
    const { store } = await makeStore();
    await store.addNote('called landlord');
    expect(store.notesIn(null).map((n) => n.text)).toEqual(['called landlord']);
    await store.undo();
    expect(store.notesIn(null)).toEqual([]);
  });

  it('user aliases resolve writes and reads', async () => {
    const { store } = await makeStore();
    await run(store, '+ medicine aspirin');
    await store.addAlias('meds', 'medicine');
    await run(store, '+ meds ibuprofen');
    expect(store.getState().categories).toHaveLength(1);
    expect(store.getState().entries.map((e) => e.value)).toEqual(['aspirin', 'ibuprofen']);
  });

  it('rename refuses to create a duplicate name', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs');
    await run(store, '+ todo call mom');
    const todo = store.categoryByKey('todo')!;
    const out = await store.renameCategory(todo.id, 'Groceries');
    expect(out.undoable).toBe(false);
    expect(store.getState().categories).toHaveLength(2);
  });

  it('export → delete all → import round-trips, and delete all is undoable', async () => {
    const { store } = await makeStore();
    await run(store, '+ groceries eggs, olive oil');
    await run(store, '+pw bankpin2 4321');
    await store.addNote('called landlord');
    const file = await store.exportAll();
    expect(JSON.stringify(file)).toContain('4321');

    await store.deleteAll();
    expect(store.getState().categories).toHaveLength(0);
    await store.undo();
    expect(store.getState().categories).toHaveLength(2);

    await store.deleteAll();
    await store.importAll(JSON.parse(JSON.stringify(file)));
    expect(store.getState().categories.map((c) => c.name).sort()).toEqual(['groceries', 'passwords']);
    const pw = store.categoryByKey('password')!;
    expect(pw.sensitive).toBe(true);
    expect(await store.reveal(store.entriesOf(pw.id)[0])).toBe('4321');
    expect(store.notesIn(null)).toHaveLength(1);

    // importing again adds nothing
    const again = await store.importAll(file);
    expect(again.message).toBe('Imported 0 entries, 0 notes');
  });

  it('rejects files that are not exports', async () => {
    const { store } = await makeStore();
    expect((await store.importAll({ foo: 1 })).undoable).toBe(false);
  });

  it('settings persist', async () => {
    const { store, db } = await makeStore();
    await store.setSetting('theme', 'dark');
    const s2 = new Store(db, fakeCrypto);
    await s2.init();
    expect(s2.getState().settings.theme).toBe('dark');
    expect(s2.getState().settings.animations).toBe('smooth');
  });

  it('purges soft-deleted rows after 24 hours', async () => {
    const { store, db } = await makeStore();
    await run(store, '+ groceries eggs');
    await store.deleteEntry(store.getState().entries[0].id);
    clock += 25 * 3600 * 1000;
    const s2 = new Store(db, fakeCrypto, () => clock);
    await s2.init();
    const rows = await db.all('SELECT * FROM entries');
    expect(rows).toHaveLength(0);
  });
});
