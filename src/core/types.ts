export type CategoryType = 'list' | 'fact' | 'place';

export interface CatalogCategory {
  key: string; // normalized name, unique
  name: string; // display name as first typed
  type: CategoryType;
  splitOnSpaces: boolean;
  /** Key of the parent list for a sub-list (one level of nesting), else null. */
  parentKey?: string | null;
}

/** Read-only snapshot the pure parser needs to resolve names. */
export interface Catalog {
  categories: ReadonlyMap<string, CatalogCategory>;
  /** alias key (normalized with nameKey) -> target category display name */
  aliases: ReadonlyMap<string, string>;
  /** Lowercased list item text -> keys of the top-level lists containing it (for turning an item into a sub-list). */
  items?: ReadonlyMap<string, string[]>;
}

export type InputContext = { kind: 'none' } | { kind: 'category'; key: string };

export type CategoryRef = {
  key: string;
  name: string;
  type: CategoryType;
  isNew: boolean;
  /** For a new sub-list: the list it goes into (created too if new). */
  parent?: { key: string; name: string; isNew: boolean } | null;
  /** True when an existing item of the parent list with this name becomes the sub-list. */
  promote?: boolean;
};

/** A list item; `amount` comes from "eggs:5" / "flour:1kg" and is shown in its own column. */
export type ListItem = { text: string; amount: string | null };

export type WritePayload =
  | { type: 'list'; items: ListItem[] }
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
