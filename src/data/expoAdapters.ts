// Device implementations: expo-sqlite for storage, expo-crypto AES-GCM with a key in expo-secure-store.

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { CryptoAdapter, DbAdapter, SqlParam } from './adapter';

export async function openExpoDb(name = 'nimblenote.db'): Promise<DbAdapter> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const r = await db.runAsync(sql, params);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    all: <T,>(sql: string, params: SqlParam[] = []) => db.getAllAsync<T>(sql, params),
    transaction: (task) => db.withTransactionAsync(task),
  };
}

const KEY_NAME = 'nimblenote.aes.v1';

function utf8(s: string): Uint8Array { return new TextEncoder().encode(s); }
function fromUtf8(b: Uint8Array): string { return new TextDecoder().decode(b); }

/** AES-256-GCM. The key is generated once and kept in the Android Keystore-backed secure store. */
export function createExpoCrypto(): CryptoAdapter {
  let keyPromise: Promise<Crypto.AESEncryptionKey> | null = null;
  const key = () => {
    keyPromise ??= (async () => {
      const stored = await SecureStore.getItemAsync(KEY_NAME);
      if (stored) return Crypto.AESEncryptionKey.import(stored, 'base64');
      const k = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256);
      await SecureStore.setItemAsync(KEY_NAME, await k.encoded('base64'));
      return k;
    })();
    return keyPromise;
  };
  return {
    async encrypt(plain) {
      const sealed = await Crypto.aesEncryptAsync(utf8(plain), await key());
      return sealed.combined('base64');
    },
    async decrypt(sealedB64) {
      const sealed = Crypto.AESSealedData.fromCombined(sealedB64);
      const bytes = await Crypto.aesDecryptAsync(sealed, await key(), { output: 'bytes' });
      return fromUtf8(bytes);
    },
  };
}
