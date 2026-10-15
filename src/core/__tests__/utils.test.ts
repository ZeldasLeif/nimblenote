import { evaluate, isCalcLike } from '../calc';
import { parseDateRange } from '../dates';
import { findClock, findDuration, formatDuration, parseDurationToken } from '../duration';
import { nameKey, queryTokens, singular, tokenize } from '../normalize';
import { looksLikeValue } from '../valueDetect';

describe('calc', () => {
  it.each([
    ['5+5', '10'], ['2*3+4', '10'], ['2*(3+4)', '14'], ['10/4', '2.5'], ['10 % 3', '1'], ['-3+5', '2'],
    ['0.1+0.2', '0.3'], ['50%', '0.5'], ['200*10%', '20'], ['((1))', '1'], ['3 x 4', '12'], ['8 ÷ 2', '4'],
    ['1,000+1', '1001'], ['2*-3', '-6'],
  ])('%s = %s', (expr, out) => {
    expect(evaluate(expr)).toEqual({ ok: true, value: expect.any(Number), text: out });
  });
  it.each(['5+', '(1+2', '1/0', '5 % 0', '1..2', '', '()', '2 3'])('%s is not a valid result', (expr) => {
    expect(evaluate(expr).ok).toBe(false);
  });
  it('detects calc-like input', () => {
    expect(isCalcLike('5+5')).toBe(true);
    expect(isCalcLike('(2)')).toBe(true);
    expect(isCalcLike('42')).toBe(false);
    expect(isCalcLike('+ groceries')).toBe(false);
    expect(isCalcLike('x5')).toBe(false);
    expect(isCalcLike('12.03.1960')).toBe(false);
  });
  it('never uses eval: rejects code', () => {
    expect(evaluate('alert(1)').ok).toBe(false);
    expect(evaluate('1;2').ok).toBe(false);
  });
});

describe('duration', () => {
  it.each([
    ['90s', 90_000], ['30m', 1_800_000], ['1h', 3_600_000], ['1h30m', 5_400_000], ['1.5h', 5_400_000], ['5', 300_000],
    ['2hours', 7_200_000],
  ])('%s', (t, ms) => expect(parseDurationToken(t)).toBe(ms));
  it.each(['abc', '1x', 'h', '0m'])('%s is not a duration', (t) => expect(parseDurationToken(t)).toBeNull());
  it('finds spaced durations at the end', () => {
    expect(findDuration(['water', 'plants', '1', 'h', '30', 'min'])).toEqual({ ms: 5_400_000, start: 2, count: 4 });
  });
  it('finds a duration at the start', () => {
    expect(findDuration(['5m', 'tea'])).toEqual({ ms: 300_000, start: 0, count: 1 });
  });
  it('finds clock times', () => {
    expect(findClock(['7:30'])).toMatchObject({ hours: 7, minutes: 30 });
    expect(findClock(['7pm', 'call'])).toMatchObject({ hours: 19, minutes: 0 });
    expect(findClock(['7', 'pm'])).toMatchObject({ hours: 19, count: 2 });
    expect(findClock(['12am'])).toMatchObject({ hours: 0 });
    expect(findClock(['25:00'])).toBeNull();
  });
  it('formats durations', () => {
    expect(formatDuration(5_400_000)).toBe('1h 30m');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 15, 10, 0, 0); // Thursday
  const d = (r: { start: number; end: number } | null) => r && [new Date(r.start).toDateString(), new Date(r.end).toDateString()];
  it('today / yesterday', () => {
    expect(d(parseDateRange('today', now))).toEqual(['Thu Oct 15 2026', 'Fri Oct 16 2026']);
    expect(d(parseDateRange('yesterday', now))).toEqual(['Wed Oct 14 2026', 'Thu Oct 15 2026']);
  });
  it('last week is the previous Monday–Sunday', () => {
    expect(d(parseDateRange('last week', now))).toEqual(['Mon Oct 05 2026', 'Mon Oct 12 2026']);
  });
  it('this month', () => {
    expect(d(parseDateRange('this month', now))).toEqual(['Thu Oct 01 2026', 'Sun Nov 01 2026']);
  });
  it('weekday and last N days', () => {
    expect(d(parseDateRange('monday', now))).toEqual(['Mon Oct 12 2026', 'Tue Oct 13 2026']);
    expect(d(parseDateRange('last 3 days', now))).toEqual(['Tue Oct 13 2026', 'Fri Oct 16 2026']);
  });
  it('non-date phrases', () => {
    expect(parseDateRange('called landlord', now)).toBeNull();
  });
});

describe('normalize', () => {
  it('plurals', () => {
    expect(singular('passwords')).toBe('password');
    expect(singular('groceries')).toBe('grocery');
    expect(singular('keys')).toBe('key');
    expect(singular('boxes')).toBe('box');
    expect(singular('glasses')).toBe('glasses');
    expect(singular('address')).toBe('address');
    expect(singular('addresses')).toBe('address');
    expect(singular('children')).toBe('child');
    expect(singular('bus')).toBe('bus');
  });
  it('possessives', () => {
    expect(tokenize("dad's birthday")).toEqual(['dad', 'birthday']);
    expect(tokenize('parents’ address')).toEqual(['parents', 'address']);
    expect(queryTokens("When is my dad's birthday?")).toEqual(['dad', 'birthday']);
  });
  it('name keys', () => {
    expect(nameKey('Passwords')).toBe('password');
    expect(nameKey('Groceries:')).toBe('grocery');
    expect(nameKey("Dad's")).toBe('dad');
  });
  it('filler-only input yields no tokens', () => {
    expect(queryTokens('where is my the')).toEqual([]);
  });
});

describe('value detection', () => {
  it.each(['4321', '4533', '12.03.1960', '2026-10-15', '7:45', 'a@b.de', 'AB12-CD34', '+49 151', 'hunter2', 'XKCD'])('%s is a value', (t) =>
    expect(looksLikeValue(t)).toBe(true));
  it.each(['sofa', 'milk', 'olive', 'oil', 'paper', 'Dad'])('%s is not a value', (t) => expect(looksLikeValue(t)).toBe(false));
});
