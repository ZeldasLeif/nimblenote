// Turns a search document into what the peek card and result rows display.

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

export function viewDoc(doc: Doc): DocView | null {
  const [kind, idStr] = doc.id.split(':');
  const id = Number(idStr);
  if (kind === 'n') {
    const n = store.getState().notes.find((x) => x.id === id);
    if (!n) return null;
    return { title: n.text, detail: fmtDateTime(n.createdAt), categoryId: null, noteId: n.id, photoUri: null, hidden: false };
  }
  if (kind === 'c') {
    const c = store.categoryById(id);
    if (!c) return null;
    const entries = store.entriesOf(c.id);
    let detail: string;
    if (c.type === 'place') {
      const cur = store.placeHistory(c.id)[0];
      detail = cur ? `${c.sensitive ? '••••••' : cur.value} · ${relTime(cur.createdAt)}` : 'No location yet';
    } else if (c.type === 'fact') {
      const only = entries.length === 1 ? entries[0] : null;
      if (only && !c.sensitive && !only.sensitive) detail = only.key ? `${only.key}: ${only.value}` : only.value ?? '';
      else detail = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${c.sensitive ? ' · hidden' : ''}`;
    } else {
      const names = entries.slice(0, 4).map((e) => (c.sensitive ? '•••' : e.value)).join(', ');
      detail = entries.length ? `${entries.length} · ${names}${entries.length > 4 ? ', …' : ''}` : 'Empty list';
    }
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
      detail: hidden ? '•••••• · tap to show' : e.value ?? '',
      categoryId: c.id, noteId: null, photoUri: null, hidden,
    };
  }
  return { title: hidden ? '•••' : e.value ?? '', detail: `in ${c.name}`, categoryId: c.id, noteId: null, photoUri: null, hidden };
}
