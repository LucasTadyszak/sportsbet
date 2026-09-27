// The Odds API and the international results dataset don't always name a country the same way
// ("USA" / "United States", "Korea Republic" / "South Korea", "Czechia" / "Czech Republic").
// Names are compared after normalisation plus a table of known variants — never by substring
// like club names are (teamNameMatch.ts): that would happily turn "Ireland" into "Northern
// Ireland" or "Guinea" into "Equatorial Guinea". A name that doesn't match gets no model.

/** Lowercase, no accents or punctuation, "&" → "and", "St." → "saint". */
export function normalizeCountryName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (word === "st" ? "saint" : word))
    .join(" ");
}

// Normalised variant → normalised dataset name.
const VARIANTS = new Map<string, string>(Object.entries({
  usa: "united states",
  us: "united states",
  "united states of america": "united states",
  korea: "south korea",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "korea dpr": "north korea",
  "dpr korea": "north korea",
  ireland: "republic of ireland",
  "rep of ireland": "republic of ireland",
  czechia: "czech republic",
  turkiye: "turkey",
  "cote d ivoire": "ivory coast",
  "cote divoire": "ivory coast",
  bosnia: "bosnia and herzegovina",
  "bosnia herzegovina": "bosnia and herzegovina",
  macedonia: "north macedonia",
  "fyr macedonia": "north macedonia",
  "congo dr": "dr congo",
  "democratic republic of congo": "dr congo",
  "democratic republic of the congo": "dr congo",
  "republic of congo": "congo",
  "republic of the congo": "congo",
  "congo republic": "congo",
  "cape verde islands": "cape verde",
  "cabo verde": "cape verde",
  "chinese taipei": "taiwan",
  "china pr": "china",
  "ir iran": "iran",
  "kyrgyz republic": "kyrgyzstan",
  "saint vincent": "saint vincent and the grenadines",
  "saint vincent grenadines": "saint vincent and the grenadines",
  "saint kitts": "saint kitts and nevis",
  "sao tome": "sao tome and principe",
  "east timor": "timor leste",
  "the gambia": "gambia",
  "the bahamas": "bahamas",
  "brunei darussalam": "brunei",
  "hong kong china": "hong kong",
  macao: "macau",
  uae: "united arab emirates",
  "turks and caicos": "turks and caicos islands",
  "us virgin islands": "united states virgin islands",
  "state of palestine": "palestine",
  "viet nam": "vietnam",
  "lao pdr": "laos",
  "syrian arab republic": "syria",
  "russian federation": "russia",
  "republic of moldova": "moldova",
  swaziland: "eswatini",
  holland: "netherlands",
  "the netherlands": "netherlands",
  burma: "myanmar",
}));

// Women's, youth and Olympic sides share the country's name but not its results.
const NOT_SENIOR_MEN = /\b(women|womens|ladies|w|u\d{2}|olympic)\b/;

export type NationalTeamIndex = Map<string, string>;

/** Dataset team names by normalised name. */
export function nationalTeamIndex(datasetNames: Iterable<string>): NationalTeamIndex {
  const index: NationalTeamIndex = new Map();
  for (const name of datasetNames) {
    const key = normalizeCountryName(name);
    if (!index.has(key)) index.set(key, name);
  }
  return index;
}

/**
 * The dataset name of an Odds API national team, or null (unknown, or not the senior men's
 * side). The same spelling wins over a known variant, so the day the dataset renames a team
 * ("Turkey" → "Türkiye") the match follows it.
 */
export function matchNationalTeam(oddsApiName: string, index: NationalTeamIndex): string | null {
  const normalized = normalizeCountryName(oddsApiName);
  if (!normalized || NOT_SENIOR_MEN.test(normalized)) return null;
  const variant = VARIANTS.get(normalized);
  return index.get(normalized) ?? (variant ? index.get(variant) : undefined) ?? null;
}
