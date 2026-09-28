import { test } from "node:test";
import assert from "node:assert/strict";
import { KONAMI, tapLogo, TAP_WINDOW_MS, TAPS_TO_OPEN, typeKey } from "@/lib/secretKnock";

function typeAll(keys: string[]): boolean[] {
  let typed: string[] = [];
  return keys.map((key) => {
    const next = typeKey(typed, key);
    typed = next.keys;
    return next.open;
  });
}

test("the Konami code opens the console on its last key, and only then", () => {
  const opened = typeAll(KONAMI);
  assert.deepEqual(opened, [...new Array(KONAMI.length - 1).fill(false), true]);
});

test("the code still opens after a stray key, an extra ↑ or Caps Lock", () => {
  assert.equal(typeAll(["x", "Enter", ...KONAMI]).at(-1), true);
  // ↑ ↑ ↑ ↓ ↓…: the last two ↑ start the code.
  assert.equal(typeAll(["ArrowUp", ...KONAMI]).at(-1), true);
  assert.equal(typeAll([...KONAMI.slice(0, -2), "B", "A"]).at(-1), true);
});

test("a wrong key in the middle means starting over", () => {
  const broken = [...KONAMI.slice(0, 5), "ArrowDown", ...KONAMI.slice(5)];
  assert.equal(typeAll(broken).includes(true), false);
  assert.equal(typeAll([...broken, ...KONAMI]).at(-1), true);
});

test("only the last keys are kept", () => {
  let typed: string[] = [];
  for (let i = 0; i < 100; i++) typed = typeKey(typed, "x").keys;
  assert.equal(typed.length, KONAMI.length);
});

test("seven quick taps on the logo open the console; slow ones don't", () => {
  let taps: number[] = [];
  const results = Array.from({ length: TAPS_TO_OPEN }, (_, i) => {
    const next = tapLogo(taps, 1_000 + i * 300);
    taps = next.taps;
    return next.open;
  });
  assert.deepEqual(results, [...new Array(TAPS_TO_OPEN - 1).fill(false), true]);
  assert.deepEqual(taps, [], "starting over after opening");

  taps = [];
  let opened = false;
  // Just too slow: seven taps span a little more than the window.
  const slow = TAP_WINDOW_MS / (TAPS_TO_OPEN - 1) + 50;
  for (let i = 0; i < 20; i++) {
    const next = tapLogo(taps, i * slow);
    taps = next.taps;
    opened ||= next.open;
  }
  assert.equal(opened, false);
});
