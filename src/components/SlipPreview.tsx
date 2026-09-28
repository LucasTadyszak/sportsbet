"use client";

import { createContext, type ReactNode } from "react";

/**
 * Inside a preview (the /themes page), which prices show as in the slip, by selectionKey: the
 * price buttons there read it instead of the real slip, and don't touch it when clicked.
 */
export const SlipPreviewContext = createContext<ReadonlySet<string> | null>(null);

export function SlipPreview({ selected, children }: { selected: string[]; children: ReactNode }) {
  return <SlipPreviewContext value={new Set(selected)}>{children}</SlipPreviewContext>;
}
