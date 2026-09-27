// Which book plays which role in the methodology:
//   sharp    — Pinnacle: low margin, professional clientele. Weighs double in the
//              consensus, is the reference for CLV, steam and reverse line movement.
//   exchange — Betfair / Matchbook / Smarkets back prices: the real-money anchor.
//   soft     — everything else: the "public" books.
// Every book feeds the consensus, but only the French ones are ever shown or bet at.
import type { BookClassifier, BookRole } from "@/lib/methodology/signals";

const SHARP_BOOKS = new Set(["pinnacle"]);
const EXCHANGE_BOOKS = new Set(["betfair_ex_eu", "betfair_ex_uk", "betfair_ex_au", "matchbook", "smarkets"]);

export function bookRole(bookmakerKey: string): BookRole {
  if (SHARP_BOOKS.has(bookmakerKey)) return "sharp";
  if (EXCHANGE_BOOKS.has(bookmakerKey)) return "exchange";
  return "soft";
}

/**
 * French-licensed (ANJ) books — The Odds API keys the French variant of a bookmaker with
 * an "_fr" suffix: winamax_fr, betclic_fr, unibet_fr, parionssport_fr, pmu_fr… They are
 * the only books the site displays: Pinnacle, the exchanges and the rest of Europe aren't
 * open to French residents, so their prices only ever inform the consensus.
 */
export function isFrenchBook(bookmakerKey: string): boolean {
  return bookmakerKey.endsWith("_fr");
}

/**
 * Books a pick may be placed at: every French book by default, or exactly the accounts
 * listed in BETTABLE_BOOKMAKERS (comma-separated Odds API keys, e.g. "winamax_fr,betclic_fr").
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
    isBettable: (key) => (bettable ? bettable.has(key) : isFrenchBook(key)),
  };
}
