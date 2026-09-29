"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the page's server components every `everyMs` while the tab is in view, and when it
 * comes back into view after missing a round: live scores move without a reload (each render also
 * brings the scores up to date, src/lib/refreshLiveMatches.ts). Scroll, open panels and the bet
 * slip stay. Coming back sooner (a phone flicking between apps) doesn't reload a page that is
 * still fresh: each reload re-sends the whole board.
 */
export function LiveRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") {
        last = Date.now();
        router.refresh();
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, everyMs);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= everyMs) tick();
    };
    timer = window.setTimeout(tick, everyMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, everyMs]);
  return null;
}
