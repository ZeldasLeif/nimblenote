// Cold-start measurement: from the first line of app JavaScript to the input being focused.
// (Expo Go's own launch and bundle download happen before this and are not included.)

declare const globalThis: { __nnStart?: number };

let focusedAt: number | null = null;

export function markFocused(): void {
  if (focusedAt === null) focusedAt = Date.now();
}

export function startupMs(): number | null {
  const start = globalThis.__nnStart;
  return start && focusedAt ? focusedAt - start : null;
}
