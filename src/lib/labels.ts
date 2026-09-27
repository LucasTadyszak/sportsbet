// French wording and number formatting for everything the methodology produces.
import type { ComboBlocker, OutcomeVerdict, SingleStake } from "@/lib/methodology/stake";
import type { ReasonCode } from "@/lib/methodology/verdict";

export const TIER_INFO: Record<string, { name: string; description: string }> = {
  HERO: {
    name: "HERO",
    description: "Edge ≥ 8 pts, confirmé par au moins deux signaux du marché, avec des données complètes.",
  },
  STRONG_BET: { name: "STRONG BET", description: "Edge ≥ 8 pts : le modèle pense que le marché se trompe nettement." },
  BOSS_PICK: {
    name: "BOSS PICK",
    description: "Edge de 2 à 8 pts, confirmé par l'argent sharp (steam, reverse line movement ou Pinnacle).",
  },
  GOOD_BET: { name: "GOOD BET", description: "Edge de 2 à 8 pts : un vrai désaccord, qui mérite une petite mise." },
  MARGINAL: {
    name: "MARGINAL",
    description: "Tentant, mais une raison d'en douter : dans le bruit du de-vig, trop confiant, sharps contre ou données minces.",
  },
  PASS: { name: "PASS", description: "Pas d'edge, ou une cote de longshot." },
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  EDGE_STRONG: "Edge ≥ 8 pts sur le marché",
  EDGE_GOOD: "Edge entre 2 et 8 pts",
  EDGE_MARGINAL: "Edge entre 0,5 et 2 pts : dans le bruit du de-vig",
  EDGE_NONE: "Modèle et marché d'accord (edge < 0,5 pt)",
  NO_PRICE: "Aucune cote chez un bookmaker jouable",
  LONGSHOT: "Cote de longshot (au-delà de 5.00) : jamais misée",
  NEGATIVE_EV: "La marge du bookmaker mange l'edge (EV < +1 % à la meilleure cote)",
  CLAMPED: "Probabilité plafonnée par le clamp dur",
  TOO_CONFIDENT: "Trop confiant : probabilité au-dessus du plafond, verdict rétrogradé d'un cran",
  THIN_DATA: "Données d'équipe insuffisantes (moins de 5 matchs notés)",
  PARTIAL_DATA: "Données partielles (moins de 10 matchs notés, ou pas de modèle de buts ajusté)",
  STEAM_AGAINST: "Steam contre ce pari : plusieurs books ont bougé dans l'autre sens",
  RLM_AGAINST: "Reverse line movement : Pinnacle part dans l'autre sens que le public",
  SHARPS_DISAGREE: "Les sharps ne suivent pas : Pinnacle est plus bas que les books grand public",
  PREDICTED_MOVE_AGAINST: "La ligne devrait bouger contre ce pari d'ici le coup d'envoi",
  CONFIRM_STEAM: "Steam dans le sens du pari",
  CONFIRM_RLM: "Reverse line movement : Pinnacle soutient ce côté",
  CONFIRM_SHARPS: "Pinnacle est plus haut que les books grand public sur ce côté",
  CONFIRM_STALE: "Cote en retard sur le consensus (« stale ») : +EV",
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code as ReasonCode] ?? code;
}

const PASS_REASON_PRIORITY: ReasonCode[] = [
  "THIN_DATA",
  "SHARPS_DISAGREE",
  "STEAM_AGAINST",
  "RLM_AGAINST",
  "PREDICTED_MOVE_AGAINST",
  "TOO_CONFIDENT",
  "NEGATIVE_EV",
  "LONGSHOT",
  "NO_PRICE",
  "EDGE_MARGINAL",
  "EDGE_NONE",
];

/** The one reason that best explains why a market is passed. */
export function mainPassReason(reasons: string[]): ReasonCode {
  return PASS_REASON_PRIORITY.find((r) => reasons.includes(r)) ?? "EDGE_NONE";
}

export function marketLabel(marketKey: string, point: number | null = null): string {
  if (marketKey === "h2h") return "1X2";
  if (marketKey === "totals") return point === null ? "Total de buts" : `Total de buts ${point}`;
  return marketKey;
}

export function outcomeLabel(marketKey: string, outcomeName: string, point: number | null, homeTeam: string, awayTeam: string): string {
  if (marketKey === "h2h") {
    if (outcomeName === homeTeam) return `1 · ${homeTeam}`;
    if (outcomeName === awayTeam) return `2 · ${awayTeam}`;
    if (outcomeName === "Draw") return "X · Nul";
  }
  if (marketKey === "totals") {
    if (outcomeName === "Over") return `Plus de ${point} buts`;
    if (outcomeName === "Under") return `Moins de ${point} buts`;
  }
  return outcomeName;
}

/** Short 1 / X / 2 / +2.5 / -2.5 code for tight spaces. */
export function outcomeCode(marketKey: string, outcomeName: string, point: number | null, homeTeam: string, awayTeam: string): string {
  if (marketKey === "h2h") return outcomeName === homeTeam ? "1" : outcomeName === awayTeam ? "2" : "X";
  if (marketKey === "totals") return `${outcomeName === "Over" ? "+" : "−"}${point}`;
  return outcomeName;
}

// National-team Elo classes (CompetitionModel codes, see leagueMapping.ts); clubs keep their football-data.org code.
const NATIONAL_CLASS_LABELS: Record<string, string> = {
  "INT-WC": "Coupe du monde",
  "INT-CC": "championnats continentaux (Euro, Copa América, CAN…)",
  "INT-WCQ": "qualifications pour la Coupe du monde",
  "INT-CQ": "qualifications continentales",
  "INT-NL": "Ligues des nations",
  "INT-FRIENDLY": "matchs amicaux",
  "INT-OTHER": "autres tournois",
};

/** "PL" stays "PL"; a national-team class reads "Sélections · Ligues des nations" with `prefixed`. */
export function competitionLabel(code: string, prefixed = false): string {
  const label = NATIONAL_CLASS_LABELS[code];
  if (!label) return code;
  return prefixed ? `Sélections · ${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

export const DATA_QUALITY_LABELS: Record<string, string> = {
  full: "Complètes",
  partial: "Partielles",
  thin: "Insuffisantes",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  won: "Gagné",
  half_won: "½ gagné",
  push: "Remboursé",
  half_lost: "½ perdu",
  lost: "Perdu",
  void: "Annulé",
};

export function formatPct(x: number | null | undefined, digits = 0): string {
  return x === null || x === undefined ? "—" : `${(x * 100).toFixed(digits)}%`;
}

export function formatSignedPct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)}%`;
}

/** Probability points (0.034 → "+3.4 pts"). */
export function formatPts(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)} pts`;
}

export function formatOdds(x: number | null | undefined): string {
  return x === null || x === undefined ? "—" : x.toFixed(2);
}

export function formatUnits(x: number | null | undefined, signed = false): string {
  if (x === null || x === undefined) return "—";
  const sign = signed ? (x >= 0 ? "+" : "−") : x < 0 ? "−" : "";
  return `${sign}${Math.abs(x).toFixed(2)}u`;
}

// The bet slip speaks money, so its amounts and shares read the way French bookmakers
// print them ("7,50 €", "1,5 %"); odds keep the site-wide "2.10".
const MONEY = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const SHARE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const SIGNED_PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

export function formatMoney(amount: number): string {
  return MONEY.format(amount);
}

/** A stake in units as a share of the bankroll (1 u = 1 %): 1.5 → "1,5 %". */
export function formatBankrollShare(units: number): string {
  return `${SHARE.format(units)} %`;
}

export function formatFrPct(x: number, signed = false): string {
  return (signed ? SIGNED_PERCENT : PERCENT).format(x);
}

/** Why a selection gets no stake: a short title and the detail behind it. */
export function stakeBlockerLabel(stake: SingleStake, verdict: OutcomeVerdict | null): { title: string; detail: string } | null {
  switch (stake.blocker) {
    case "NO_MODEL":
      return { title: "Pas d'avis du modèle", detail: "Compétition non couverte, match trop lointain ou ligne secondaire." };
    case "NOT_STAKED":
      return { title: "Le modèle passe", detail: reasonLabel(mainPassReason(verdict?.reasons ?? [])) };
    case "LONGSHOT":
      return { title: "Longshot", detail: REASON_LABELS.LONGSHOT };
    case "NEGATIVE_EV":
      return {
        title: "Cote trop basse",
        detail:
          stake.minPrice !== null
            ? `La marge du bookmaker mange l'edge : il faudrait au moins ${formatOdds(stake.minPrice)}.`
            : "La marge du bookmaker mange l'edge à cette cote.",
      };
    default:
      return null;
  }
}

export const COMBO_BLOCKER_LABELS: Record<ComboBlocker, string> = {
  TOO_FEW_LEGS: "Un combiné demande au moins deux sélections.",
  SAME_EVENT: "Deux sélections du même match ne se combinent pas : gardes-en une par match.",
  LEG_NOT_STAKED: "Chaque sélection doit valoir une mise à elle seule : retire celles à 0 %.",
};
