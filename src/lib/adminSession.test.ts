import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSecret, createSessionToken, isValidSessionToken, loginLimiter, safeEqual, SESSION_DAYS } from "@/lib/adminSession";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 28, 12);

test("the console's code is ADMIN_SECRET, else CRON_SECRET, else none", () => {
  assert.equal(adminSecret({ ADMIN_SECRET: "a-long-code", CRON_SECRET: "cron" }), "a-long-code");
  assert.equal(adminSecret({ CRON_SECRET: " cron " }), "cron");
  assert.equal(adminSecret({ ADMIN_SECRET: "   ", CRON_SECRET: "cron" }), "cron");
  assert.equal(adminSecret({}), null);
  assert.equal(adminSecret({ ADMIN_SECRET: "", CRON_SECRET: "" }), null);
});

test("safeEqual compares whole strings, whatever their lengths", () => {
  assert.equal(safeEqual("code", "code"), true);
  assert.equal(safeEqual("code", "cod"), false);
  assert.equal(safeEqual("", "code"), false);
  assert.equal(safeEqual("codE", "code"), false);
});

test("a session token is valid with its secret until it expires", () => {
  const { token, expiresAt } = createSessionToken("secret", NOW);
  assert.equal(expiresAt.getTime(), NOW + SESSION_DAYS * DAY_MS);
  assert.equal(isValidSessionToken("secret", token, NOW), true);
  assert.equal(isValidSessionToken("secret", token, NOW + (SESSION_DAYS - 1) * DAY_MS), true);
  assert.equal(isValidSessionToken("secret", token, expiresAt.getTime()), false);
  // Another code (the secret was changed): every session is signed out.
  assert.equal(isValidSessionToken("new-secret", token, NOW), false);
});

test("a tampered or malformed token is refused", () => {
  const { token } = createSessionToken("secret", NOW);
  const [expiry, signature] = token.split(".");
  assert.equal(isValidSessionToken("secret", `${Number(expiry) + DAY_MS}.${signature}`, NOW), false);
  assert.equal(isValidSessionToken("secret", `${expiry}.${signature.slice(1)}`, NOW), false);
  assert.equal(isValidSessionToken("secret", `${token}.extra`, NOW), false);
  for (const bad of [undefined, "", ".", "abc", `${expiry}.`, `.${signature}`, `soon.${signature}`]) {
    assert.equal(isValidSessionToken("secret", bad, NOW), false, String(bad));
  }
});

test("the limiter refuses every attempt once too many codes were wrong, until the oldest ages out", () => {
  const limiter = loginLimiter({ maxFailures: 3, windowMs: 10_000 });
  assert.equal(limiter.lockedFor(0), 0);
  limiter.fail(0);
  limiter.fail(1_000);
  assert.equal(limiter.lockedFor(1_500), 0);
  limiter.fail(2_000);
  // Three wrong codes: locked until the first is 10 s old.
  assert.equal(limiter.lockedFor(2_500), 7_500);
  assert.equal(limiter.lockedFor(9_999), 1);
  assert.equal(limiter.lockedFor(10_000), 0);
  // One more wrong code locks it again, until the second one ages out.
  limiter.fail(10_000);
  assert.equal(limiter.lockedFor(10_500), 500);
  assert.equal(limiter.lockedFor(30_000), 0);
});
