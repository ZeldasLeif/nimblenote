import { BUILTIN_ALIASES } from '../aliases';
import { buildDocs, type CategoryLite, type EntryLite } from '../docs';
import { confidentBest, search } from '../match';
import { nameKey } from '../normalize';
import { parse } from '../parse';
import { catalog } from './helpers';

const aliases = new Map(BUILTIN_ALIASES.map(([a, t]) => [nameKey(a), t] as [string, string]));

const cats: CategoryLite[] = [
  { id: 1, key: 'birthday', name: 'birthdays', type: 'fact', sensitive: false, updatedAt: 1 },
  { id: 2, key: 'grocery', name: 'groceries', type: 'list', sensitive: false, updatedAt: 2 },
  { id: 3, key: 'key', name: 'keys', type: 'place', sensitive: false, updatedAt: 3 },
  { id: 4, key: 'password', name: 'passwords', type: 'fact', sensitive: true, updatedAt: 4 },
  { id: 5, key: 'bank', name: 'bank', type: 'fact', sensitive: false, updatedAt: 5 },
];
const entries: EntryLite[] = [
  { id: 10, categoryId: 1, key: 'dad', value: '12.03.1960', sensitive: false, createdAt: 10 },
  { id: 11, categoryId: 1, key: 'mom', value: '01.05.1962', sensitive: false, createdAt: 11 },
  { id: 20, categoryId: 2, key: null, value: 'eggs', sensitive: false, createdAt: 20 },
  { id: 21, categoryId: 2, key: null, value: 'olive oil', sensitive: false, createdAt: 21 },
  { id: 22, categoryId: 2, key: null, value: 'toilet paper', sensitive: false, createdAt: 22 },
  { id: 30, categoryId: 3, key: null, value: 'kitchen', sensitive: false, createdAt: 30 },
  { id: 31, categoryId: 3, key: null, value: 'sofa', sensitive: false, createdAt: 31 },
  { id: 40, categoryId: 4, key: 'bankpin2', value: null, sensitive: true, createdAt: 40 },
  { id: 50, categoryId: 5, key: 'pin', value: '4533', sensitive: false, createdAt: 50 },
];
const notes = [{ id: 1, text: 'called landlord about the heating', createdAt: 60 }];
const docs = buildDocs(cats, entries, notes, aliases);
const cat = catalog();

function best(input: string) {
  const cmd = parse(input, cat);
  if (cmd.kind !== 'read') throw new Error(cmd.kind);
  return confidentBest(search(docs, cmd.tokens))?.doc.id ?? null;
}

describe('forgiving reads', () => {
  it('birthday dad, dad birthday and the full question all return the same entry', () => {
    expect(best('birthday dad')).toBe('e:10');
    expect(best('dad birthday')).toBe('e:10');
    expect(best("when is my dad's birthday?")).toBe('e:10');
    expect(best('Dads birthdays')).toBe('e:10');
  });

  it('typing a category name returns the category', () => {
    expect(best('groceries')).toBe('c:2');
    expect(best('grocery')).toBe('c:2');
    expect(best('shopping')).toBe('c:2'); // built-in alias
  });

  it('keys / where keys return the keys place', () => {
    expect(best('keys')).toBe('c:3');
    expect(best('where keys')).toBe('c:3');
    expect(best('where are my keys?')).toBe('c:3');
  });

  it('aliases: pw, password and passwords hit the same category', () => {
    expect(best('pw')).toBe('c:4');
    expect(best('password')).toBe('c:4');
    expect(best('passwords')).toBe('c:4');
  });

  it('list items are found by their text', () => {
    expect(best('olive oil')).toBe('e:21');
    expect(best('toilet paper')).toBe('e:22');
    expect(best('groceries eggs')).toBe('e:20');
  });

  it('partial typing of a unique name already matches', () => {
    expect(best('grocerie')).toBe('c:2');
    expect(best('dad birthd')).toBe('e:10');
    expect(best('birthday da')).toBeNull(); // two letters are not enough to be confident
  });

  it('weak or ambiguous matches are not shown live', () => {
    expect(best('birthday')).toBe('c:1');
    expect(best('sofa')).toBeNull(); // only a location word
    expect(best('landlord')).toBeNull(); // notes never drive the live card
    expect(best('xyz')).toBeNull();
    expect(best('b')).toBeNull();
  });

  it('sensitive values are never indexed', () => {
    const all = docs.flatMap((d) => [...d.strong, ...d.weak]);
    expect(all).not.toContain('4321');
    expect(search(docs, ['bankpin2'])[0].doc.id).toBe('e:40');
  });

  it('Enter-results include weaker matches like notes', () => {
    const ids = search(docs, ['landlord']).map((r) => r.doc.id);
    expect(ids).toContain('n:1');
  });

  it('every query token must match for structured docs', () => {
    const ids = search(docs, ['bank', 'pin']).map((r) => r.doc.id);
    expect(ids[0]).toBe('e:50');
    expect(ids).not.toContain('c:1');
  });

  it('is fast enough for per-keystroke use', () => {
    const many: EntryLite[] = [];
    for (let i = 0; i < 5000; i++) many.push({ id: 1000 + i, categoryId: 2, key: null, value: `item number ${i} thing`, sensitive: false, createdAt: i });
    const big = buildDocs(cats, [...entries, ...many], notes, aliases);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) search(big, ['birthday', 'dad']);
    expect((Date.now() - t0) / 20).toBeLessThan(20);
  });
});
