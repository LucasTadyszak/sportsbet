// Client-side state of the bet slip: the user's bankroll and the prices they picked. It
// lives in localStorage, so a bankroll never reaches the server, and every component on
// the page reads it through useSyncExternalStore. Import from client components only.
import { useSyncExternalStore } from "react";
import {
  EMPTY_SLIP,
  keptStakes,
  parseStoredSlip,
  refreshSelection,
  selectionKey,
  toggleSelection,
  upcomingOnly,
  withStake,
  type Selection,
  type SlipMode,
  type StoredSlip,
} from "@/lib/selection";

export type SlipState = StoredSlip & { open: boolean };

const STORAGE_KEY = "sportsbet:slip:v1";
const SERVER_STATE: SlipState = { ...EMPTY_SLIP, open: false };

let state: SlipState | null = null;
const listeners = new Set<() => void>();

function readStorage(): StoredSlip {
  try {
    return parseStoredSlip(window.localStorage.getItem(STORAGE_KEY), new Date());
  } catch {
    return EMPTY_SLIP; // storage blocked (private browsing, cookies disabled)
  }
}

function snapshot(): SlipState {
  state ??= { ...readStorage(), open: false };
  return state;
}

function emit() {
  for (const listener of listeners) listener();
}

function update(change: Partial<SlipState>) {
  const next = { ...snapshot(), ...change };
  // A match that kicks off while the page is open leaves the slip at its next change.
  const upcoming = upcomingOnly(next.selections, new Date());
  state = { ...next, selections: upcoming, stakes: keptStakes(next.stakes, upcoming) };
  const { bankroll, selections, mode, stakes } = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bankroll, selections, mode, stakes }));
  } catch {
    // Not persisted, but the slip keeps working for this page view.
  }
  emit();
}

// Another tab changed the slip (key is null when that tab cleared all storage).
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  state = { ...readStorage(), open: snapshot().open };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** The slip as this browser holds it — empty while server-rendering and hydrating. */
export function useBetSlip(): SlipState {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_STATE);
}

export const betSlip = {
  toggle: (selection: Selection) => update({ selections: toggleSelection(snapshot().selections, selection) }),
  refresh: (seen: Selection) => {
    const selections = refreshSelection(snapshot().selections, seen);
    if (selections) update({ selections });
  },
  remove: (key: string) => update({ selections: snapshot().selections.filter((s) => selectionKey(s) !== key) }),
  clear: () => update({ selections: [] }),
  /** Drops the selections whose match has kicked off since the slip last changed. */
  dropStarted: () => update({}),
  setBankroll: (bankroll: number | null) => update({ bankroll }),
  setMode: (mode: SlipMode) => update({ mode }),
  /** The stake of a single bet (its selectionKey) or of the combo (COMBO_STAKE); null goes back to the advised one. */
  setStake: (key: string, amount: number | null) => update({ stakes: withStake(snapshot().stakes, key, amount) }),
  open: () => update({ open: true }),
  close: () => update({ open: false }),
};
