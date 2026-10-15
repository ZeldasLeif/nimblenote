// Builds the in-memory search documents from stored data. Pure, so it is testable without SQLite.

import { type Doc, docTokens } from './match';
import { nameKey } from './normalize';
import type { CategoryType } from './types';

export interface CategoryLite {
  id: number;
  key: string;
  name: string;
  type: CategoryType;
  sensitive: boolean;
  updatedAt: number;
}
export interface EntryLite {
  id: number;
  categoryId: number;
  key: string | null;
  value: string | null; // null when encrypted
  sensitive: boolean;
  createdAt: number;
}
export interface NoteLite { id: number; text: string; createdAt: number }

export function buildDocs(
  categories: readonly CategoryLite[],
  entries: readonly EntryLite[],
  notes: readonly NoteLite[],
  aliases: ReadonlyMap<string, string>,
): Doc[] {
  const docs: Doc[] = [];
  const aliasTokens = new Map<string, string[]>();
  for (const [alias, target] of aliases) {
    const k = nameKey(target);
    const list = aliasTokens.get(k) ?? [];
    list.push(alias);
    aliasTokens.set(k, list);
  }
  const byId = new Map<number, { cat: CategoryLite; tokens: string[] }>();
  for (const c of categories) {
    const tokens = Array.from(new Set([...docTokens(c.name), c.key, ...(aliasTokens.get(c.key) ?? [])]));
    byId.set(c.id, { cat: c, tokens });
  }
  // Latest location per place category, for the category doc's weak tokens.
  const latestPlace = new Map<number, EntryLite>();
  for (const e of entries) {
    const info = byId.get(e.categoryId);
    if (!info) continue;
    if (info.cat.type === 'place') {
      const prev = latestPlace.get(e.categoryId);
      if (!prev || e.createdAt > prev.createdAt) latestPlace.set(e.categoryId, e);
      continue;
    }
    const sensitive = e.sensitive || info.cat.sensitive;
    if (info.cat.type === 'fact') {
      docs.push({
        id: `e:${e.id}`, kind: 'fact', categoryKey: info.cat.key,
        strong: e.key ? docTokens(e.key) : [],
        context: info.tokens,
        weak: sensitive || !e.value ? [] : docTokens(e.value),
        ts: e.createdAt,
      });
    } else {
      docs.push({
        id: `e:${e.id}`, kind: 'item', categoryKey: info.cat.key,
        strong: e.value && !sensitive ? docTokens(e.value) : [],
        context: info.tokens,
        weak: [],
        ts: e.createdAt,
      });
    }
  }
  for (const { cat, tokens } of byId.values()) {
    const place = latestPlace.get(cat.id);
    docs.push({
      id: `c:${cat.id}`, kind: 'category', categoryKey: cat.key,
      strong: tokens, context: [],
      weak: place?.value && !cat.sensitive ? docTokens(place.value) : [],
      ts: place?.createdAt ?? cat.updatedAt,
    });
  }
  for (const n of notes) {
    docs.push({ id: `n:${n.id}`, kind: 'note', categoryKey: null, strong: docTokens(n.text), context: [], weak: [], ts: n.createdAt });
  }
  return docs;
}
