// A competition's identity on the board (src/lib/competitions.ts): its sport and round
// flag side by side, as bookmakers mark a competition, and the motif its header band wears.
// Everything here is decorative: the competition is always named in text next to it.
import type { ReactNode } from "react";
import type { CompetitionTheme, FlagCode, Motif } from "@/lib/competitions";
import { Icon } from "@/components/Icon";

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

/** Sport + flag, overlapping — the bookmakers' way of marking a competition. */
export function CompetitionIcon({ theme, size = 18 }: { theme: CompetitionTheme; size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center">
      <span
        className="flex items-center justify-center rounded-full bg-white text-fg ring-1 ring-fg/15"
        style={{ width: size, height: size }}
      >
        <Icon name={theme.sport === "football" ? "ball" : "trophy"} className="h-[78%] w-[78%]" />
      </span>
      <span className="-ml-1 flex rounded-full ring-2 ring-white">
        <RoundFlag code={theme.flag} size={size} />
      </span>
    </span>
  );
}

function motifShapes(motif: Motif, accents: string[]): ReactNode {
  const color = (i: number) => accents[i % accents.length];
  if (motif === "stars") {
    const stars = [
      { x: 150, y: 10, r: 9 },
      { x: 128, y: 28, r: 6 },
      { x: 108, y: 12, r: 4.5 },
      { x: 90, y: 30, r: 3.5 },
      { x: 76, y: 14, r: 2.5 },
    ];
    return stars.map(({ x, y, r }, i) => (
      <path
        key={i}
        d={`M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`}
        fill={color(i)}
      />
    ));
  }
  if (motif === "stripes") {
    return [0, 1, 2, 3, 4].map((i) => {
      const x = 84 + i * 18;
      return <path key={i} d={`M${x} 0h11l-16 40h-11z`} fill={color(i)} />;
    });
  }
  return [0, 1, 2, 3].map((i) => {
    const x = 92 + i * 17;
    return <path key={i} d={`M${x} -6l15 26-15 26`} fill="none" stroke={color(i)} strokeWidth="6" />;
  });
}

/** The competition's motif, drawn at the right end of a header band and fading out to the left. */
export function CompetitionMotif({ theme, className = "" }: { theme: CompetitionTheme; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 40"
      preserveAspectRatio="xMaxYMid slice"
      className={`pointer-events-none absolute inset-y-0 right-0 h-full w-44 ${className}`}
      style={{ maskImage: "linear-gradient(to left, #000 35%, transparent)", WebkitMaskImage: "linear-gradient(to left, #000 35%, transparent)" }}
    >
      {motifShapes(theme.motif, theme.accents)}
    </svg>
  );
}

/** A match block's header band: the competition's gradient and motif, its icon and name. */
export function CompetitionBand({ theme, className = "" }: { theme: CompetitionTheme; className?: string }) {
  return (
    <div
      className={`relative flex h-9 items-center gap-2 overflow-hidden px-3.5 text-white ${className}`}
      style={{ backgroundImage: `linear-gradient(100deg, ${theme.from}, ${theme.to})` }}
    >
      <CompetitionMotif theme={theme} />
      <CompetitionIcon theme={theme} size={16} />
      <span className="relative truncate text-xs font-semibold tracking-wide">{theme.name}</span>
    </div>
  );
}
