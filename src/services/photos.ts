import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export type PhotoResult = { ok: true; uri: string } | { ok: false; message: string };

/** Opens the camera and copies the photo into the app's private document directory. */
export async function takePhoto(): Promise<PhotoResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { ok: false, message: 'Camera permission was denied. You can allow it in Android settings.' };
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false });
  if (r.canceled || !r.assets?.[0]) return { ok: false, message: 'No photo taken' };
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${randomUUID()}.jpg`);
  await new File(r.assets[0].uri).copy(dest);
  return { ok: true, uri: dest.uri };
}
