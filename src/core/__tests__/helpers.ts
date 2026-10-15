import { BUILTIN_ALIASES } from '../aliases';
import { nameKey } from '../normalize';
import type { Catalog, CatalogCategory, CategoryType } from '../types';

export function catalog(
  cats: Array<[string, CategoryType] | [string, CategoryType, { splitOnSpaces?: boolean }]> = [],
  extraAliases: Array<[string, string]> = [],
): Catalog {
  const categories = new Map<string, CatalogCategory>();
  for (const [name, type, opts] of cats) {
    const key = nameKey(name);
    categories.set(key, { key, name, type, splitOnSpaces: opts?.splitOnSpaces ?? false });
  }
  const aliases = new Map<string, string>();
  for (const [a, t] of [...BUILTIN_ALIASES, ...extraAliases]) aliases.set(nameKey(a), t);
  return { categories, aliases };
}
