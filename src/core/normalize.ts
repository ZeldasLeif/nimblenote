// Text normalization shared by reading (forgiving) and name resolution.
// Writing keeps the user's text verbatim; only lookup keys are normalized.

export const FILLER = new Set([
  'a', 'an', 'the', 'my', 'our', 'your', 'his', 'her', 'their', 'its', 'it',
  'is', 'are', 'was', 'were', 'be', 'am', 'do', 'does', 'did',
  'when', 'what', 'whats', 'where', 'wheres', 'which', 'who', 'whos', 'how', 'whens',
  'of', 'for', 'to', 'at', 'in', 'on', 'i', 'me', 'please', 'show', 'find', 'get',
  'tell', 'about', 'much', 'many', 'there', 'any', 'some', 'again',
]);

const IRREGULAR: Record<string, string> = {
  children: 'child', people: 'person', men: 'man', women: 'woman', feet: 'foot',
  teeth: 'tooth', mice: 'mouse', geese: 'goose', knives: 'knife', wives: 'wife',
  leaves: 'leaf', lives: 'life', shelves: 'shelf', halves: 'half',
};

// Words ending in "s" that are not plurals (or whose naive singular is a different word).
const KEEP_S = new Set([
  'glasses', 'news', 'series', 'species', 'scissors', 'pants', 'jeans', 'shorts',
  'is', 'was', 'has', 'his', 'this', 'its', 'us', 'yes', 'gas', 'bus', 'plus',
  'bonus', 'status', 'campus', 'virus', 'lens', 'chess', 'mathematics', 'physics',
]);

/** Singularize one lowercase token. Consistency matters more than linguistic accuracy. */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (KEEP_S.has(word)) return word;
  if (/\d/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zzes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('ss') || word.endsWith('us') || word.endsWith('is')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Strip possessives: dad's -> dad, dads' -> dads. */
export function stripPossessive(word: string): string {
  return word.replace(/['’]s$/, '').replace(/s['’]$/, 's');
}

/** Lowercase, drop punctuation (keeping digits, letters, and inner . : / - @ in values), split on whitespace. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .map((t) => stripPossessive(t))
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .map((t) => t.replace(/'/g, ''))
    .filter((t) => t.length > 0);
}

/** Normalize a single token for matching. */
export function normToken(token: string): string {
  return singular(stripPossessive(token.toLowerCase()));
}

/** Tokens for matching: tokenized, singularized. Filler is kept (use queryTokens for reads). */
export function matchTokens(text: string): string[] {
  return tokenize(text).map(singular);
}

/** Tokens for a forgiving read query: tokenized, filler removed, singularized, de-duplicated. */
export function queryTokens(text: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(text)) {
    if (FILLER.has(t)) continue;
    const s = singular(t);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Canonical key for a category name ("Passwords" -> "password", "To-Do" -> "to-do"). */
export function nameKey(name: string): string {
  const t = name.trim().toLowerCase().replace(/[’']s$/, '');
  return singular(t.replace(/[^\p{L}\p{N}_-]+/gu, ''));
}

/** Collapse inner whitespace and trim; keeps case and spelling exactly as typed. */
export function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
