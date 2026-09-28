// Every external API the site calls, under the `provider` its client writes on each ApiUsageLog row,
// with what the request dashboard (/vestiaire/requetes) says about it and the limit it is watched against.

export const API_PROVIDERS = {
  "free-api-live-football-data": {
    name: "Free API Live Football Data",
    role: "Calendrier et scores en direct (RapidAPI)",
    limit: "Plafond du site sur une heure glissante (LIVE_FOOTBALL_MAX_REQUESTS_PER_HOUR, 1000 par défaut), en plus du quota du plan RapidAPI.",
  },
  "the-odds-api": {
    name: "The Odds API",
    role: "Cotes des bookmakers",
    limit: "Crédits mensuels : un appel de cotes coûte une région × un marché (4 avec eu,fr et h2h,totals), la liste des sports est gratuite.",
  },
  "football-data.org": {
    name: "football-data.org",
    role: "Classements et résultats des clubs",
    limit: "10 requêtes par minute sur le plan gratuit : le client en espace une toutes les 7 s.",
  },
  thesportsdb: {
    name: "TheSportsDB",
    role: "Logos des clubs et des compétitions",
    limit: "30 requêtes par minute sur la clé gratuite : le client en espace une toutes les 2,1 s.",
  },
  "international-results": {
    name: "international_results",
    role: "Résultats des sélections (CSV sur GitHub)",
    limit: "Ni clé ni quota : trois fichiers par synchro.",
  },
} as const satisfies Record<string, { name: string; role: string; limit: string }>;

export type ApiProvider = keyof typeof API_PROVIDERS;

export const API_PROVIDER_KEYS = Object.keys(API_PROVIDERS) as ApiProvider[];

/** Requests a provider allows per minute, for those whose limit is per minute. */
export const PER_MINUTE_LIMITS: Partial<Record<ApiProvider, number>> = {
  "football-data.org": 10,
  thesportsdb: 30,
};

export function isApiProvider(value: string): value is ApiProvider {
  return Object.hasOwn(API_PROVIDERS, value);
}

/** The provider's display name; a provider missing from the table (an older row) shows as stored. */
export function apiProviderName(provider: string): string {
  return isApiProvider(provider) ? API_PROVIDERS[provider].name : provider;
}
