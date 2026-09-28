// The easter egg that opens the hidden console (/vestiaire): the Konami code typed anywhere on the
// site, or seven quick taps on its logo (phones have no arrow keys). Either sets a short-lived
// cookie that makes /vestiaire show its lock rather than a 404. It only hides the door: what keeps
// the console shut is its code, checked on the server (src/lib/adminSession.ts).

export const VESTIAIRE_PATH = "/vestiaire";
export const KNOCK_COOKIE = "vestiaire_porte";
/** How long a knock keeps the lock on show, in seconds. */
export const KNOCK_MAX_AGE_S = 10 * 60;

export const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/** The last keys typed, `key` (a KeyboardEvent key) included, and whether they spell the code. */
export function typeKey(keys: string[], key: string): { keys: string[]; open: boolean } {
  const typed = [...keys, key.length === 1 ? key.toLowerCase() : key].slice(-KONAMI.length);
  const open = typed.length === KONAMI.length && typed.every((k, i) => k === KONAMI[i]);
  return { keys: open ? [] : typed, open };
}

export const TAPS_TO_OPEN = 7;
export const TAP_WINDOW_MS = 4_000;

/** The taps on the logo over the last TAP_WINDOW_MS, the one `at` included, and whether there are enough. */
export function tapLogo(taps: number[], at: number): { taps: number[]; open: boolean } {
  const recent = [...taps.filter((t) => at - t < TAP_WINDOW_MS), at];
  const open = recent.length >= TAPS_TO_OPEN;
  return { taps: open ? [] : recent, open };
}
