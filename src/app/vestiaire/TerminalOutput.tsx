"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A run's output, terminal style. While `follow` is on (the run is going), new lines keep it
 * scrolled to the bottom — unless it was scrolled up to read something.
 */
export function TerminalOutput({ text, follow, empty }: { text: string; follow: boolean; empty: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && follow && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [text, follow]);
  return (
    <pre
      ref={ref}
      tabIndex={0}
      onScroll={(event) => {
        const el = event.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="max-h-96 overflow-auto rounded-lg bg-fg px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-white/90 focus-visible:outline-accent"
    >
      {text || <span className="text-white/50">{empty}</span>}
    </pre>
  );
}
