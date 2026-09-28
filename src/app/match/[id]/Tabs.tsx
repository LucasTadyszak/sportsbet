"use client";

import { useState, type ReactNode } from "react";

export function MatchTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  const tabClass = (isActive: boolean) =>
    `-mb-px min-h-11 border-b-2 px-1 text-sm font-semibold transition-colors duration-200 ${
      isActive ? "border-fg text-fg" : "border-transparent text-fg-muted hover:border-border hover:text-fg"
    }`;

  return (
    <div>
      <div className="no-scrollbar flex gap-6 overflow-x-auto border-b border-border bg-bg-row/40 px-5" role="tablist">
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
      <div className="p-4 sm:p-6" role="tabpanel">
        {tabs.find((tab) => tab.id === active)?.content}
      </div>
    </div>
  );
}
