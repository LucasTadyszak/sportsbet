"use client";

import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { login, type FormState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="vestiaire-code" className="font-cond text-[13px] font-bold uppercase tracking-wider text-fg-muted">
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
          className="figures min-h-11 w-full border-2 border-border bg-bg-row px-3 text-lg font-semibold text-fg transition-colors duration-200 focus:border-inverse focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-fall"
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
        className="flex min-h-11 -skew-x-6 items-center justify-center gap-2 bg-inverse px-4 font-display text-xl uppercase tracking-wide text-on-inverse transition-colors duration-200 enabled:hover:bg-fg disabled:opacity-60"
      >
        <span className="inline-flex skew-x-6 items-center gap-2">
          {pending ? <Icon name="loader" className="h-4 w-4 animate-spin" /> : null}
          Entrer
        </span>
      </button>
    </form>
  );
}
