// Kit colours of a club, as football-data.org words them on its teams ("Red / White",
// "Claret / Sky Blue", "Navy Blue / White / Red"), turned into the hex colours the board
// paints each match block with. A word it doesn't know is skipped rather than guessed.

const COLOR_WORDS: Record<string, string> = {
  white: "#ffffff",
  black: "#111111",
  red: "#d7141a",
  "dark red": "#9b1b1f",
  crimson: "#b3122e",
  scarlet: "#e0301e",
  claret: "#7a263a",
  maroon: "#7a1f2b",
  burgundy: "#7b1e34",
  bordeaux: "#6d1a36",
  garnet: "#7d1f2c",
  grenat: "#7d1f2c",
  wine: "#722f37",
  blue: "#1d4ed8",
  "dark blue": "#1e3a8a",
  "royal blue": "#1f3fae",
  navy: "#1b2a4a",
  "navy blue": "#1b2a4a",
  "sky blue": "#6cabdd",
  "light blue": "#7cc3ee",
  celeste: "#75aadb",
  azure: "#2f7fd8",
  cyan: "#16b3d8",
  turquoise: "#1fb5ac",
  teal: "#0f7c7a",
  yellow: "#fcd116",
  gold: "#d4a017",
  "old gold": "#c9a236",
  amber: "#fdb913",
  orange: "#f47b20",
  tangerine: "#f28c28",
  green: "#1f8a3b",
  "dark green": "#0b5d33",
  "light green": "#7cc66d",
  emerald: "#009b5a",
  lime: "#9ccc3d",
  purple: "#5b2a86",
  violet: "#6d3fa0",
  lilac: "#b39ddb",
  pink: "#f4a6c1",
  magenta: "#c2185b",
  grey: "#8a8f98",
  gray: "#8a8f98",
  silver: "#b8bcc2",
  brown: "#6b4226",
  cream: "#efe6cc",
  beige: "#e8dcc0",
};

/** Kits have two or three colours; more would only turn the stripes into noise. */
const MAX_COLORS = 3;

/** One colour word, dropping leading qualifiers it doesn't know ("Dark Sky Blue" → sky blue). */
function colorOf(word: string): string | null {
  const words = word.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length; start++) {
    const hex = COLOR_WORDS[words.slice(start).join(" ")];
    if (hex) return hex;
  }
  return null;
}

/** "Red / White / Black" → ["#d7141a", "#ffffff", "#111111"]; empty when nothing is recognised. */
export function parseClubColors(clubColors: string | null | undefined): string[] {
  if (!clubColors) return [];
  const colors: string[] = [];
  for (const part of clubColors.split(/\s*(?:\/|,|&|\+|-|\band\b)\s*/i)) {
    const hex = colorOf(part);
    if (hex && !colors.includes(hex)) colors.push(hex);
    if (colors.length === MAX_COLORS) break;
  }
  return colors;
}
