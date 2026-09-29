"use client";

// A logo from another site (src/lib/logoMatch.ts), with what to show instead if it doesn't load:
// a logo URL built from an id (FotMob's, src/lib/liveMatches.ts) or a stale one would otherwise
// show the browser's broken-image icon. Next re-fires an error that happened before hydration.
// The stand-in is drawn here (src/components/LogoFallbacks.tsx), from a few props: passed in
// ready-made, it would be sent along with every logo of the page.
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import type { CompetitionTheme } from "@/lib/competitions";
import { Shield, SportAndFlag } from "@/components/LogoFallbacks";

/** The logo, decorative (empty alt: it always sits next to the name it stands for), or the club's faint shield / nothing. */
export function RemoteLogo({
  src,
  size,
  className,
  style,
  fallback = null,
}: {
  src: string;
  size: number;
  className?: string;
  style?: CSSProperties;
  fallback?: "shield" | null;
}) {
  // Keyed by URL: a re-render with another logo gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return fallback === "shield" ? <Shield size={size} /> : null;
  return <Image src={src} alt="" width={size} height={size} className={className} style={style} onError={() => setFailedSrc(src)} />;
}

/** A competition's logo on a white disc, or its sport and flag if it doesn't load. */
export function LogoDisc({ src, size, sport, flag }: { src: string; size: number } & Pick<CompetitionTheme, "sport" | "flag">) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <SportAndFlag sport={sport} flag={flag} size={size} />;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center" style={{ width: size * 2 - 4, height: size }}>
      <span className="flex items-center justify-center rounded-full bg-white ring-1 ring-fg/15" style={{ width: size + 4, height: size + 4 }}>
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          className="object-contain"
          style={{ width: size - 2, height: size - 2 }}
          onError={() => setFailedSrc(src)}
        />
      </span>
    </span>
  );
}
