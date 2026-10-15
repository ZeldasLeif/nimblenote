// Date-range phrases for note queries: today, yesterday, this/last week, this/last month,
// this year, last N days, weekday names. Weeks start on Monday.

export type DateRange = { start: number; end: number; label: string };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
}

/** Returns a range if the WHOLE phrase is a date expression, else null. */
export function parseDateRange(phrase: string, now: Date): DateRange | null {
  const p = phrase.toLowerCase().replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim();
  const today = startOfDay(now);
  const r = (start: Date, end: Date, label: string): DateRange => ({ start: start.getTime(), end: end.getTime(), label });

  switch (p) {
    case 'today': return r(today, addDays(today, 1), 'today');
    case 'yesterday': return r(addDays(today, -1), today, 'yesterday');
    case 'this week': case 'week': return r(startOfWeek(now), addDays(startOfWeek(now), 7), 'this week');
    case 'last week': case 'previous week': {
      const s = addDays(startOfWeek(now), -7);
      return r(s, addDays(s, 7), 'last week');
    }
    case 'this month': case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return r(s, new Date(now.getFullYear(), now.getMonth() + 1, 1), 'this month');
    }
    case 'last month': case 'previous month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return r(s, new Date(now.getFullYear(), now.getMonth(), 1), 'last month');
    }
    case 'this year': case 'year': {
      const s = new Date(now.getFullYear(), 0, 1);
      return r(s, new Date(now.getFullYear() + 1, 0, 1), 'this year');
    }
  }
  const lastN = /^(?:last|past) (\d+) days?$/.exec(p);
  if (lastN) {
    const n = parseInt(lastN[1], 10);
    return r(addDays(today, -(n - 1)), addDays(today, 1), `last ${n} days`);
  }
  const wd = /^(?:last |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(p);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]);
    let back = (today.getDay() - target + 7) % 7;
    if (back === 0 && p.startsWith('last')) back = 7;
    const s = addDays(today, -back);
    return r(s, addDays(s, 1), wd[1]);
  }
  return null;
}
