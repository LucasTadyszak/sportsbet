"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { KNOCK_COOKIE, KNOCK_MAX_AGE_S, VESTIAIRE_PATH, tapLogo, typeKey } from "@/lib/secretKnock";

/** A key pressed in a field (the board's search, the bankroll) is someone typing, not the code. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Listens, on every page, for the easter egg that opens the hidden console (src/lib/secretKnock.ts):
 * the Konami code, or seven quick taps on the logo (the element marked `data-brand`). Renders nothing.
 */
export function SecretKnock() {
  const router = useRouter();
  useEffect(() => {
    let keys: string[] = [];
    let taps: number[] = [];
    const open = () => {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${KNOCK_COOKIE}=1; max-age=${KNOCK_MAX_AGE_S}; path=${VESTIAIRE_PATH}; samesite=strict${secure}`;
      router.push(VESTIAIRE_PATH);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event.target)) return;
      const typed = typeKey(keys, event.key);
      keys = typed.keys;
      if (typed.open) open();
    };
    // Capture phase: the last tap is seen before the logo's link, and stops it going home.
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-brand]")) return;
      const tapped = tapLogo(taps, Date.now());
      taps = tapped.taps;
      if (!tapped.open) return;
      event.preventDefault();
      open();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);
  return null;
}
