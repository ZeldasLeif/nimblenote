import * as Location from 'expo-location';

export type LocResult =
  | { ok: true; latitude: number; longitude: number; accuracy: number | null; address: string | null }
  | { ok: false; reason: 'denied' | 'disabled' | 'error'; message: string };

export async function currentLocation(withAddress: boolean): Promise<LocResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, reason: 'denied', message: 'Location permission was denied. You can allow it in Android settings.' };
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      return { ok: false, reason: 'disabled', message: 'Location is turned off on this phone.' };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude, accuracy } = pos.coords;
    let address: string | null = null;
    if (withAddress) {
      try {
        const [a] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (a) {
          address = a.formattedAddress
            ?? [[a.street, a.streetNumber].filter(Boolean).join(' '), [a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
            ?? null;
        }
      } catch {
        address = null; // geocoder unavailable (offline or no Play services)
      }
    }
    return { ok: true, latitude, longitude, accuracy: accuracy ?? null, address: address || null };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Could not get location' };
  }
}
