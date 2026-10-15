// Forgiving lookup: query tokens in any order against an in-memory document index.

import { matchTokens, tokenize } from './normalize';

export type DocKind = 'category' | 'fact' | 'item' | 'note';

export interface Doc {
  id: string; // stable, e.g. "c:12", "e:40", "n:7"
  kind: DocKind;
  categoryKey: string | null;
  /** Tokens that name the thing (category name + aliases, fact key, item text). */
  strong: string[];
  /** Tokens of the containing category for items/facts. */
  context: string[];
  /** Tokens of values, locations, note text. Never includes sensitive values. */
  weak: string[];
  ts: number;
}

export interface Scored { doc: Doc; score: number }

/** Builds token arrays with both raw and singular forms so partial typing ("grocerie") still matches. */
export function docTokens(text: string): string[] {
  const raw = tokenize(text);
  const sing = matchTokens(text);
  return Array.from(new Set([...raw, ...sing]));
}

const W = { exact: 1, prefix: 0.85, shortPrefix: 0.6, context: 0.9, contextPrefix: 0.8, weak: 0.45, weakPrefix: 0.3, note: 0.7 };

function tokenScore(q: string, tokens: string[], exactW: number, prefixW: number): number {
  let best = 0;
  for (const t of tokens) {
    if (t === q) return exactW;
    if (t.startsWith(q)) best = Math.max(best, prefixW);
  }
  return best;
}

export function scoreDoc(doc: Doc, query: string[], prefixLast: boolean): number {
  if (query.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < query.length; i++) {
    const q = query[i];
    const allowPrefix = prefixLast ? i === query.length - 1 : true;
    const pw = allowPrefix ? (q.length >= 3 ? W.prefix : q.length === 2 ? W.shortPrefix : 0) : 0;
    const strongExact = doc.kind === 'note' ? W.note : W.exact;
    const strongPrefix = doc.kind === 'note' ? Math.min(pw, W.note * 0.8) : pw;
    const s = Math.max(
      tokenScore(q, doc.strong, strongExact, strongPrefix),
      tokenScore(q, doc.context, W.context, allowPrefix && q.length >= 3 ? W.contextPrefix : 0),
      tokenScore(q, doc.weak, W.weak, allowPrefix ? W.weakPrefix : 0),
    );
    if (s === 0 && doc.kind !== 'note') return 0; // every token must match somewhere
    sum += s;
  }
  let score = sum / query.length;
  // Prefer documents whose name is fully covered by the query (precision).
  const covered = doc.strong.filter((t) => query.includes(t)).length;
  if (doc.strong.length > 0) score += 0.04 * (covered / doc.strong.length);
  // Exact category hit wins ties against entries inside it.
  if (doc.kind === 'category' && score >= 1) score += 0.02;
  return score;
}

export function search(docs: readonly Doc[], query: string[], limit = 30, prefixLast = true): Scored[] {
  if (query.length === 0) return [];
  const out: Scored[] = [];
  for (const doc of docs) {
    const score = scoreDoc(doc, query, prefixLast);
    if (score >= 0.3) out.push({ doc, score });
  }
  out.sort((a, b) => b.score - a.score || b.doc.ts - a.doc.ts);
  return out.slice(0, limit);
}

export const CONFIDENT = 0.85;
export const MARGIN = 0.08;

/** The single best match, only when it is clearly the answer; otherwise null (never show weak guesses). */
export function confidentBest(results: Scored[]): Scored | null {
  const top = results[0];
  if (!top || top.score < CONFIDENT) return null;
  const second = results[1];
  if (second && top.score - second.score < MARGIN) {
    // An exact category and an entry inside it: the category is still the clear answer.
    const sameCategory = top.doc.kind === 'category' && second.doc.categoryKey === top.doc.categoryKey;
    if (!sameCategory) return null;
  }
  return top;
}
