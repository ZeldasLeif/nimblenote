// The one-line preview shown under the input: states exactly what Enter will do.

import { formatDuration } from './duration';
import type { Command, ListItem } from './types';

export type PreviewTone = 'neutral' | 'write' | 'action' | 'calc' | 'warn';
export interface Preview { text: string; tone: PreviewTone; note?: string }

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function quoteList(items: ListItem[]): string {
  return items.map((i) => `“${i.text}”${i.amount ? ` (${i.amount})` : ''}`).join(', ');
}

export function describe(cmd: Command): Preview | null {
  switch (cmd.kind) {
    case 'empty':
    case 'read':
      return null;
    case 'calc':
      return cmd.result === null ? null : { text: `= ${cmd.result}`, tone: 'calc' };
    case 'invalid':
      return { text: cmd.message, tone: 'warn' };
    case 'write': {
      const c = cmd.category;
      const where = c.parent ? ` inside “${c.parent.name}”` : '';
      const verb = c.isNew ? `New ${c.type} “${c.name}”${where}` : c.name;
      const note = cmd.notes[0];
      switch (cmd.payload.type) {
        case 'list': {
          const items = cmd.payload.items;
          if (items.length === 0) {
            return c.isNew
              ? { text: `↵ Create list “${c.name}”${where}`, tone: 'write', note }
              : { text: `${c.name} already exists`, tone: 'neutral', note };
          }
          const n = items.length;
          return { text: `↵ ${verb}: add ${n} item${n === 1 ? '' : 's'} ${quoteList(items)}`, tone: 'write', note };
        }
        case 'fact': {
          const k = cmd.payload.key ? `${cmd.payload.key} = ` : '';
          return { text: `↵ ${verb}: save ${k}${cmd.payload.value}`, tone: 'write', note };
        }
        case 'place':
          return { text: `↵ ${c.name} is now at “${cmd.payload.location}”`, tone: 'write', note };
      }
      return null;
    }
    case 'note-add':
      return { text: `↵ Save note with timestamp`, tone: 'write' };
    case 'note-query':
      return { text: `↵ Notes: ${cmd.label}`, tone: 'neutral' };
    case 'timer': {
      const label = cmd.label ? ` “${cmd.label}”` : '';
      if (cmd.at !== null) return { text: `↵ Alarm${label} at ${fmtClock(cmd.at)} (in ${formatDuration(cmd.ms)})`, tone: 'action' };
      return { text: `↵ Timer${label} for ${formatDuration(cmd.ms)}`, tone: 'action' };
    }
    case 'loc':
      return { text: '↵ Show current location', tone: 'action' };
    case 'photo':
      return { text: `↵ Take a photo for “${cmd.category.name}”`, tone: 'action' };
    case 'list-categories':
      return { text: '↵ Show all lists and categories', tone: 'neutral' };
    case 'open-category':
      return { text: `↵ Open ${cmd.key}`, tone: 'neutral' };
    case 'settings':
      return { text: '↵ Open settings', tone: 'neutral' };
    case 'help':
      return { text: '↵ Show grammar help', tone: 'neutral' };
    case 'undo':
      return { text: '↵ Undo last change', tone: 'action' };
  }
}
