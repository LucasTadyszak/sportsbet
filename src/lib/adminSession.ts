// The hidden console's lock (/vestiaire). Its code is ADMIN_SECRET, else CRON_SECRET (the one the
// refresh endpoints already take); without either, the console stays shut. Logging in sets a
// session cookie holding its expiry and an HMAC of it keyed by that code: nothing about the code
// leaves the server, and changing the code signs every session out.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "vestiaire_session";
export const SESSION_DAYS = 30;

/** The console's code, or null when none is configured. */
export function adminSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.ADMIN_SECRET?.trim() || env.CRON_SECRET?.trim() || null;
}

/** Compares two strings in constant time, whatever their lengths: timing says nothing about how much matched. */
export function safeEqual(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function signature(secret: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`vestiaire:${expiresAt}`).digest("base64url");
}

export function createSessionToken(secret: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = now + SESSION_DAYS * DAY_MS;
  return { token: `${expiresAt}.${signature(secret, expiresAt)}`, expiresAt: new Date(expiresAt) };
}

/** Whether the token was signed with this secret and hasn't expired. */
export function isValidSessionToken(secret: string, token: string | undefined, now = Date.now()): boolean {
  const [expiry, sig, ...rest] = (token ?? "").split(".");
  const expiresAt = Number(expiry);
  if (!sig || rest.length > 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  return safeEqual(sig, signature(secret, expiresAt));
}

/**
 * Wrong codes allowed over a sliding window, after which every attempt is refused — the right
 * code included — until the oldest one ages out: guessing stays hopeless even for a short code.
 */
export function loginLimiter({ maxFailures = 10, windowMs = 15 * 60 * 1000 } = {}) {
  let failures: number[] = [];
  return {
    /** How long until an attempt is allowed again, in ms (0: now). */
    lockedFor(now = Date.now()): number {
      failures = failures.filter((at) => now - at < windowMs);
      return failures.length >= maxFailures ? failures[failures.length - maxFailures] + windowMs - now : 0;
    },
    fail(now = Date.now()) {
      failures.push(now);
    },
  };
}
