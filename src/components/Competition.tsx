// A competition's identity on the board (src/lib/competitions.ts): its logo when TheSportsDB
// has one (src/lib/refreshLogos.ts) — or FotMob, for a competition only Free API Live Football
// Data brings — else its sport and round flag side by side, as bookmakers mark a competition;
// and the band a match block opens with. Everything here is decorative: the competition is always
// named in text next to it.
import type { ReactNode } from "react";
import type { CompetitionTheme } from "@/lib/competitions";
import { SportAndFlag } from "@/components/LogoFallbacks";
import { LogoDisc } from "@/components/RemoteLogo";

/**
 * The competition's logo on a white disc, or else — no logo, or one that doesn't load — sport +
 * flag overlapping, the bookmakers' way of marking a competition. Both take the same width, so
 * names line up in a list.
 */
export function CompetitionIcon({ theme, logo = null, size = 18 }: { theme: CompetitionTheme; logo?: string | null; size?: number }) {
  if (logo) return <LogoDisc src={logo} size={size} sport={theme.sport} flag={theme.flag} />;
  return <SportAndFlag sport={theme.sport} flag={theme.flag} size={size} />;
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
