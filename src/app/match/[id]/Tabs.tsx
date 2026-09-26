"use client";

import { useState, type ReactNode } from "react";

export function MatchTabs({ resume, probabilites }: { resume: ReactNode; probabilites: ReactNode }) {
  const [tab, setTab] = useState<"resume" | "probabilites">("resume");

  const tabClass = (active: boolean) =>
    `border-b-2 py-3 text-sm font-semibold transition ${
      active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
    }`;

  return (
    <div>
      <div className="flex gap-6 border-b border-border px-5">
        <button type="button" onClick={() => setTab("resume")} className={tabClass(tab === "resume")}>
          Résumé
        </button>
        <button
          type="button"
          onClick={() => setTab("probabilites")}
          className={tabClass(tab === "probabilites")}
        >
          Probabilités
        </button>
      </div>
      <div className="p-5">{tab === "resume" ? resume : probabilites}</div>
    </div>
  );
}
