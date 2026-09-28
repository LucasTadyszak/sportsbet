"use client";

import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { login, type FormState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="vestiaire-code" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Code
        </label>
        <input
          id="vestiaire-code"
          name="code"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "vestiaire-code-error" : undefined}
          className="min-h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 font-mono-tabular text-base text-fg transition-colors duration-200 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 focus-visible:outline-none aria-[invalid=true]:border-fall"
        />
        {state?.error ? (
          <p id="vestiaire-code-error" role="alert" className="text-xs text-fall">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-inverse px-4 text-sm font-semibold text-on-inverse transition-colors duration-200 enabled:hover:bg-inverse/90 disabled:opacity-60"
      >
        {pending ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : null}
        Entrer
      </button>
    </form>
  );
}
