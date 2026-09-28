"use client";

import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { runCommand, type FormState } from "./actions";

export type CommandCardProps = {
  id: string;
  npm: string;
  title: string;
  description: string;
  /** Names of the APIs it calls. */
  apis: string[];
  args?: { label: string; placeholder: string };
  /** A run of it is going: the button waits for it. */
  running: boolean;
  /** Its last finished run, e.g. "Réussie · il y a 5 min". */
  lastRun: string | null;
};

export function CommandCard({ id, npm, title, description, apis, args, running, lastRun }: CommandCardProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(runCommand, undefined);
  const busy = pending || running;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-4 shadow-card">
      <input type="hidden" name="command" value={id} />
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-base font-semibold text-fg">{title}</h3>
        <code className="w-fit rounded bg-bg-row px-1.5 py-0.5 font-mono text-xs text-fg">{npm}</code>
      </div>
      <p className="text-sm leading-relaxed text-fg-muted">{description}</p>
      {args ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`args-${id}`} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {args.label}
          </label>
          <input
            id={`args-${id}`}
            name="args"
            required
            spellCheck={false}
            autoComplete="off"
            placeholder={args.placeholder}
            className="min-h-10 w-full rounded-lg border border-border bg-bg-elevated px-3 font-mono text-sm text-fg placeholder:text-fg-muted/70 transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 focus-visible:outline-none"
          />
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="flex min-h-10 items-center gap-2 rounded-lg bg-fg px-4 text-sm font-semibold text-white transition-colors duration-200 enabled:hover:bg-fg/90 disabled:cursor-default disabled:opacity-60"
        >
          <Icon name={busy ? "loader" : "play"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "En cours…" : "Lancer"}
        </button>
        <span className="text-xs text-fg-muted">{apis.length > 0 ? apis.join(" · ") : "Aucun appel API"}</span>
      </div>
      {state?.error ? (
        <p role="alert" className="text-xs text-fall">
          {state.error}
        </p>
      ) : lastRun ? (
        <p className="text-xs text-fg-muted">Dernière exécution : {lastRun}</p>
      ) : null}
    </form>
  );
}
