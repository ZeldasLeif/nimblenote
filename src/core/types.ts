export type CategoryType = 'list' | 'fact' | 'place';

export interface CatalogCategory {
  key: string; // normalized name, unique
  name: string; // display name as first typed
  type: CategoryType;
  splitOnSpaces: boolean;
}

/** Read-only snapshot the pure parser needs to resolve names. */
export interface Catalog {
  categories: ReadonlyMap<string, CatalogCategory>;
  /** alias key (normalized with nameKey) -> target category display name */
  aliases: ReadonlyMap<string, string>;
}

export type InputContext = { kind: 'none' } | { kind: 'category'; key: string };

export type CategoryRef = { key: string; name: string; type: CategoryType; isNew: boolean };

export type WritePayload =
  | { type: 'list'; items: string[] }
  | { type: 'fact'; key: string | null; value: string }
  | { type: 'place'; location: string };

export type Command =
  | { kind: 'empty' }
  | { kind: 'calc'; expr: string; result: string | null }
  | { kind: 'write'; category: CategoryRef; payload: WritePayload; notes: string[] }
  | { kind: 'note-add'; text: string }
  | { kind: 'note-query'; range: { start: number; end: number } | null; label: string }
  | { kind: 'timer'; ms: number; label: string; at: number | null }
  | { kind: 'loc' }
  | { kind: 'photo'; category: CategoryRef }
  | { kind: 'list-categories' }
  | { kind: 'open-category'; key: string }
  | { kind: 'settings' }
  | { kind: 'help' }
  | { kind: 'undo' }
  | { kind: 'read'; tokens: string[]; raw: string }
  | { kind: 'invalid'; message: string };
