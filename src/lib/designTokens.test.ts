import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The colour tokens of globals.css's :root block, comments left out.
function tokens(): Map<string, string> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const root = css.match(/:root\s*\{([^{}]*)\}/);
  assert.ok(root, "globals.css has a :root block");
  return new Map(Array.from(root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (m) => [m[1], m[2].trim()] as const));
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
const LARGE = 3; // WCAG AA, large text (the Anton figures), icons and focus rings

const SURFACES = ["--bg-deep", "--bg", "--bg-elevated", "--bg-row"];

// [foreground, backgrounds it is read on, minimum ratio]
const PAIRS: [string, string[], number][] = [
  ["--fg", SURFACES, TEXT],
  ["--fg-muted", SURFACES, TEXT],
  ["--link", SURFACES, TEXT],
  ["--on-inverse", ["--inverse"], TEXT],
  ["--on-accent", ["--accent"], TEXT],
  ["--accent-strong", [...SURFACES, "--accent-dim"], TEXT],
  ["--accent", SURFACES, LARGE],
  ["--rise", ["--bg-elevated", "--bg-row"], TEXT],
  ["--fall", ["--bg-elevated"], TEXT],
  ["--on-rise", ["--rise"], TEXT],
  ["--seq-ink-low", ["--seq-1", "--seq-2", "--seq-3", "--seq-4"], TEXT],
  ["--seq-ink-high", ["--seq-5", "--seq-6", "--seq-7"], TEXT],
  ["--flame", ["--bg-elevated", "--bg-row", "--accent-dim"], LARGE],
  ["--focus", SURFACES, LARGE],
];

test("every colour token is a #rrggbb literal", () => {
  for (const [name, value] of tokens()) assert.match(value, /^#[0-9a-f]{6}$/i, `${name}: ${value}`);
});

test("text stays readable on every surface (WCAG AA); icons, big figures and focus rings stand out", () => {
  const all = tokens();
  const color = (name: string) => {
    const value = all.get(name);
    assert.ok(value, `${name} is defined`);
    return value;
  };
  for (const [fg, backgrounds, min] of PAIRS) {
    for (const bg of backgrounds) {
      const ratio = contrast(color(fg), color(bg));
      assert.ok(ratio >= min, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
    }
  }
});
