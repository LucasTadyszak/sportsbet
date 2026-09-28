"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { adminSecret, createSessionToken, loginLimiter, safeEqual, SESSION_COOKIE } from "@/lib/adminSession";
import { claimRun, executeRun } from "@/lib/commandRuns";
import { COMMANDS, isCommandId, splitArgs } from "@/lib/commands";
import { VESTIAIRE_PATH } from "@/lib/secretKnock";
import { isAdmin } from "./access";

export type FormState = { error?: string } | undefined;

// Per server process: a restart clears it, which only matters to someone guessing.
const limiter = loginLimiter();
const WRONG_CODE_DELAY_MS = 1_000;

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const secret = adminSecret();
  if (!secret) return { error: "Aucun code n'est configuré sur le serveur : renseigne ADMIN_SECRET." };
  const lockedFor = limiter.lockedFor();
  if (lockedFor > 0) return { error: `Trop d'essais : réessaie dans ${Math.ceil(lockedFor / 60_000)} min.` };
  const code = formData.get("code");
  if (typeof code !== "string" || !safeEqual(code, secret)) {
    limiter.fail();
    await new Promise((resolve) => setTimeout(resolve, WRONG_CODE_DELAY_MS));
    return { error: "Code incorrect." };
  }
  const { token, expiresAt } = createSessionToken(secret);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: VESTIAIRE_PATH,
    expires: expiresAt,
  });
  refresh();
  return undefined;
}

export async function logout(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: VESTIAIRE_PATH });
  redirect("/");
}

/** Starts the command in the server's background (src/lib/commandRuns.ts); the page then follows its output. */
export async function runCommand(_state: FormState, formData: FormData): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Session expirée : recharge la page et reconnecte-toi." };
  const command = formData.get("command");
  if (typeof command !== "string" || !isCommandId(command)) return { error: "Commande inconnue." };
  const args = COMMANDS[command].args ? splitArgs(String(formData.get("args") ?? "")) : [];
  const { id, started } = await claimRun(command, args);
  if (started) after(() => executeRun(id, command, args));
  refresh();
  return started ? undefined : { error: "Déjà en cours : sa sortie s'affiche plus bas." };
}
