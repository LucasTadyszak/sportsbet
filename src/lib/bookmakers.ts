// Which book plays which role in the methodology:
//   sharp    — Pinnacle: low margin, professional clientele. Weighs double in the
//              consensus, is the reference for CLV, steam and reverse line movement.
//   exchange — Betfair / Matchbook / Smarkets back prices: the real-money anchor.
//   soft     — everything else: the "public" books, and the ones we can actually bet at.
import type { BookClassifier, BookRole } from "@/lib/methodology/signals";

const SHARP_BOOKS = new Set(["pinnacle"]);
const EXCHANGE_BOOKS = new Set(["betfair_ex_eu", "betfair_ex_uk", "betfair_ex_au", "matchbook", "smarkets"]);

export function bookRole(bookmakerKey: string): BookRole {
  if (SHARP_BOOKS.has(bookmakerKey)) return "sharp";
  if (EXCHANGE_BOOKS.has(bookmakerKey)) return "exchange";
  return "soft";
}

/**
 * Books a pick may be placed at. BETTABLE_BOOKMAKERS (comma-separated Odds API keys,
 * e.g. "winamax_fr,betclic_fr,unibet_fr") restricts it to the accounts actually held;
 * by default every soft book counts — Pinnacle and the exchanges aren't open to
 * French residents, so their prices only ever inform, never get "taken".
 */
function bettableSet(): Set<string> | null {
  const fromEnv = process.env.BETTABLE_BOOKMAKERS;
  if (!fromEnv) return null;
  const keys = fromEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
}

export function bookClassifier(): BookClassifier {
  const bettable = bettableSet();
  return {
    role: bookRole,
    isBettable: (key) => (bettable ? bettable.has(key) : bookRole(key) === "soft"),
  };
}
