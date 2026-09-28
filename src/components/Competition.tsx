// A competition's identity on the board (src/lib/competitions.ts): its logo when TheSportsDB
// has one (src/lib/refreshLogos.ts) — or FotMob, for a competition only Free API Live Football
// Data brings — else its sport and round flag side by side, as bookmakers mark a competition;
// and the band a match block opens with. Everything here is decorative: the competition is always
// named in text next to it.
import type { ReactNode } from "react";
import type { CompetitionTheme, FlagCode } from "@/lib/competitions";
import { Icon } from "@/components/Icon";
import { LogoDisc } from "@/components/RemoteLogo";

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

/**
 * The competition's logo on a white disc, or else — no logo, or one that doesn't load — sport +
 * flag overlapping, the bookmakers' way of marking a competition. Both take the same width, so
 * names line up in a list.
 */
export function CompetitionIcon({ theme, logo = null, size = 18 }: { theme: CompetitionTheme; logo?: string | null; size?: number }) {
  if (logo) return <LogoDisc src={logo} size={size} fallback={<SportAndFlag theme={theme} size={size} />} />;
  return <SportAndFlag theme={theme} size={size} />;
}

function SportAndFlag({ theme, size }: { theme: CompetitionTheme; size: number }) {
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

/**
 * A match block's header band: on the deep band, the competition as a tag cut on the slant, in
 * its own gradient (white text reads on every one, see competitions.test.ts); `right` goes to
 * the other end (the day, "En direct").
 */
export function CompetitionBand({
  theme,
  logo = null,
  right,
  className = "",
}: {
  theme: CompetitionTheme;
  logo?: string | null;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex h-9 items-stretch justify-between gap-3 bg-bg-deep ${className}`}>
      <span
        className="cut-slant flex min-w-0 items-center gap-2 pl-3.5 pr-8 text-white"
        style={{ backgroundImage: `linear-gradient(100deg, ${theme.from}, ${theme.to})` }}
      >
        <CompetitionIcon theme={theme} logo={logo} size={16} />
        <span className="truncate font-cond text-sm font-extrabold uppercase tracking-wider">{theme.name}</span>
      </span>
      {right ? (
        <span className="flex shrink-0 items-center pr-4 font-cond text-[13px] font-bold uppercase tracking-widest text-fg-muted">{right}</span>
      ) : null}
    </div>
  );
}
