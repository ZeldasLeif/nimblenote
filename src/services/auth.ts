// Device authentication (biometric or device PIN/pattern) via expo-local-authentication.

import * as LocalAuthentication from 'expo-local-authentication';

const UNLOCK_WINDOW_MS = 60_000;
let lastAuthAt = 0;

export type AuthResult = { ok: true; noDeviceLock?: boolean } | { ok: false; reason: string };

export async function deviceHasLock(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

/**
 * Asks for biometrics or the device credential. Reuses a successful authentication for 60 s
 * so revealing several values in a row does not prompt every time.
 */
export async function authenticate(reason: string, force = false): Promise<AuthResult> {
  if (!force && Date.now() - lastAuthAt < UNLOCK_WINDOW_MS) return { ok: true };
  if (!(await deviceHasLock())) return { ok: true, noDeviceLock: true };
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  if (r.success) {
    lastAuthAt = Date.now();
    return { ok: true };
  }
  return { ok: false, reason: r.error === 'user_cancel' || r.error === 'system_cancel' ? 'Cancelled' : 'Not authenticated' };
}

export function forgetAuth(): void {
  lastAuthAt = 0;
}
