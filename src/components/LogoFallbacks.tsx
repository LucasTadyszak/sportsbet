// What stands in for a logo that is missing or doesn't load: a club's faint shield, a
// competition's sport and round flag. Drawn on the server when there is no logo at all, and by
// the logo itself (src/components/RemoteLogo.tsx) when its image fails: a fallback handed to it
// ready-made would travel with every logo on the page, for the few that ever need it.
import type { ReactNode } from "react";
import type { CompetitionTheme, FlagCode } from "@/lib/competitions";
import { Icon } from "@/components/Icon";

/** A club without a logo: a faint shield that keeps names aligned. */
export function Shield({ size }: { size: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center text-fg-muted/40" style={{ width: size, height: size }}>
      <Icon name="shield" className="h-[85%] w-[85%]" />
    </span>
  );
}

// 20×20 flags, clipped round by their wrapper. Simplified to what reads at 16px.
const FLAGS: Record<FlagCode, ReactNode> = {
  eng: (
    <>
      <rect width="20" height="20" fill="#ffffff" />
      <rect x="8.25" width="3.5" height="20" fill="#ce1124" />
      <rect y="8.25" width="20" height="3.5" fill="#ce1124" />
    </>
  ),
  de: (
    <>
      <rect width="20" height="7" fill="#000000" />
      <rect y="6.67" width="20" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="20" height="6.67" fill="#ffce00" />
    </>
  ),
  es: (
    <>
      <rect width="20" height="20" fill="#aa151b" />
      <rect y="5" width="20" height="10" fill="#f1bf00" />
    </>
  ),
  it: (
    <>
      <rect width="7" height="20" fill="#009246" />
      <rect x="6.67" width="6.67" height="20" fill="#ffffff" />
      <rect x="13.33" width="6.67" height="20" fill="#ce2b37" />
    </>
  ),
  fr: (
    <>
      <rect width="7" height="20" fill="#0055a4" />
      <rect x="6.67" width="6.67" height="20" fill="#ffffff" />
      <rect x="13.33" width="6.67" height="20" fill="#ef4135" />
    </>
  ),
  nl: (
    <>
      <rect width="20" height="7" fill="#ae1c28" />
      <rect y="6.67" width="20" height="6.67" fill="#ffffff" />
      <rect y="13.33" width="20" height="6.67" fill="#21468b" />
    </>
  ),
  pt: (
    <>
      <rect width="20" height="20" fill="#ff0000" />
      <rect width="8" height="20" fill="#006600" />
      <circle cx="8" cy="10" r="3.2" fill="#ffcc00" />
    </>
  ),
  br: (
    <>
      <rect width="20" height="20" fill="#009c3b" />
      <path d="M10 3.5 18 10l-8 6.5L2 10z" fill="#ffdf00" />
      <circle cx="10" cy="10" r="3.4" fill="#002776" />
    </>
  ),
  us: (
    <>
      <rect width="20" height="20" fill="#ffffff" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={(i * 40) / 13} width="20" height={20 / 13} fill="#b22234" />
      ))}
      <rect width="9" height={140 / 13} fill="#3c3b6e" />
    </>
  ),
  eu: (
    <>
      <rect width="20" height="20" fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i * Math.PI) / 6;
        return <circle key={i} cx={10 + 5.6 * Math.cos(angle)} cy={10 + 5.6 * Math.sin(angle)} r="1" fill="#ffcc00" />;
      })}
    </>
  ),
  world: (
    <>
      <rect width="20" height="20" fill="#2563eb" />
      <g fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.85">
        <ellipse cx="10" cy="10" rx="4" ry="9" />
        <path d="M1 10h18M2.5 5.5h15M2.5 14.5h15" />
      </g>
    </>
  ),
};

export function RoundFlag({ code, size = 16 }: { code: FlagCode; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-fg/15"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 20 20" className="h-full w-full">
        {FLAGS[code]}
      </svg>
    </span>
  );
}

/** A competition without a logo: its sport and round flag overlapping, the bookmakers' way of marking one. */
export function SportAndFlag({ sport, flag, size }: Pick<CompetitionTheme, "sport" | "flag"> & { size: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center">
      <span
        className="flex items-center justify-center rounded-full bg-white text-fg ring-1 ring-fg/15"
        style={{ width: size, height: size }}
      >
        <Icon name={sport === "football" ? "ball" : "trophy"} className="h-[78%] w-[78%]" />
      </span>
      <span className="-ml-1 flex rounded-full ring-2 ring-white">
        <RoundFlag code={flag} size={size} />
      </span>
    </span>
  );
}
