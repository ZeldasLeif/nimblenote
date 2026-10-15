// The app-wide Store instance. The database opens lazily on first use so the first frame never waits for it.

import { useSyncExternalStore } from 'react';
import type { DbAdapter } from '../data/adapter';
import { createExpoCrypto, openExpoDb } from '../data/expoAdapters';
import { type State, Store } from '../data/store';

let dbPromise: Promise<DbAdapter> | null = null;
const db = () => (dbPromise ??= openExpoDb());

const lazyDb: DbAdapter = {
  exec: async (sql) => (await db()).exec(sql),
  run: async (sql, params) => (await db()).run(sql, params),
  all: async (sql, params) => (await db()).all(sql, params),
  transaction: async (task) => (await db()).transaction(task),
};

export const store = new Store(lazyDb, createExpoCrypto());

let initPromise: Promise<void> | null = null;
export function initStore(): Promise<void> {
  return (initPromise ??= store.init());
}

export function useAppState(): State {
  return useSyncExternalStore(store.subscribe, store.getState);
}
