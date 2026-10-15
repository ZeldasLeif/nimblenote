// Durations ("90s", "30m", "1h", "1h30m", "1.5h", "10 min", bare "5" = minutes) and clock times ("7:30", "7pm").

const UNIT_MS: Record<string, number> = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
  h: 3600000, hr: 3600000, hrs: 3600000, hour: 3600000, hours: 3600000,
};

/** Parses one compact duration token like "90s", "1h30m", "1.5h", or a bare number (minutes). */
export function parseDurationToken(token: string): number | null {
  const t = token.toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60000);
  const re = /(\d+(?:\.\d+)?)(hours?|hrs|hr|h|minutes?|mins|min|m|seconds?|secs|sec|s)/gy;
  let total = 0;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    total += parseFloat(m[1]) * UNIT_MS[m[2]];
    consumed = re.lastIndex;
  }
  if (consumed !== t.length || total <= 0) return null;
  return Math.round(total);
}

export type DurationMatch = { ms: number; start: number; count: number };

/**
 * Finds a duration in a token list. Accepts compact tokens ("1h30m") and spaced forms ("1 h 30 m",
 * "10 min", "2 hours"). Prefers a match at the end, then at the start.
 */
export function findDuration(tokens: string[]): DurationMatch | null {
  const tryAt = (start: number): DurationMatch | null => {
    let i = start;
    let total = 0;
    while (i < tokens.length) {
      const tok = tokens[i].toLowerCase();
      const next = tokens[i + 1]?.toLowerCase();
      if (/^\d+(\.\d+)?$/.test(tok) && next && UNIT_MS[next] !== undefined) {
        total += parseFloat(tok) * UNIT_MS[next];
        i += 2;
        continue;
      }
      const compact = /^\d/.test(tok) && !/^\d+(\.\d+)?$/.test(tok) ? parseDurationToken(tok) : null;
      if (compact !== null) { total += compact; i += 1; continue; }
      break;
    }
    if (total > 0) return { ms: Math.round(total), start, count: i - start };
    // Bare number = minutes, only as a single token.
    if (/^\d+(\.\d+)?$/.test(tokens[start] ?? '')) {
      return { ms: Math.round(parseFloat(tokens[start]) * 60000), start, count: 1 };
    }
    return null;
  };
  // End: find the earliest start whose match reaches the end.
  for (let s = 0; s < tokens.length; s++) {
    const m = tryAt(s);
    if (m && m.start + m.count === tokens.length) return m;
  }
  return tryAt(0);
}

export type ClockMatch = { hours: number; minutes: number; start: number; count: number };

/** Finds a clock time like "7:30", "07:30", "7pm", "7:30pm", "7 pm". */
export function findClock(tokens: string[]): ClockMatch | null {
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();
    let m = /^(\d{1,2}):(\d{2})(am|pm)?$/.exec(tok);
    let count = 1;
    let mer = m?.[3];
    if (!m) {
      m = /^(\d{1,2})(am|pm)$/.exec(tok);
      mer = m?.[2];
      if (m) m = [m[0], m[1], '00', mer!] as unknown as RegExpExecArray;
    }
    if (!m && /^\d{1,2}(:\d{2})?$/.test(tok) && (next === 'am' || next === 'pm')) {
      const [h, mm] = tok.split(':');
      m = [tok, h, mm ?? '00'] as unknown as RegExpExecArray;
      mer = next;
      count = 2;
    }
    if (!m) continue;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    return { hours: h, minutes: min, start: i, count };
  }
  return null;
}

/** Next occurrence of a clock time strictly after `now`. */
export function nextClockTime(hours: number, minutes: number, now: Date): Date {
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}
