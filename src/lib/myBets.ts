// Client-side store of the saved bets ("Mes paris", src/lib/savedBets.ts). Like the slip
// (src/lib/betSlip.ts), they live in localStorage: all the server ever sees is the ids of their
// matches, to say where those stand. Import from client components only.
import { useSyncExternalStore } from "react";
import { parseSavedBets, withResults, type MatchResults, type SavedBet } from "@/lib/savedBets";

const STORAGE_KEY = "sportsbet:bets:v1";

let bets: SavedBet[] | null = null;
const listeners = new Set<() => void>();

function readStorage(): SavedBet[] {
  try {
    return parseSavedBets(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return []; // storage blocked (private browsing, cookies disabled)
  }
}

function snapshot(): SavedBet[] {
  bets ??= readStorage();
  return bets;
}

function emit() {
  for (const listener of listeners) listener();
}

function save(next: SavedBet[]) {
  bets = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bets: next }));
  } catch {
    // Not persisted, but the bets stay listed for this page view.
  }
  emit();
}

// Another tab saved or removed a bet (key is null when that tab cleared all storage).
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  bets = readStorage();
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

/** The saved bets, latest first — null while server-rendering and hydrating, before this browser's are known. */
export function useMyBets(): SavedBet[] | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** A new bet's id: unique enough for one browser's list. */
export function newBetId(now = new Date()): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const myBets = {
  add: (added: SavedBet[]) => save([...added, ...snapshot()]),
  remove: (id: string) => save(snapshot().filter((bet) => bet.id !== id)),
  /** Keeps the results that just became final, so those matches are never asked for again. */
  recordResults: (fresh: MatchResults) => {
    const next = withResults(snapshot(), fresh);
    if (next) save(next);
  },
};
