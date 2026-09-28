"use client";

import { useState, type ReactNode } from "react";
import { Straight, slantTabClass } from "@/components/Slant";

export function MatchTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto bg-bg-deep px-5 py-2.5" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => setActive(tab.id)}
            className={`${slantTabClass(tab.id === active)} focus-visible:-outline-offset-2`}
          >
            <Straight>{tab.label}</Straight>
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-6" role="tabpanel">
        {tabs.find((tab) => tab.id === active)?.content}
      </div>
    </div>
  );
}
