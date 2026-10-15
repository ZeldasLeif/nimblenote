import { needsEnter, parse, parseFact, splitItems } from '../parse';
import type { Command } from '../types';
import { catalog } from './helpers';

const NOW = new Date(2026, 9, 15, 10, 0, 0); // Thu 15 Oct 2026, 10:00 local

function write(cmd: Command) {
  if (cmd.kind !== 'write') throw new Error(`expected write, got ${cmd.kind}: ${JSON.stringify(cmd)}`);
  return cmd;
}

describe('empty input', () => {
  it('is empty for blank and whitespace', () => {
    expect(parse('', catalog()).kind).toBe('empty');
    expect(parse('   ', catalog()).kind).toBe('empty');
  });
});

describe('write prefixes', () => {
  it.each(['+ groceries eggs', '+groceries eggs', 'add groceries eggs', 'new groceries eggs', 'ADD groceries eggs'])(
    '%s is a write',
    (input) => {
      const c = write(parse(input, catalog()));
      expect(c.category.key).toBe('grocery');
      expect(c.payload).toEqual({ type: 'list', items: ['eggs'] });
    },
  );

  it('requires a name', () => {
    expect(parse('+', catalog()).kind).toBe('invalid');
    expect(parse('+   ', catalog()).kind).toBe('invalid');
  });

  it('writes always need Enter; reads and calc do not', () => {
    expect(needsEnter(parse('+ groceries eggs', catalog()))).toBe(true);
    expect(needsEnter(parse('groceries', catalog()))).toBe(false);
    expect(needsEnter(parse('5+5', catalog()))).toBe(false);
    expect(needsEnter(parse('t 5', catalog()))).toBe(true);
    expect(needsEnter(parse('loc', catalog()))).toBe(true);
    expect(needsEnter(parse('photo keys', catalog()))).toBe(true);
  });
});

describe('lists', () => {
  it('splits on commas, keeping multi-word items intact', () => {
    const c = write(parse('+ groceries eggs, milk, olive oil', catalog()));
    expect(c.category.isNew).toBe(true);
    expect(c.category.type).toBe('list');
    expect(c.payload).toEqual({ type: 'list', items: ['eggs', 'milk', 'olive oil'] });
  });

  it('splits on the word "and"', () => {
    const c = write(parse('+ groceries eggs and milk and olive oil', catalog()));
    expect(c.payload).toEqual({ type: 'list', items: ['eggs', 'milk', 'olive oil'] });
  });

  it('keeps "toilet paper" exactly as typed (no autocorrect, no merging)', () => {
    const c = write(parse('+ groceries toilet paper, Olive  Oil', catalog([['groceries', 'list']])));
    expect(c.payload).toEqual({ type: 'list', items: ['toilet paper', 'Olive Oil'] });
  });

  it('does not split on "and" inside words', () => {
    expect(splitItems('sandwich bread, candles')).toEqual(['sandwich bread', 'candles']);
  });

  it('splits on spaces when the list opts in', () => {
    const c = write(parse('+ groceries eggs milk, olive oil', catalog([['groceries', 'list', { splitOnSpaces: true }]])));
    expect(c.payload).toEqual({ type: 'list', items: ['eggs', 'milk', 'olive', 'oil'] });
  });

  it('adds to an existing list instead of creating a duplicate', () => {
    const cat = catalog([['groceries', 'list']]);
    const c = write(parse('+ Groceries bread', cat));
    expect(c.category.isNew).toBe(false);
    expect(c.category.key).toBe('grocery');
    expect(c.category.name).toBe('groceries');
  });

  it('singular/plural of an existing name resolve to the same list', () => {
    const cat = catalog([['groceries', 'list']]);
    expect(write(parse('+ grocery bread', cat)).category.isNew).toBe(false);
  });

  it('"new list groceries" on an existing list adds to it with a note', () => {
    const cat = catalog([['groceries', 'list']]);
    const c = write(parse('new list groceries butter', cat));
    expect(c.category.isNew).toBe(false);
    expect(c.payload).toEqual({ type: 'list', items: ['butter'] });
    expect(c.notes.join(' ')).toMatch(/already exists/);
  });

  it('"new list groceries" creates an empty list when it does not exist', () => {
    const c = write(parse('new list groceries', catalog()));
    expect(c.category).toMatchObject({ isNew: true, type: 'list', name: 'groceries' });
    expect(c.payload).toEqual({ type: 'list', items: [] });
  });

  it('"add X to Y" works for existing lists', () => {
    const c = write(parse('add eggs, milk to groceries', catalog([['groceries', 'list']])));
    expect(c.category.key).toBe('grocery');
    expect(c.payload).toEqual({ type: 'list', items: ['eggs', 'milk'] });
  });

  it('an existing list stays a list even when the text looks like a fact', () => {
    const c = write(parse('+ groceries eggs 12', catalog([['groceries', 'list']])));
    expect(c.payload).toEqual({ type: 'list', items: ['eggs 12'] });
  });
});

describe('facts', () => {
  it('+pw bankpin2 4321 — alias, key, trailing value', () => {
    const c = write(parse('+pw bankpin2 4321', catalog()));
    expect(c.category).toMatchObject({ key: 'password', name: 'passwords', type: 'fact', isNew: true });
    expect(c.payload).toEqual({ type: 'fact', key: 'bankpin2', value: '4321' });
  });

  it('+ bank pin: 4533 — colon separates key from value', () => {
    const c = write(parse('+ bank pin: 4533', catalog()));
    expect(c.category).toMatchObject({ key: 'bank', type: 'fact' });
    expect(c.payload).toEqual({ type: 'fact', key: 'pin', value: '4533' });
  });

  it('colon value may contain spaces and time colons', () => {
    expect(parseFact('opening hours: 9:00 - 17:30', false)).toEqual({ key: 'opening hours', value: '9:00 - 17:30' });
    expect(parseFact('train 7:45', false)).toEqual({ key: 'train', value: '7:45' });
  });

  it('detects dates and codes as trailing values', () => {
    expect(write(parse('+ dad birthday 12.03.1960', catalog())).payload).toEqual({ type: 'fact', key: 'birthday', value: '12.03.1960' });
    expect(write(parse('+ birthdays dad march 3', catalog())).payload).toEqual({ type: 'fact', key: 'dad', value: 'march 3' });
    expect(write(parse('+ wifi home AB12-CD34', catalog())).payload).toEqual({ type: 'fact', key: 'home', value: 'AB12-CD34' });
    expect(write(parse('+ contacts plumber +49 151 2345678', catalog())).category.type).toBe('fact');
  });

  it('without a colon and without a value-like last token, a new entry becomes list items', () => {
    const c = write(parse('+ movies the matrix', catalog()));
    expect(c.category.type).toBe('list');
    expect(c.payload).toEqual({ type: 'list', items: ['the matrix'] });
  });

  it('a single value token stores the category value', () => {
    expect(write(parse('+ wifi hunter2', catalog())).payload).toEqual({ type: 'fact', key: null, value: 'hunter2' });
  });

  it('existing fact category without value-like token: first word is key', () => {
    const c = write(parse('+ bank branch main street', catalog([['bank', 'fact']])));
    expect(c.payload).toEqual({ type: 'fact', key: 'branch', value: 'main street' });
  });

  it('fact without a value is invalid', () => {
    expect(parse('+ bank pin:', catalog()).kind).toBe('invalid');
  });
});

describe("where's-what", () => {
  it('+ keys sofa records a location (built-in place item)', () => {
    const c = write(parse('+ keys sofa', catalog()));
    expect(c.category).toMatchObject({ key: 'key', type: 'place', isNew: true });
    expect(c.payload).toEqual({ type: 'place', location: 'sofa' });
  });

  it('a preposition marks a location for any item', () => {
    const c = write(parse('+ remote under the couch', catalog()));
    expect(c.payload).toEqual({ type: 'place', location: 'under the couch' });
    expect(write(parse('+ drill in the garage', catalog())).category.type).toBe('place');
  });

  it('+loc forces a location', () => {
    const c = write(parse('+loc drill garage', catalog()));
    expect(c.category).toMatchObject({ key: 'drill', type: 'place' });
    expect(c.payload).toEqual({ type: 'place', location: 'garage' });
  });

  it('existing place category keeps recording locations', () => {
    expect(write(parse('+ keys kitchen drawer', catalog([['keys', 'place']]))).payload).toEqual({ type: 'place', location: 'kitchen drawer' });
  });

  it('a place without location is invalid', () => {
    expect(parse('+loc keys', catalog()).kind).toBe('invalid');
    expect(parse('+ keys', catalog([['keys', 'place']])).kind).toBe('invalid');
  });
});

describe('reserved names', () => {
  it.each(['l', 'a', 't', 'n', 'r'])('warns when creating a category named %s', (name) => {
    const c = write(parse(`+ ${name} eggs`, catalog()));
    expect(c.notes.join(' ')).toMatch(/also a command/);
  });
  it('does not warn for normal names', () => {
    expect(write(parse('+ groceries eggs', catalog())).notes).toEqual([]);
  });
});

describe('reading', () => {
  it('no prefix is a read with normalized tokens in any order', () => {
    const a = parse('birthday dad', catalog());
    const b = parse('dad birthday', catalog());
    const c = parse("when is my dad's birthday?", catalog());
    for (const x of [a, b, c]) expect(x.kind).toBe('read');
    const sorted = (x: Command) => (x.kind === 'read' ? [...x.tokens].sort() : []);
    expect(sorted(a)).toEqual(['birthday', 'dad']);
    expect(sorted(b)).toEqual(sorted(a));
    expect(sorted(c)).toEqual(sorted(a));
  });

  it('"where keys" reads keys', () => {
    const r = parse('where keys', catalog());
    expect(r).toMatchObject({ kind: 'read', tokens: ['key'] });
  });
});

describe('calculator', () => {
  it('5+5 evaluates live', () => {
    expect(parse('5+5', catalog())).toEqual({ kind: 'calc', expr: '5+5', result: '10' });
  });
  it('incomplete expression has no result yet', () => {
    expect(parse('5+', catalog())).toMatchObject({ kind: 'calc', result: null });
  });
  it('a plain number is a read, not calc', () => {
    expect(parse('4321', catalog()).kind).toBe('read');
  });
});

describe('notes', () => {
  it('n called landlord stores a note', () => {
    expect(parse('n called landlord', catalog())).toEqual({ kind: 'note-add', text: 'called landlord' });
    expect(parse('r called landlord', catalog())).toEqual({ kind: 'note-add', text: 'called landlord' });
  });
  it.each(['last week', 'yesterday', 'today', 'this month'])('n %s queries notes', (q) => {
    expect(parse(`n ${q}`, catalog(), undefined, NOW)).toMatchObject({ kind: 'note-query', label: q });
  });
  it('n alone lists recent notes', () => {
    expect(parse('n', catalog())).toMatchObject({ kind: 'note-query', range: null });
  });
  it('a note that merely starts with a date word is still a note', () => {
    expect(parse('n today I fixed the bike', catalog()).kind).toBe('note-add');
  });
});

describe('timers and alarms', () => {
  it('timer 1 = one minute', () => {
    expect(parse('timer 1', catalog())).toMatchObject({ kind: 'timer', ms: 60_000, label: '', at: null });
    expect(parse('t 1', catalog())).toMatchObject({ kind: 'timer', ms: 60_000 });
  });
  it('a water plants 1h', () => {
    expect(parse('a water plants 1h', catalog())).toMatchObject({ kind: 'timer', ms: 3_600_000, label: 'water plants' });
  });
  it.each([
    ['t 90s', 90_000], ['t 30m', 1_800_000], ['t 1h', 3_600_000], ['t 1h30m', 5_400_000], ['t 1h 30m', 5_400_000],
    ['t 10 min tea', 600_000],
  ])('%s', (input, ms) => {
    expect(parse(input, catalog())).toMatchObject({ kind: 'timer', ms });
  });
  it('alarm at a clock time', () => {
    const c = parse('a 7:30 wake up', catalog(), undefined, NOW);
    expect(c).toMatchObject({ kind: 'timer', label: 'wake up' });
    if (c.kind === 'timer') expect(new Date(c.at!).getHours()).toBe(7);
  });
  it('timer without duration is invalid', () => {
    expect(parse('t tea', catalog()).kind).toBe('invalid');
  });
});

describe('other commands', () => {
  it('loc', () => expect(parse('loc', catalog()).kind).toBe('loc'));
  it('l lists categories, l <name> opens one', () => {
    expect(parse('l', catalog()).kind).toBe('list-categories');
    expect(parse('l groceries', catalog())).toEqual({ kind: 'open-category', key: 'grocery' });
  });
  it('photo keys', () => {
    expect(parse('photo keys', catalog([['keys', 'place']]))).toMatchObject({ kind: 'photo', category: { key: 'key', isNew: false } });
  });
});

describe('context: add to the viewed list', () => {
  it('plain text adds to the viewed list', () => {
    const cat = catalog([['groceries', 'list']]);
    const c = write(parse('butter, jam', cat, { kind: 'category', key: 'grocery' }));
    expect(c.payload).toEqual({ type: 'list', items: ['butter', 'jam'] });
  });
  it('plain text updates the viewed place', () => {
    const cat = catalog([['keys', 'place']]);
    expect(write(parse('hallway', cat, { kind: 'category', key: 'key' })).payload).toEqual({ type: 'place', location: 'hallway' });
  });
  it('explicit + still targets another category', () => {
    const cat = catalog([['groceries', 'list'], ['todo', 'list']]);
    expect(write(parse('+ todo call mom', cat, { kind: 'category', key: 'grocery' })).category.key).toBe('todo');
  });
});

describe('aliases', () => {
  it('user aliases resolve on write', () => {
    const c = write(parse('+ meds aspirin', catalog([['medicine', 'list']], [['meds', 'medicine']])));
    expect(c.category).toMatchObject({ key: 'medicine', isNew: false });
  });
});
