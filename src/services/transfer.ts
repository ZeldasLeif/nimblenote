// JSON export (share sheet) and import (document picker). Everything stays on the device unless the user shares the file.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { store } from './appStore';

export async function exportToFile(): Promise<string> {
  const data = await store.exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `nimblenote-export-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(data, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save NimbleNote export' });
    return 'Export ready';
  }
  return `Saved to ${file.uri}`;
}

export async function importFromFile(): Promise<string> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return 'Import cancelled';
  const text = await new File(r.assets[0].uri).text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { return 'That file is not valid JSON'; }
  return (await store.importAll(data)).message;
}
