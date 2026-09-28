import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_THEME, THEME_COOKIE, THEME_SCRIPT, THEMES, parseTheme, themeCookie, themeFromCookies } from "@/lib/themes";

// The theme blocks of globals.css: `[data-theme="…"] { --token: value; … }`, comments left out.
function themeTokens(): Map<string, Map<string, string>> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const themes = new Map<string, Map<string, string>>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const ids = Array.from(selector.matchAll(/\[data-theme="([^"]+)"\]/g), (m) => m[1]);
    if (ids.length === 0) continue;
    const tokens = new Map(Array.from(body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (m) => [m[1], m[2].trim()] as const));
    for (const id of ids) themes.set(id, tokens);
  }
  return themes;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5; // WCAG AA, normal text
const GRAPHIC = 3; // WCAG AA, icons and focus rings

// [foreground, backgrounds it is read on, minimum ratio]
const PAIRS: [string, string[], number][] = [
  ["--fg", ["--bg", "--bg-elevated", "--bg-row"], TEXT],
  ["--fg-muted", ["--bg", "--bg-elevated", "--bg-row"], TEXT],
  ["--on-inverse", ["--inverse"], TEXT],
  ["--link", ["--bg", "--bg-elevated"], TEXT],
  ["--accent-strong", ["--bg-elevated", "--bg-row", "--accent-dim"], TEXT],
  ["--on-accent", ["--accent"], TEXT],
  ["--rise", ["--bg-elevated", "--bg-row"], TEXT],
  ["--fall", ["--bg-elevated"], TEXT],
  ["--on-rise", ["--rise"], TEXT],
  ["--seq-ink-low", ["--seq-1", "--seq-2", "--seq-3", "--seq-4"], TEXT],
  ["--seq-ink-high", ["--seq-5", "--seq-6", "--seq-7"], TEXT],
  ["--chrome-fg", ["--chrome-bg", "--chrome-row"], TEXT],
  ["--chrome-fg-muted", ["--chrome-bg", "--chrome-row"], TEXT],
  ["--chrome-on-inverse", ["--chrome-inverse"], TEXT],
  ["--chrome-link", ["--chrome-bg"], TEXT],
  ["--chrome-accent-strong", ["--chrome-bg"], TEXT],
  ["--flame", ["--bg-elevated", "--bg-row", "--accent-dim"], GRAPHIC],
  ["--focus", ["--bg", "--bg-elevated"], GRAPHIC],
  ["--chrome-focus", ["--chrome-bg"], GRAPHIC],
];

test("globals.css dresses every theme of src/lib/themes.ts, and only those", () => {
  const themes = themeTokens();
  assert.deepEqual([...themes.keys()].sort(), THEMES.map((t) => t.id).sort());
});

test("every theme sets the same tokens: none falls back to another theme's value", () => {
  const themes = themeTokens();
  const reference = [...themes.get(DEFAULT_THEME)!.keys()].sort();
  for (const [id, tokens] of themes) assert.deepEqual([...tokens.keys()].sort(), reference, id);
});

test("text stays readable in every theme (WCAG AA), icons and focus rings visible", () => {
  for (const [id, tokens] of themeTokens()) {
    const color = (name: string) => {
      const value = tokens.get(name);
      assert.match(value ?? "", /^#[0-9a-f]{6}$/i, `${id} ${name} should be a #rrggbb colour`);
      return value!;
    };
    for (const [fg, backgrounds, min] of PAIRS) {
      for (const bg of backgrounds) {
        const ratio = contrast(color(fg), color(bg));
        assert.ok(ratio >= min, `${id}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
      }
    }
  }
});

test("a saved theme is read back from the cookies; anything else is ignored", () => {
  assert.equal(themeFromCookies(`a=1; ${THEME_COOKIE}=brume; b=2`), "brume");
  assert.equal(themeFromCookies(`${THEME_COOKIE}=ardoise`), "ardoise");
  assert.equal(themeFromCookies(`${THEME_COOKIE}=rose`), null);
  assert.equal(themeFromCookies(`x${THEME_COOKIE}=brume`), null);
  assert.equal(themeFromCookies(""), null);
  assert.equal(parseTheme("graphite"), "graphite");
  assert.equal(parseTheme(undefined), DEFAULT_THEME);
  assert.equal(parseTheme("<script>"), DEFAULT_THEME);
  assert.equal(themeCookie("ardoise"), `${THEME_COOKIE}=ardoise; path=/; max-age=31536000; samesite=lax`);
});

test("the inline script puts the saved theme on <html> before paint, and only a known one", () => {
  const run = (cookie: string) => {
    const set: [string, string][] = [];
    const document = { cookie, documentElement: { setAttribute: (name: string, value: string) => set.push([name, value]) } };
    new Function("document", THEME_SCRIPT)(document);
    return set;
  };
  assert.deepEqual(run(`${THEME_COOKIE}=ardoise`), [["data-theme", "ardoise"]]);
  assert.deepEqual(run(`other=1; ${THEME_COOKIE}=brume`), [["data-theme", "brume"]]);
  assert.deepEqual(run(`${THEME_COOKIE}=%22%3E%3Cscript%3E`), []);
  assert.deepEqual(run(""), []);
});
