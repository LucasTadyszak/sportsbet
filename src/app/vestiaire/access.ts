import { cookies } from "next/headers";
import { adminSecret, isValidSessionToken, SESSION_COOKIE } from "@/lib/adminSession";
import { KNOCK_COOKIE } from "@/lib/secretKnock";

/** Logged in; come by the easter egg (the lock is shown); or anyone else, who gets a 404. */
export type VestiaireAccess = "admin" | "knocked" | "hidden";

export async function vestiaireAccess(): Promise<VestiaireAccess> {
  const store = await cookies();
  const secret = adminSecret();
  if (secret && isValidSessionToken(secret, store.get(SESSION_COOKIE)?.value)) return "admin";
  return store.has(KNOCK_COOKIE) ? "knocked" : "hidden";
}

/** Every Server Action checks this itself: rendering a button only for the logged-in isn't a lock. */
export async function isAdmin(): Promise<boolean> {
  return (await vestiaireAccess()) === "admin";
}
