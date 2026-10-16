// Turns a search document into what the answer cards display: a bold title and one labelled detail line.

import type { Doc } from '../core/match';
import { store } from '../services/appStore';
import { fmtDateTime, relTime } from './format';

export interface DocView {
  title: string;
  detail: string;
  categoryId: number | null;
  noteId: number | null;
  photoUri: string | null;
  hidden: boolean;
}

const HIDDEN = '••••••';

export function viewDoc(doc: Doc): DocView | null {
  const [kind, idStr] = doc.id.split(':');
  const id = Number(idStr);
  if (kind === 'n') {
    const n = store.getState().notes.find((x) => x.id === id);
    if (!n) return null;
    return { title: n.text, detail: `Note · ${fmtDateTime(n.createdAt)}`, categoryId: null, noteId: n.id, photoUri: null, hidden: false };
  }
  if (kind === 'c') {
    const c = store.categoryById(id);
    if (!c) return null;
    const entries = store.entriesOf(c.id);
    let detail: string;
    if (c.type === 'place') {
      const cur = store.placeHistory(c.id)[0];
      detail = cur ? `Location: ${c.sensitive ? HIDDEN : cur.value} · ${relTime(cur.createdAt)}` : 'Location: not set yet';
    } else if (c.type === 'fact') {
      const only = entries.length === 1 ? entries[0] : null;
      if (only && !c.sensitive && !only.sensitive) detail = only.key ? `${only.key}: ${only.value}` : only.value ?? '';
      else detail = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${c.sensitive ? ' · hidden' : ''}`;
    } else {
      const subs = store.childrenOf(c.id);
      const names = [...subs.map((x) => x.name), ...entries.map((e) => (c.sensitive ? '•••' : e.value))].slice(0, 4).join(', ');
      const count = [
        subs.length ? `${subs.length} ${subs.length === 1 ? 'list' : 'lists'}` : '',
        entries.length ? `${entries.length} ${entries.length === 1 ? 'item' : 'items'}` : '',
      ].filter(Boolean).join(', ');
      const total = subs.length + entries.length;
      detail = total ? `List · ${count}: ${names}${total > 4 ? ', …' : ''}` : 'List · empty';
    }
    const parent = c.parentId !== null ? store.categoryById(c.parentId) : undefined;
    if (parent) detail = `${detail} · in ${parent.name}`;
    return { title: c.name, detail, categoryId: c.id, noteId: null, photoUri: c.photoUri, hidden: c.sensitive };
  }
  const e = store.entryById(id);
  if (!e) return null;
  const c = store.categoryById(e.categoryId);
  if (!c) return null;
  const hidden = c.sensitive || e.sensitive || e.value === null;
  if (c.type === 'fact') {
    return {
      title: e.key ? `${c.name} · ${e.key}` : c.name,
      detail: hidden ? `${HIDDEN} · tap to open` : e.value ?? '',
      categoryId: c.id, noteId: null, photoUri: null, hidden,
    };
  }
  const amount = e.amount ? ` · ${e.amount}` : '';
  return { title: hidden ? '•••' : e.value ?? '', detail: `In ${c.name}${amount}`, categoryId: c.id, noteId: null, photoUri: null, hidden };
}
