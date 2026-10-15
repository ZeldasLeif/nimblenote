// Decides whether a token "looks like a value" (number, date, code) for fact detection.

const NUMBER = /^[-+]?\d[\d.,' ]*$/;
const DATE_NUMERIC = /^\d{1,4}[./-]\d{1,2}([./-]\d{1,4})?$/;
const TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL = /^(https?:\/\/|www\.)\S+$/i;
const PHONE = /^\+?[\d()\-/ ]{5,}$/;
// Code: letters/symbols with at least one digit (hunter2, ab12cd, x7-99, DE89370400440532013000).
const CODE_MIXED = /^(?=.*\d)[\p{L}\d\-_#*!$%&.]+$/u;
const MONTHS = new Set([
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 'may', 'jun', 'june',
  'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september', 'oct', 'october', 'nov',
  'november', 'dec', 'december',
]);

export function looksLikeValue(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (NUMBER.test(t)) return true;
  if (DATE_NUMERIC.test(t) || TIME.test(t)) return true;
  if (EMAIL.test(t) || URL.test(t)) return true;
  if (PHONE.test(t) && /\d{3,}/.test(t)) return true;
  if (CODE_MIXED.test(t)) return true;
  // All-caps tokens with 4+ chars (e.g. "XKCD", "ABCD") are typical codes.
  if (/^[A-Z]{4,}$/.test(t)) return true;
  return false;
}

/** Recognizes a trailing date written as words, e.g. "march 3" or "3 march". Returns the token count. */
export function trailingWordDate(tokens: string[]): number {
  const n = tokens.length;
  if (n >= 2) {
    const a = tokens[n - 2].toLowerCase();
    const b = tokens[n - 1].toLowerCase().replace(/(st|nd|rd|th),?$/, '');
    if (MONTHS.has(a) && /^\d{1,2}$/.test(b)) return 2;
    if (/^\d{1,2}(st|nd|rd|th)?$/.test(a) && MONTHS.has(b)) return 2;
  }
  if (n >= 3) {
    const a = tokens[n - 3].toLowerCase();
    const b = tokens[n - 2].toLowerCase().replace(/(st|nd|rd|th),?$/, '');
    const c = tokens[n - 1];
    if (MONTHS.has(a) && /^\d{1,2}$/.test(b) && /^\d{4}$/.test(c)) return 3;
    if (/^\d{1,2}(st|nd|rd|th)?$/.test(a) && MONTHS.has(b.toLowerCase()) && /^\d{4}$/.test(c)) return 3;
  }
  return 0;
}
