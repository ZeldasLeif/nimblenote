// The grammar: one input line -> one Command. Pure and deterministic.
//
//   (no prefix)            READ (forgiving lookup)
//   + / new / add          WRITE (strict; first word is the category)
//   digits and operators   CALC (live)
//   l a t n r              reserved single-letter commands
//
// Reading is forgiving, writing is strict: writes keep the user's text exactly as typed.

import { evaluate, isCalcLike } from './calc';
import { parseDateRange } from './dates';
import { findClock, findDuration, nextClockTime } from './duration';
import { clean, nameKey, queryTokens } from './normalize';
import type { Catalog, CategoryRef, CategoryType, Command, InputContext, WritePayload } from './types';
import { looksLikeValue, trailingWordDate } from './valueDetect';

/** Single letters and words with built-in meaning. User categories with these names get a warning. */
export const RESERVED = new Set([
  'l', 'a', 't', 'n', 'r',
  'list', 'lists', 'timer', 'alarm', 'note', 'notes', 'loc', 'location', 'gps', 'photo', 'pic',
  'settings', 'help', 'undo', 'new', 'add',
]);

/** Items that are almost always "where did I put it" things. Keys are normalized (singular). */
export const PLACE_ITEMS = new Set([
  'key', 'wallet', 'glasses', 'sunglasses', 'passport', 'phone', 'charger', 'car', 'bike',
  'umbrella', 'remote', 'headphone', 'earbud', 'airpod', 'laptop', 'backpack', 'purse',
  'id', 'parking', 'spare', 'scissors', 'tape', 'flashlight', 'torch',
]);

const PLACE_PREPOSITION = /^(in|on|under|underneath|behind|inside|beside|near|next to|at|by|on top of|left in|left at|in the|on the)\b/i;

const TYPE_KEYWORDS: Record<string, CategoryType> = {
  list: 'list', fact: 'fact', facts: 'fact', loc: 'place', place: 'place', where: 'place',
};

/** Resolve a typed name through aliases to a category key. */
export function resolveName(name: string, catalog: Catalog): string {
  const k = nameKey(name);
  const target = catalog.aliases.get(k);
  return target ? nameKey(target) : k;
}

/** Split list text on commas, semicolons, newlines and the word "and". Never on spaces unless asked. */
export function splitItems(text: string, onSpaces = false): string[] {
  const parts = text
    .split(/[,;\n]+|\s+and\s+|\s*&\s+/i)
    .map((s) => clean(s))
    .filter(Boolean);
  if (!onSpaces) return parts;
  return parts.flatMap((p) => p.split(/\s+/)).filter(Boolean);
}

/** Decide the type of a brand-new category from its first entry. */
export function inferType(key: string, payload: string): CategoryType {
  const p = payload.trim();
  if (separatorColon(p) >= 0) return 'fact';
  const hasSeparators = /[,;]|\s+and\s+/i.test(p);
  if (PLACE_ITEMS.has(key) && !hasSeparators && p) return 'place';
  if (PLACE_PREPOSITION.test(p) && !hasSeparators) return 'place';
  const toks = p.split(/\s+/).filter(Boolean);
  if (toks.length > 0 && !hasSeparators) {
    if (looksLikeValue(toks[toks.length - 1]) || trailingWordDate(toks) > 0) return 'fact';
  }
  return 'list';
}

/** Index of the first colon that separates key from value; a colon between digits ("7:30") is not one. */
export function separatorColon(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ':') continue;
    if (/\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue;
    return i;
  }
  return -1;
}

/** Parse fact text: colon separates key from value; otherwise the trailing value-like token(s). */
export function parseFact(payload: string, existing: boolean): { key: string | null; value: string } | null {
  const p = clean(payload);
  if (!p) return null;
  const colon = separatorColon(p);
  if (colon > 0) {
    const key = clean(p.slice(0, colon));
    const value = clean(p.slice(colon + 1));
    if (!value) return null;
    return { key: key || null, value };
  }
  if (colon === 0) {
    const value = clean(p.slice(1));
    return value ? { key: null, value } : null;
  }
  const toks = p.split(' ');
  if (toks.length === 1) return { key: null, value: toks[0] };
  const dateCount = trailingWordDate(toks);
  if (dateCount > 0 && dateCount < toks.length) {
    return { key: toks.slice(0, -dateCount).join(' '), value: toks.slice(-dateCount).join(' ') };
  }
  if (looksLikeValue(toks[toks.length - 1])) {
    return { key: toks.slice(0, -1).join(' '), value: toks[toks.length - 1] };
  }
  if (existing) return { key: toks[0], value: toks.slice(1).join(' ') };
  return null;
}

function categoryRef(name: string, catalog: Catalog, forced: CategoryType | null, payload: string): CategoryRef {
  const key = resolveName(name, catalog);
  const existing = catalog.categories.get(key);
  if (existing) return { key, name: existing.name, type: existing.type, isNew: false };
  const display = catalog.aliases.get(nameKey(name)) ?? clean(name).replace(/:$/, '');
  return { key, name: display, type: forced ?? inferType(key, payload), isNew: true };
}

function buildPayload(cat: CategoryRef, payload: string, catalog: Catalog): WritePayload | { error: string } {
  const splitSpaces = catalog.categories.get(cat.key)?.splitOnSpaces ?? false;
  switch (cat.type) {
    case 'list':
      return { type: 'list', items: splitItems(payload, splitSpaces) };
    case 'place': {
      const location = clean(payload);
      if (!location) return { error: `Where is ${cat.name}?` };
      return { type: 'place', location };
    }
    case 'fact': {
      const f = parseFact(payload, !cat.isNew);
      if (!f) return { error: `Add a value, e.g. "${cat.name} name: value"` };
      return { type: 'fact', ...f };
    }
  }
}

function parseWrite(rest: string, catalog: Catalog, viaNew: boolean): Command {
  // viaNew: the user typed "new", i.e. expected to create something.
  let text = rest.trim();
  if (!text) return { kind: 'invalid', message: 'Type a name, e.g. "+ groceries eggs, milk"' };

  let forced: CategoryType | null = null;
  const kw = /^(\S+)\s+(\S.*)$/.exec(text);
  if (kw && TYPE_KEYWORDS[kw[1].toLowerCase()]) {
    forced = TYPE_KEYWORDS[kw[1].toLowerCase()];
    text = kw[2];
  }

  // "add eggs to groceries" — only when the target already exists, so it is never ambiguous.
  const to = /^(.+)\s+to\s+(\S+)$/i.exec(text);
  let name: string;
  let payload: string;
  if (to && catalog.categories.has(resolveName(to[2], catalog))) {
    name = to[2];
    payload = to[1];
  } else {
    const m = /^(\S+?)(:?)(?:\s+(.*))?$/.exec(text)!;
    name = m[1];
    payload = m[3] ?? '';
  }

  const cat = categoryRef(name, catalog, forced, payload);
  const notes: string[] = [];
  if (!cat.isNew && forced && forced !== cat.type) notes.push(`${cat.name} is a ${cat.type}; adding as ${cat.type}`);
  if (!cat.isNew && viaNew) notes.push(`${cat.name} already exists, adding to it`);
  if (cat.isNew && RESERVED.has(cat.key)) notes.push(`"${cat.name}" is also a command; open it with "l ${cat.name}"`);

  const built = buildPayload(cat, payload, catalog);
  if ('error' in built) {
    // A brand-new empty list is a valid way to create one ("new list groceries").
    return { kind: 'invalid', message: built.error };
  }
  return { kind: 'write', category: cat, payload: built, notes };
}

export function parse(input: string, catalog: Catalog, context: InputContext = { kind: 'none' }, now: Date = new Date()): Command {
  const raw = input;
  const s = input.trim();
  if (!s) return { kind: 'empty' };

  const writePrefix = /^(?:\+\s*|(new|add)\s+)/i.exec(s);
  if (writePrefix) {
    return parseWrite(s.slice(writePrefix[0].length), catalog, writePrefix[1]?.toLowerCase() === 'new');
  }

  // Context: after viewing a category, plain text adds to it.
  if (context.kind === 'category') {
    const cat = catalog.categories.get(context.key);
    if (cat) {
      const ref: CategoryRef = { key: cat.key, name: cat.name, type: cat.type, isNew: false };
      const built = buildPayload(ref, s, catalog);
      if ('error' in built) return { kind: 'invalid', message: built.error };
      return { kind: 'write', category: ref, payload: built, notes: [] };
    }
  }

  if (isCalcLike(s)) {
    const r = evaluate(s);
    return { kind: 'calc', expr: s, result: r.ok ? r.text : null };
  }

  const m = /^(\S+)(?:\s+(.*))?$/.exec(s)!;
  const head = m[1].toLowerCase();
  const rest = (m[2] ?? '').trim();
  const restTokens = rest ? rest.split(/\s+/) : [];

  switch (head) {
    case 'n': case 'r': case 'note': {
      if (!rest) return { kind: 'note-query', range: null, label: 'recent' };
      const range = parseDateRange(rest, now);
      if (range) return { kind: 'note-query', range: { start: range.start, end: range.end }, label: range.label };
      return { kind: 'note-add', text: rest };
    }
    case 't': case 'timer': {
      const d = findDuration(restTokens);
      if (!d) return { kind: 'invalid', message: 'Timer needs a duration, e.g. "t 5" or "t 1h30m tea"' };
      const label = restTokens.filter((_, i) => i < d.start || i >= d.start + d.count).join(' ');
      return { kind: 'timer', ms: d.ms, label, at: null };
    }
    case 'a': case 'alarm': {
      const c = findClock(restTokens);
      if (c) {
        const at = nextClockTime(c.hours, c.minutes, now).getTime();
        const label = restTokens.filter((_, i) => i < c.start || i >= c.start + c.count).join(' ');
        return { kind: 'timer', ms: at - now.getTime(), label, at };
      }
      const d = findDuration(restTokens);
      if (!d) return { kind: 'invalid', message: 'Alarm needs a time, e.g. "a water plants 1h" or "a 7:30"' };
      const label = restTokens.filter((_, i) => i < d.start || i >= d.start + d.count).join(' ');
      return { kind: 'timer', ms: d.ms, label, at: null };
    }
    case 'l': case 'list': case 'lists':
      if (!rest) return { kind: 'list-categories' };
      return { kind: 'open-category', key: resolveName(rest.split(/\s+/)[0], catalog) };
    case 'loc': case 'gps': case 'location':
      if (!rest) return { kind: 'loc' };
      break;
    case 'photo': case 'pic': {
      if (!rest) return { kind: 'invalid', message: 'Tag the photo, e.g. "photo keys"' };
      const name = restTokens[0];
      return { kind: 'photo', category: categoryRef(name, catalog, null, '') };
    }
    case 'settings': case 'options':
      if (!rest) return { kind: 'settings' };
      break;
    case 'help': case '?':
      if (!rest) return { kind: 'help' };
      break;
    case 'undo':
      if (!rest) return { kind: 'undo' };
      break;
  }
  if (/^where am i\??$/i.test(s)) return { kind: 'loc' };

  return { kind: 'read', tokens: queryTokens(s), raw };
}

/** Whether a command performs a side effect and therefore waits for Enter. */
export function needsEnter(cmd: Command): boolean {
  return cmd.kind === 'write' || cmd.kind === 'note-add' || cmd.kind === 'timer' || cmd.kind === 'loc'
    || cmd.kind === 'photo' || cmd.kind === 'undo';
}
