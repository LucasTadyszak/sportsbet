"use client";

import { useState, type ReactNode } from "react";

export function MatchTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  const tabClass = (isActive: boolean) =>
    `border-b-2 py-3 text-sm font-semibold transition ${
      isActive ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
    }`;

  return (
    <div>
      <div className="flex gap-6 border-b border-border px-5" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => setActive(tab.id)}
            className={tabClass(tab.id === active)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-5">{tabs.find((tab) => tab.id === active)?.content}</div>
    </div>
  );
}
