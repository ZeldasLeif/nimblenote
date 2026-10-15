// Safe arithmetic evaluator (recursive descent). Never uses eval/Function.
// Grammar:
//   expr    := term (('+' | '-') term)*
//   term    := factor (('*' | '/' | '%') factor)*      -- binary % is modulo
//   factor  := ('+' | '-') factor | postfix
//   postfix := primary '%'?                             -- trailing % means /100 (e.g. 50%)
//   primary := number | '(' expr ')'

const CALC_CHARS = /^[\d\s.+\-*/%()x×÷,]+$/;

export type CalcResult = { ok: true; value: number; text: string } | { ok: false };

/** True when the input is plausibly an arithmetic expression (digits and at least one operator). */
export function isCalcLike(input: string): boolean {
  const s = input.trim();
  if (!s || !CALC_CHARS.test(s) || !/\d/.test(s)) return false;
  // "x" only as multiplication between operands, never as a leading word.
  if (/^x/i.test(s)) return false;
  return /[+\-*/%x×÷()]/.test(s.replace(/^[+-]/, ''));
}

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string };

function lex(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/×|x/gi, '*').replace(/÷/g, '/');
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < s.length && /[\d.,]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(/,/g, '');
      if ((raw.match(/\./g) ?? []).length > 1 || raw === '.') return null;
      out.push({ t: 'num', v: parseFloat(raw) });
      i = j;
      continue;
    }
    if ('+-*/%()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    return null;
  }
  return out;
}

export function evaluate(input: string): CalcResult {
  const lexed = lex(input.trim());
  if (!lexed || lexed.length === 0) return { ok: false };
  const toks: Tok[] = lexed;
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.t === 'op' && t.v === v; };

  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = factor();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v;
      const r = factor();
      if (op === '*') v = v * r;
      else if (op === '/') { if (r === 0) throw new Error('div0'); v = v / r; }
      else { if (r === 0) throw new Error('div0'); v = v % r; }
    }
    return v;
  }
  function factor(): number {
    if (isOp('-')) { p++; return -factor(); }
    if (isOp('+')) { p++; return factor(); }
    return postfix();
  }
  function postfix(): number {
    let v = primary();
    // Trailing percent: "%" not followed by an operand.
    if (isOp('%')) {
      const next = toks[p + 1];
      const operandFollows = next && (next.t === 'num' || (next.t === 'op' && (next.v === '(' || next.v === '-' || next.v === '+')));
      if (!operandFollows) { p++; v = v / 100; }
    }
    return v;
  }
  function primary(): number {
    const t = peek();
    if (!t) throw new Error('eof');
    if (t.t === 'num') { p++; return t.v; }
    if (t.v === '(') {
      p++;
      const v = expr();
      if (!isOp(')')) throw new Error('paren');
      p++;
      return v;
    }
    throw new Error('unexpected');
  }

  try {
    const v = expr();
    if (p !== toks.length || !Number.isFinite(v)) return { ok: false };
    return { ok: true, value: v, text: formatNumber(v) };
  } catch {
    return { ok: false };
  }
}

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const r = parseFloat(v.toPrecision(12));
  return String(r);
}
