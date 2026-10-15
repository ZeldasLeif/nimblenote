// Minimal database and crypto interfaces so the store can run on expo-sqlite in the app
// and on node:sqlite in tests.

export type SqlParam = string | number | null;

export interface DbAdapter {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ lastInsertRowId: number; changes: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  transaction(task: () => Promise<void>): Promise<void>;
}

export interface CryptoAdapter {
  encrypt(plain: string): Promise<string>;
  decrypt(sealed: string): Promise<string>;
}
