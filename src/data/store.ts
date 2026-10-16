// The app's single source of truth. SQLite persists; memory serves every keystroke.
// Every write and delete registers an undo step. Deletes are soft and purged after 24 h.

import { BUILTIN_ALIASES } from '../core/aliases';
import { buildDocs } from '../core/docs';
import type { Doc } from '../core/match';
import { clean, nameKey } from '../core/normalize';
import type { Catalog, CatalogCategory, CategoryType, Command } from '../core/types';
import type { CryptoAdapter, DbAdapter, SqlParam } from './adapter';
import { migrate } from './schema';

export type ThemePref = 'system' | 'light' | 'dark';
export type AnimationPref = 'smooth' | 'minimal' | 'off';

export interface Settings {
  theme: ThemePref;
  liveAnswers: boolean;
  animations: AnimationPref;
  lockEnabled: boolean;
  reverseGeocode: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system', liveAnswers: true, animations: 'smooth', lockEnabled: false, reverseGeocode: true,
};

export interface Category {
  id: number; key: string; name: string; type: CategoryType; splitOnSpaces: boolean; sensitive: boolean;
  photoUri: string | null; createdAt: number; updatedAt: number;
  /** Parent list of a sub-list (one level), else null. */
  parentId: number | null;
}
export interface Entry {
  id: number; categoryId: number; key: string | null;
  /** Plain value; null when the value is encrypted (see `secret`). */
  value: string | null;
  secret: string | null;
  /** Optional quantity for list items ("5", "1kg"). */
  amount: string | null;
  sensitive: boolean; position: number; createdAt: number; updatedAt: number;
}
export interface Note { id: number; text: string; createdAt: number }
export interface Alias { alias: string; target: string; builtin: boolean }
export interface Timer { id: number; label: string; firesAt: number; notificationId: string | null; createdAt: number; done: boolean }

export interface State {
  ready: boolean;
  version: number;
  categories: Category[];
  entries: Entry[];
  notes: Note[];
  aliases: Alias[];
  timers: Timer[];
  settings: Settings;
}

export interface Outcome {
  message: string;
  categoryId?: number;
  highlight?: number[];
  undoable: boolean;
}

type WriteCommand = Extract<Command, { kind: 'write' }>;
type UndoStep = { label: string; run: () => Promise<void> };

const PURGE_AFTER_MS = 24 * 3600 * 1000;
const DEFAULT_SENSITIVE = new Set(['password']);

interface CatRow { id: number; key: string; name: string; type: CategoryType; split_on_spaces: number; sensitive: number; photo_uri: string | null; created_at: number; updated_at: number; parent_id: number | null }
interface EntryRow { id: number; category_id: number; key: string | null; value: string | null; value_enc: string | null; amount: string | null; sensitive: number; position: number; created_at: number; updated_at: number }

const toCat = (r: CatRow): Category => ({
  id: r.id, key: r.key, name: r.name, type: r.type, splitOnSpaces: !!r.split_on_spaces, sensitive: !!r.sensitive,
  photoUri: r.photo_uri, createdAt: r.created_at, updatedAt: r.updated_at, parentId: r.parent_id ?? null,
});
const toEntry = (r: EntryRow): Entry => ({
  id: r.id, categoryId: r.category_id, key: r.key, value: r.value, secret: r.value_enc, amount: r.amount ?? null, sensitive: !!r.sensitive,
  position: r.position, createdAt: r.created_at, updatedAt: r.updated_at,
});

function sameText(a: string | null, b: string | null): boolean {
  return clean(a ?? '').toLowerCase() === clean(b ?? '').toLowerCase();
}

export class Store {
  private state: State = {
    ready: false, version: 0, categories: [], entries: [], notes: [], aliases: [], timers: [], settings: DEFAULT_SETTINGS,
  };
  private listeners = new Set<() => void>();
  private undoStack: UndoStep[] = [];
  private derivedVersion = -1;
  private catalogCache: Catalog = { categories: new Map(), aliases: new Map() };
  private docsCache: Doc[] = [];

  constructor(private db: DbAdapter, private crypto: CryptoAdapter, private now: () => number = Date.now) {}

  // ---------- lifecycle ----------

  async init(): Promise<void> {
    await migrate(this.db);
    await this.purge();
    for (const [alias, target] of BUILTIN_ALIASES) {
      await this.db.run('INSERT OR IGNORE INTO aliases (alias, target, builtin) VALUES (?, ?, 1)', [nameKey(alias), target]);
    }
    await this.reload();
  }

  private async purge(): Promise<void> {
    const cutoff = this.now() - PURGE_AFTER_MS;
    await this.db.run('DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
    await this.db.run('DELETE FROM entries WHERE category_id IN (SELECT id FROM categories WHERE deleted_at IS NOT NULL AND deleted_at < ?)', [cutoff]);
    await this.db.run('DELETE FROM categories WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
    await this.db.run('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
    await this.db.run('DELETE FROM timers WHERE done = 1 AND fires_at < ?', [cutoff]);
  }

  async reload(): Promise<void> {
    const cats = await this.db.all<CatRow>('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY updated_at DESC');
    const entries = await this.db.all<EntryRow>(
      `SELECT e.* FROM entries e JOIN categories c ON c.id = e.category_id
       WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY e.position, e.created_at`,
    );
    const notes = await this.db.all<{ id: number; text: string; created_at: number }>(
      'SELECT id, text, created_at FROM notes WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
    const aliases = await this.db.all<{ alias: string; target: string; builtin: number }>('SELECT * FROM aliases ORDER BY alias');
    const timers = await this.db.all<{ id: number; label: string; fires_at: number; notification_id: string | null; created_at: number; done: number }>(
      'SELECT * FROM timers ORDER BY fires_at',
    );
    const settingsRows = await this.db.all<{ key: string; value: string }>('SELECT * FROM settings');
    const settings: Settings = { ...DEFAULT_SETTINGS };
    for (const r of settingsRows) {
      try { (settings as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value); } catch { /* ignore bad row */ }
    }
    this.setState({
      ready: true,
      categories: cats.map(toCat),
      entries: entries.map(toEntry),
      notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at })),
      aliases: aliases.map((a) => ({ alias: a.alias, target: a.target, builtin: !!a.builtin })),
      timers: timers.map((t) => ({ id: t.id, label: t.label, firesAt: t.fires_at, notificationId: t.notification_id, createdAt: t.created_at, done: !!t.done })),
      settings,
    });
  }

  // ---------- subscription ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): State => this.state;

  private setState(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const l of this.listeners) l();
  }

  // ---------- derived (memoized per version) ----------

  private derive(): void {
    if (this.derivedVersion === this.state.version) return;
    const s = this.state;
    const categories = new Map<string, CatalogCategory>();
    const byId = new Map(s.categories.map((c) => [c.id, c] as const));
    for (const c of s.categories) {
      const parentKey = c.parentId !== null ? byId.get(c.parentId)?.key ?? null : null;
      categories.set(c.key, { key: c.key, name: c.name, type: c.type, splitOnSpaces: c.splitOnSpaces, parentKey });
    }
    const aliases = new Map<string, string>();
    for (const a of s.aliases) aliases.set(a.alias, a.target);
    // Items of top-level lists, so "+ pancakes milk" can turn the item "pancakes" into a sub-list.
    const items = new Map<string, string[]>();
    for (const e of s.entries) {
      const c = byId.get(e.categoryId);
      if (!c || c.type !== 'list' || c.parentId !== null || c.sensitive || e.value === null) continue;
      const k = clean(e.value).toLowerCase();
      const owners = items.get(k) ?? [];
      if (!owners.includes(c.key)) owners.push(c.key);
      items.set(k, owners);
    }
    this.catalogCache = { categories, aliases, items };
    this.docsCache = buildDocs(
      s.categories.map((c) => ({ id: c.id, key: c.key, name: c.name, type: c.type, sensitive: c.sensitive, updatedAt: c.updatedAt, parentId: c.parentId })),
      s.entries.map((e) => ({ id: e.id, categoryId: e.categoryId, key: e.key, value: e.value, sensitive: e.sensitive, createdAt: e.createdAt })),
      s.notes,
      aliases,
    );
    this.derivedVersion = s.version;
  }
  catalog(): Catalog { this.derive(); return this.catalogCache; }
  docs(): Doc[] { this.derive(); return this.docsCache; }

  // ---------- queries ----------

  categoryByKey(key: string): Category | undefined { return this.state.categories.find((c) => c.key === key); }
  categoryById(id: number): Category | undefined { return this.state.categories.find((c) => c.id === id); }
  entryById(id: number): Entry | undefined { return this.state.entries.find((e) => e.id === id); }
  entriesOf(categoryId: number): Entry[] { return this.state.entries.filter((e) => e.categoryId === categoryId); }
  childrenOf(categoryId: number): Category[] {
    return this.state.categories.filter((c) => c.parentId === categoryId).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Place history, newest first. */
  placeHistory(categoryId: number): Entry[] {
    return this.entriesOf(categoryId).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Most frequent recent locations for one-tap chips, excluding the current one. */
  placeChips(categoryId: number, limit = 5): string[] {
    const hist = this.placeHistory(categoryId);
    const current = hist[0]?.value ?? null;
    const counts = new Map<string, { text: string; n: number; last: number }>();
    for (const e of hist.slice(0, 30)) {
      if (!e.value) continue;
      const k = e.value.toLowerCase();
      const c = counts.get(k);
      if (c) c.n++;
      else counts.set(k, { text: e.value, n: 1, last: e.createdAt });
    }
    return [...counts.values()]
      .filter((c) => !sameText(c.text, current))
      .sort((a, b) => b.n - a.n || b.last - a.last)
      .slice(0, limit)
      .map((c) => c.text);
  }

  notesIn(range: { start: number; end: number } | null, limit = 100): Note[] {
    const list = range ? this.state.notes.filter((n) => n.createdAt >= range.start && n.createdAt < range.end) : this.state.notes;
    return list.slice(0, limit);
  }

  async reveal(entry: Entry): Promise<string> {
    if (entry.value !== null) return entry.value;
    if (!entry.secret) return '';
    return this.crypto.decrypt(entry.secret);
  }

  // ---------- undo ----------

  canUndo(): boolean { return this.undoStack.length > 0; }
  private pushUndo(label: string, run: () => Promise<void>): void {
    this.undoStack.push({ label, run });
    if (this.undoStack.length > 50) this.undoStack.shift();
  }
  async undo(): Promise<string | null> {
    const step = this.undoStack.pop();
    if (!step) return null;
    await step.run();
    await this.reload();
    return step.label;
  }

  // ---------- writes ----------

  private async sealValue(value: string | null, sensitive: boolean): Promise<{ value: string | null; enc: string | null }> {
    if (value === null || !sensitive) return { value, enc: null };
    return { value: null, enc: await this.crypto.encrypt(value) };
  }

  private async insertCategory(name: string, key: string, type: CategoryType, parentId: number | null = null): Promise<number> {
    const t = this.now();
    const sensitive = DEFAULT_SENSITIVE.has(key) ? 1 : 0;
    const r = await this.db.run(
      'INSERT INTO categories (key, name, type, sensitive, created_at, updated_at, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [key, name, type, sensitive, t, t, parentId],
    );
    return r.lastInsertRowId;
  }

  private async insertEntry(categoryId: number, key: string | null, value: string, sensitive: boolean, position: number, amount: string | null = null): Promise<number> {
    const t = this.now();
    const sealed = await this.sealValue(value, sensitive);
    const r = await this.db.run(
      'INSERT INTO entries (category_id, key, value, value_enc, amount, sensitive, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [categoryId, key, sealed.value, sealed.enc, amount, sensitive ? 1 : 0, position, t, t],
    );
    return r.lastInsertRowId;
  }

  private async touchCategory(id: number): Promise<void> {
    await this.db.run('UPDATE categories SET updated_at = ? WHERE id = ?', [this.now(), id]);
  }

  async applyWrite(cmd: WriteCommand): Promise<Outcome> {
    const { category: ref, payload } = cmd;
    let cat = this.categoryByKey(ref.key);
    let createdCategoryId: number | null = null;
    let createdParentId: number | null = null;
    let promotedEntryId: number | null = null;
    const inserted: number[] = [];
    const updated: Array<{ id: number; value: string | null; enc: string | null; amount: string | null; updatedAt: number }> = [];
    let message = '';

    await this.db.transaction(async () => {
      if (!cat) {
        let parentId: number | null = null;
        if (ref.parent) {
          const parent = this.categoryByKey(ref.parent.key);
          parentId = parent?.id ?? (createdParentId = await this.insertCategory(ref.parent.name, ref.parent.key, 'list'));
          if (ref.promote && parent) {
            // The item "pancakes" in the parent list becomes the sub-list "pancakes".
            const item = this.entriesOf(parent.id).find((e) => sameText(e.value, ref.name));
            if (item) {
              promotedEntryId = item.id;
              await this.db.run('UPDATE entries SET deleted_at = ? WHERE id = ?', [this.now(), item.id]);
            }
          }
          await this.touchCategory(parentId);
        }
        createdCategoryId = await this.insertCategory(ref.name, ref.key, ref.type, parentId);
      }
      const catId = cat?.id ?? createdCategoryId!;
      const sensitive = cat?.sensitive ?? DEFAULT_SENSITIVE.has(ref.key);
      const existing = cat ? this.entriesOf(cat.id) : [];

      if (payload.type === 'list') {
        const items = payload.items;
        let pos = existing.reduce((m, e) => Math.max(m, e.position), 0);
        const skipped: string[] = [];
        const amounted: string[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (items.findIndex((x) => sameText(x.text, item.text)) !== i) { skipped.push(item.text); continue; }
          const same = existing.find((e) => sameText(e.value, item.text));
          if (same) {
            // Already on the list: a new amount updates it, otherwise nothing to do.
            if (item.amount !== null && item.amount !== same.amount) {
              updated.push({ id: same.id, value: same.value, enc: same.secret, amount: same.amount, updatedAt: same.updatedAt });
              await this.db.run('UPDATE entries SET amount = ?, updated_at = ? WHERE id = ?', [item.amount, this.now(), same.id]);
              amounted.push(`${item.text} ${item.amount}`);
            } else {
              skipped.push(item.text);
            }
            continue;
          }
          inserted.push(await this.insertEntry(catId, null, item.text, sensitive, ++pos, item.amount));
        }
        const added = inserted.length;
        const parts = [
          createdCategoryId && added === 0 && amounted.length === 0 ? `Created list ${ref.name}` : `Added ${added} to ${ref.name}`,
          amounted.length ? `updated ${amounted.join(', ')}` : '',
          skipped.length ? `already there: ${skipped.join(', ')}` : '',
        ];
        message = parts.filter(Boolean).join(' · ');
      } else if (payload.type === 'place') {
        inserted.push(await this.insertEntry(catId, null, payload.location, sensitive, 0));
        message = `${ref.name} → ${payload.location}`;
      } else {
        const match = existing.find((e) => sameText(e.key, payload.key));
        if (match) {
          updated.push({ id: match.id, value: match.value, enc: match.secret, amount: match.amount, updatedAt: match.updatedAt });
          const sealed = await this.sealValue(payload.value, sensitive || match.sensitive);
          await this.db.run('UPDATE entries SET value = ?, value_enc = ?, updated_at = ? WHERE id = ?', [sealed.value, sealed.enc, this.now(), match.id]);
          message = `Updated ${ref.name}${payload.key ? ` ${payload.key}` : ''}`;
        } else {
          const pos = existing.reduce((m, e) => Math.max(m, e.position), 0) + 1;
          inserted.push(await this.insertEntry(catId, payload.key, payload.value, sensitive, pos));
          message = `Saved ${ref.name}${payload.key ? ` ${payload.key}` : ''}`;
        }
      }
      if (cat) await this.touchCategory(cat.id);
    });

    const catId = cat?.id ?? createdCategoryId!;
    const changed = inserted.length > 0 || updated.length > 0 || createdCategoryId !== null;
    if (changed) {
      this.pushUndo(message, async () => {
        const t = this.now();
        await this.db.transaction(async () => {
          for (const id of inserted) await this.db.run('UPDATE entries SET deleted_at = ? WHERE id = ?', [t, id]);
          for (const u of updated) {
            await this.db.run('UPDATE entries SET value = ?, value_enc = ?, amount = ?, updated_at = ? WHERE id = ?', [u.value, u.enc, u.amount, u.updatedAt, u.id]);
          }
          if (createdCategoryId !== null) await this.db.run('UPDATE categories SET deleted_at = ? WHERE id = ?', [t, createdCategoryId]);
          if (createdParentId !== null) await this.db.run('UPDATE categories SET deleted_at = ? WHERE id = ?', [t, createdParentId]);
          if (promotedEntryId !== null) await this.db.run('UPDATE entries SET deleted_at = NULL WHERE id = ?', [promotedEntryId]);
        });
      });
    }
    await this.reload();
    return { message, categoryId: catId, highlight: [...inserted, ...updated.map((u) => u.id)], undoable: changed };
  }

  /** Returns the category's id, creating it (undoably) if needed. */
  async ensureCategory(ref: { key: string; name: string; type: CategoryType }): Promise<number> {
    const existing = this.categoryByKey(ref.key);
    if (existing) return existing.id;
    const id = await this.insertCategory(ref.name, ref.key, ref.type);
    this.pushUndo(`Created ${ref.name}`, async () => {
      await this.db.run('UPDATE categories SET deleted_at = ? WHERE id = ?', [this.now(), id]);
    });
    await this.reload();
    return id;
  }

  async addNote(text: string): Promise<Outcome> {
    const r = await this.db.run('INSERT INTO notes (text, created_at) VALUES (?, ?)', [text, this.now()]);
    const id = r.lastInsertRowId;
    this.pushUndo('Note saved', async () => { await this.db.run('UPDATE notes SET deleted_at = ? WHERE id = ?', [this.now(), id]); });
    await this.reload();
    return { message: 'Note saved', highlight: [id], undoable: true };
  }

  // ---------- deletes and edits (all undoable) ----------

  private async softDelete(table: 'entries' | 'notes' | 'categories', id: number, label: string): Promise<Outcome> {
    await this.db.run(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`, [this.now(), id]);
    this.pushUndo(label, async () => { await this.db.run(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`, [id]); });
    await this.reload();
    return { message: label, undoable: true };
  }

  deleteEntry(id: number): Promise<Outcome> {
    const e = this.entryById(id);
    const label = e?.key ? `Deleted ${e.key}` : e?.value ? `Deleted ${e.value}` : 'Deleted';
    return this.softDelete('entries', id, label);
  }
  deleteNote(id: number): Promise<Outcome> { return this.softDelete('notes', id, 'Deleted note'); }

  async deleteCategory(id: number): Promise<Outcome> {
    const c = this.categoryById(id);
    if (!c) return { message: 'Not found', undoable: false };
    // Deleting a list also removes its sub-lists; undo brings them all back.
    const family = [c, ...this.childrenOf(id)];
    const t = this.now();
    await this.db.transaction(async () => {
      for (const x of family) await this.db.run('UPDATE categories SET deleted_at = ? WHERE id = ?', [t, x.id]);
    });
    this.pushUndo(`Deleted ${c.name}`, async () => {
      // Never create a duplicate: if a name was reused meanwhile, undo is refused.
      const clash = family.find((x) => this.categoryByKey(x.key));
      if (clash) throw new Error(`${clash.name} exists again; delete it first to undo`);
      await this.db.transaction(async () => {
        for (const x of family) await this.db.run('UPDATE categories SET deleted_at = NULL WHERE id = ?', [x.id]);
      });
    });
    await this.reload();
    return { message: `Deleted ${c.name}`, undoable: true };
  }

  async updateEntry(id: number, patch: { key?: string | null; value?: string; amount?: string | null }): Promise<Outcome> {
    const e = this.entryById(id);
    if (!e) return { message: 'Not found', undoable: false };
    const cat = this.categoryById(e.categoryId);
    const before = { key: e.key, value: e.value, enc: e.secret, amount: e.amount, updatedAt: e.updatedAt };
    const nextKey = patch.key !== undefined ? patch.key : e.key;
    const nextAmount = patch.amount !== undefined ? patch.amount : e.amount;
    let value = e.value;
    let enc = e.secret;
    if (patch.value !== undefined) {
      const sealed = await this.sealValue(patch.value, e.sensitive || !!cat?.sensitive);
      value = sealed.value;
      enc = sealed.enc;
    }
    await this.db.run('UPDATE entries SET key = ?, value = ?, value_enc = ?, amount = ?, updated_at = ? WHERE id = ?', [nextKey, value, enc, nextAmount, this.now(), id]);
    this.pushUndo('Edited', async () => {
      await this.db.run('UPDATE entries SET key = ?, value = ?, value_enc = ?, amount = ?, updated_at = ? WHERE id = ?', [before.key, before.value, before.enc, before.amount, before.updatedAt, id]);
    });
    await this.reload();
    return { message: 'Saved', highlight: [id], undoable: true };
  }

  private async updateCategoryColumns(id: number, cols: Record<string, SqlParam>, label: string): Promise<Outcome> {
    const c = this.categoryById(id);
    if (!c) return { message: 'Not found', undoable: false };
    const rows = await this.db.all<Record<string, SqlParam>>(`SELECT ${Object.keys(cols).join(', ')} FROM categories WHERE id = ?`, [id]);
    const before = rows[0];
    const set = (vals: Record<string, SqlParam>) => this.db.run(
      `UPDATE categories SET ${Object.keys(vals).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...Object.values(vals), this.now(), id],
    );
    await set(cols);
    this.pushUndo(label, async () => { await set(before); });
    await this.reload();
    return { message: label, categoryId: id, undoable: true };
  }

  async renameCategory(id: number, name: string): Promise<Outcome> {
    const key = nameKey(name);
    if (!key) return { message: 'Name is empty', undoable: false };
    const clash = this.categoryByKey(key);
    if (clash && clash.id !== id) return { message: `${clash.name} already exists`, undoable: false };
    return this.updateCategoryColumns(id, { name: clean(name), key }, `Renamed to ${clean(name)}`);
  }
  setCategoryType(id: number, type: CategoryType): Promise<Outcome> {
    return this.updateCategoryColumns(id, { type }, `Now a ${type}`);
  }
  setSplitOnSpaces(id: number, on: boolean): Promise<Outcome> {
    return this.updateCategoryColumns(id, { split_on_spaces: on ? 1 : 0 }, on ? 'Splits on spaces' : 'Splits on commas and "and"');
  }
  setPhoto(id: number, uri: string | null): Promise<Outcome> {
    return this.updateCategoryColumns(id, { photo_uri: uri }, uri ? 'Photo attached' : 'Photo removed');
  }

  /** Marks a category sensitive (encrypting its values) or not (decrypting them). Caller must authenticate first. */
  async setCategorySensitive(id: number, sensitive: boolean): Promise<Outcome> {
    const c = this.categoryById(id);
    if (!c) return { message: 'Not found', undoable: false };
    const entries = this.entriesOf(id);
    const apply = async (on: boolean) => {
      await this.db.transaction(async () => {
        await this.db.run('UPDATE categories SET sensitive = ?, updated_at = ? WHERE id = ?', [on ? 1 : 0, this.now(), id]);
        for (const e of entries) {
          const plain = e.value ?? (e.secret ? await this.crypto.decrypt(e.secret) : null);
          const sealed = await this.sealValue(plain, on);
          await this.db.run('UPDATE entries SET value = ?, value_enc = ?, sensitive = ? WHERE id = ?', [sealed.value, sealed.enc, on ? 1 : 0, e.id]);
        }
      });
    };
    await apply(sensitive);
    const label = sensitive ? `${c.name} is now hidden and encrypted` : `${c.name} is no longer hidden`;
    this.pushUndo(label, () => apply(!sensitive));
    await this.reload();
    return { message: label, categoryId: id, undoable: true };
  }

  // ---------- aliases ----------

  async addAlias(alias: string, target: string): Promise<Outcome> {
    const a = nameKey(alias);
    if (!a || !clean(target)) return { message: 'Alias and target are required', undoable: false };
    if (a === nameKey(target)) return { message: 'An alias cannot point to itself', undoable: false };
    const prev = this.state.aliases.find((x) => x.alias === a);
    await this.db.run('INSERT OR REPLACE INTO aliases (alias, target, builtin) VALUES (?, ?, 0)', [a, clean(target)]);
    this.pushUndo(`Alias ${a}`, async () => {
      if (prev) await this.db.run('INSERT OR REPLACE INTO aliases (alias, target, builtin) VALUES (?, ?, ?)', [prev.alias, prev.target, prev.builtin ? 1 : 0]);
      else await this.db.run('DELETE FROM aliases WHERE alias = ?', [a]);
    });
    await this.reload();
    return { message: `${a} → ${clean(target)}`, undoable: true };
  }

  async removeAlias(alias: string): Promise<Outcome> {
    const prev = this.state.aliases.find((x) => x.alias === alias);
    if (!prev) return { message: 'Not found', undoable: false };
    await this.db.run('DELETE FROM aliases WHERE alias = ?', [alias]);
    this.pushUndo(`Removed alias ${alias}`, async () => {
      await this.db.run('INSERT OR REPLACE INTO aliases (alias, target, builtin) VALUES (?, ?, ?)', [prev.alias, prev.target, prev.builtin ? 1 : 0]);
    });
    await this.reload();
    return { message: `Removed alias ${alias}`, undoable: true };
  }

  // ---------- timers ----------

  async addTimer(label: string, firesAt: number, notificationId: string | null): Promise<Timer> {
    const r = await this.db.run('INSERT INTO timers (label, fires_at, notification_id, created_at) VALUES (?, ?, ?, ?)', [label, firesAt, notificationId, this.now()]);
    await this.reload();
    return this.state.timers.find((t) => t.id === r.lastInsertRowId)!;
  }
  async finishTimer(id: number): Promise<void> {
    await this.db.run('UPDATE timers SET done = 1 WHERE id = ?', [id]);
    await this.reload();
  }

  // ---------- settings ----------

  async setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    this.setState({ settings: { ...this.state.settings, [key]: value } });
  }

  // ---------- export / import / delete all ----------

  async exportAll(): Promise<ExportFile> {
    const categories: ExportFile['categories'] = [];
    for (const c of this.state.categories) {
      const entries = [];
      for (const e of this.entriesOf(c.id)) entries.push({ key: e.key, value: await this.reveal(e), amount: e.amount, createdAt: e.createdAt });
      const parent = c.parentId !== null ? this.categoryById(c.parentId)?.name ?? null : null;
      categories.push({ name: c.name, type: c.type, splitOnSpaces: c.splitOnSpaces, sensitive: c.sensitive, parent, entries });
    }
    return {
      app: 'NimbleNote', format: 1, exportedAt: new Date(this.now()).toISOString(),
      categories,
      notes: this.state.notes.map((n) => ({ text: n.text, createdAt: n.createdAt })),
      aliases: this.state.aliases.filter((a) => !a.builtin).map((a) => ({ alias: a.alias, target: a.target })),
      settings: this.state.settings,
    };
  }

  /** Merges an export into current data: never duplicates categories, skips identical entries. Undoable. */
  async importAll(data: unknown): Promise<Outcome> {
    const file = parseExport(data);
    if (!file) return { message: 'Not a NimbleNote export file', undoable: false };
    const createdCats: number[] = [];
    const insertedEntries: number[] = [];
    const insertedNotes: number[] = [];
    await this.db.transaction(async () => {
      for (const c of file.categories) {
        const key = nameKey(c.name);
        if (!key) continue;
        let cat = this.categoryByKey(key);
        let catId = cat?.id;
        if (!catId) {
          catId = await this.insertCategory(c.name, key, c.type);
          if (c.sensitive) await this.db.run('UPDATE categories SET sensitive = 1 WHERE id = ?', [catId]);
          if (c.splitOnSpaces) await this.db.run('UPDATE categories SET split_on_spaces = 1 WHERE id = ?', [catId]);
          createdCats.push(catId);
        }
        const existing = cat ? this.entriesOf(cat.id) : [];
        const existingPlain = await Promise.all(existing.map(async (e) => ({ key: e.key, value: await this.reveal(e) })));
        const sensitive = cat ? cat.sensitive : c.sensitive;
        let pos = existing.reduce((m, e) => Math.max(m, e.position), 0);
        for (const e of c.entries) {
          if (existingPlain.some((x) => sameText(x.key, e.key) && sameText(x.value, e.value))) continue;
          const id = await this.insertEntry(catId, e.key, e.value, sensitive, ++pos, e.amount);
          if (e.createdAt) await this.db.run('UPDATE entries SET created_at = ? WHERE id = ?', [e.createdAt, id]);
          insertedEntries.push(id);
        }
      }
      // Link sub-lists to their parents (by name) once every category exists.
      const ids = new Map<string, number>();
      for (const r of await this.db.all<{ id: number; key: string }>('SELECT id, key FROM categories WHERE deleted_at IS NULL')) ids.set(r.key, r.id);
      for (const c of file.categories) {
        if (!c.parent) continue;
        const childId = ids.get(nameKey(c.name));
        const parentId = ids.get(nameKey(c.parent));
        if (childId && parentId && childId !== parentId && createdCats.includes(childId)) {
          await this.db.run('UPDATE categories SET parent_id = ? WHERE id = ?', [parentId, childId]);
        }
      }
      for (const n of file.notes) {
        if (this.state.notes.some((x) => x.text === n.text && x.createdAt === n.createdAt)) continue;
        const r = await this.db.run('INSERT INTO notes (text, created_at) VALUES (?, ?)', [n.text, n.createdAt]);
        insertedNotes.push(r.lastInsertRowId);
      }
      for (const a of file.aliases) {
        await this.db.run('INSERT OR IGNORE INTO aliases (alias, target, builtin) VALUES (?, ?, 0)', [nameKey(a.alias), a.target]);
      }
    });
    const label = `Imported ${insertedEntries.length} entries, ${insertedNotes.length} notes`;
    this.pushUndo(label, async () => {
      const t = this.now();
      await this.db.transaction(async () => {
        for (const id of insertedEntries) await this.db.run('UPDATE entries SET deleted_at = ? WHERE id = ?', [t, id]);
        for (const id of insertedNotes) await this.db.run('UPDATE notes SET deleted_at = ? WHERE id = ?', [t, id]);
        for (const id of createdCats) await this.db.run('UPDATE categories SET deleted_at = ? WHERE id = ?', [t, id]);
      });
    });
    await this.reload();
    return { message: label, undoable: true };
  }

  /** Soft-deletes all categories, entries and notes (undoable until purge). Aliases and settings stay. */
  async deleteAll(): Promise<Outcome> {
    const t = this.now();
    const cats = this.state.categories.map((c) => ({ id: c.id, key: c.key }));
    const noteIds = this.state.notes.map((n) => n.id);
    await this.db.transaction(async () => {
      await this.db.run('UPDATE categories SET deleted_at = ? WHERE deleted_at IS NULL', [t]);
      await this.db.run('UPDATE notes SET deleted_at = ? WHERE deleted_at IS NULL', [t]);
    });
    this.pushUndo('Deleted everything', async () => {
      await this.db.transaction(async () => {
        for (const c of cats) {
          if (this.categoryByKey(c.key)) continue; // name reused since; keep the newer one
          await this.db.run('UPDATE categories SET deleted_at = NULL WHERE id = ?', [c.id]);
        }
        for (const id of noteIds) await this.db.run('UPDATE notes SET deleted_at = NULL WHERE id = ?', [id]);
      });
    });
    await this.reload();
    return { message: 'Deleted everything', undoable: true };
  }
}

export interface ExportFile {
  app: 'NimbleNote';
  format: 1;
  exportedAt: string;
  categories: Array<{ name: string; type: CategoryType; splitOnSpaces: boolean; sensitive: boolean; parent: string | null; entries: Array<{ key: string | null; value: string; amount: string | null; createdAt: number }> }>;
  notes: Array<{ text: string; createdAt: number }>;
  aliases: Array<{ alias: string; target: string }>;
  settings: Settings;
}

function parseExport(data: unknown): ExportFile | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<ExportFile>;
  if (d.app !== 'NimbleNote' || !Array.isArray(d.categories)) return null;
  const types = new Set(['list', 'fact', 'place']);
  const categories = d.categories
    .filter((c) => c && typeof c.name === 'string' && types.has(c.type) && Array.isArray(c.entries))
    .map((c) => ({
      name: c.name, type: c.type, splitOnSpaces: !!c.splitOnSpaces, sensitive: !!c.sensitive,
      parent: typeof c.parent === 'string' ? c.parent : null,
      entries: c.entries
        .filter((e) => e && typeof e.value === 'string')
        .map((e) => ({ key: typeof e.key === 'string' ? e.key : null, value: e.value, amount: typeof e.amount === 'string' ? e.amount : null, createdAt: Number(e.createdAt) || 0 })),
    }));
  const notes = (Array.isArray(d.notes) ? d.notes : [])
    .filter((n) => n && typeof n.text === 'string')
    .map((n) => ({ text: n.text, createdAt: Number(n.createdAt) || Date.now() }));
  const aliases = (Array.isArray(d.aliases) ? d.aliases : []).filter((a) => a && typeof a.alias === 'string' && typeof a.target === 'string');
  return { app: 'NimbleNote', format: 1, exportedAt: String(d.exportedAt ?? ''), categories, notes, aliases, settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) } };
}
