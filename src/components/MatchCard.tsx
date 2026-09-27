import Link from "next/link";
import { groupOddsErrors, oddsErrorsFor, resultBoxes, stakedVerdict, type BoardEvent } from "@/lib/board";
import { bookClassifier } from "@/lib/bookmakers";
import { competitionTheme, type CompetitionTheme } from "@/lib/competitions";
import { formatShortDay, formatTime, hasKickedOff } from "@/lib/dates";
import { formatPct, oddsErrorsLabel, outcomeCode, outcomeLabel, upperFirst } from "@/lib/labels";
import { userLabel } from "@/lib/methodology/verdict";
import { selectionFor, type OutcomeEdge } from "@/lib/selection";
import { CompetitionBand } from "@/components/Competition";
import { Icon } from "@/components/Icon";
import { OddsButton } from "@/components/OddsButton";
import { TeamCrest } from "@/components/TeamCrest";
import { TierBadge } from "@/components/Verdict";

// No live score feed (The Odds API is pre-match only): "live" means kicked off recently enough to still be on.
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

function isLive(commenceTime: Date): boolean {
  const elapsedMs = Date.now() - commenceTime.getTime();
  return elapsedMs >= 0 && elapsedMs <= LIVE_WINDOW_MS;
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-fall/10 px-2.5 py-1 text-xs font-semibold text-fall">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fall opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-fall" />
      </span>
      En cours
    </span>
  );
}

/** Kickoff hour and day, or the live badge once the match is on. */
export function KickoffTime({ commenceTime, inverted = false }: { commenceTime: Date; inverted?: boolean }) {
  if (isLive(commenceTime)) return <LiveBadge />;
  return (
    <>
      <time className={`font-display text-2xl font-extrabold leading-none tabular ${inverted ? "text-white" : "text-fg"}`}>
        {formatTime(commenceTime)}
      </time>
      <span className={`text-xs ${inverted ? "text-white/80" : "text-fg-muted"}`}>{upperFirst(formatShortDay(commenceTime))}</span>
    </>
  );
}

/**
 * A club's kit, as diagonal stripes filling its half of the block: home left, away right.
 * The white panel sits on top, so the stripes only show as the frame around it — the way
 * Winamax dresses a fixture in each side's flag. They fade out toward the middle, and sit
 * under everything else in the block (which must be `isolate`).
 */
export function KitStripes({ colors, side }: { colors: string[]; side: "home" | "away" }) {
  const band = 7;
  const stops =
    colors.length === 1
      ? `${colors[0]} 0 ${band}px, transparent ${band}px ${band * 2}px`
      : colors.map((c, i) => `${c} ${i * band}px ${(i + 1) * band}px`).join(", ");
  const fade = `linear-gradient(${side === "home" ? "to right" : "to left"}, #000 25%, transparent 85%)`;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 -z-10 w-1/2 ${side === "home" ? "left-0" : "right-0"}`}
      style={{ backgroundImage: `repeating-linear-gradient(-58deg, ${stops})`, maskImage: fade, WebkitMaskImage: fade }}
    />
  );
}

/** A club's colours, or the competition's when football-data.org doesn't give them. */
export function kitOrTheme(colors: string[], theme: CompetitionTheme, side: "home" | "away"): string[] {
  if (colors.length > 0) return colors;
  return side === "home" ? [theme.to, theme.accents[0]] : [theme.from, theme.accents[1] ?? theme.accents[0]];
}

/** The kit's colours as equal arcs of a ring, e.g. half red, half white. */
function kitRing(colors: string[]): string {
  const step = 100 / colors.length;
  return `conic-gradient(from -45deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}

/** A club's crest on a white disc, ringed with its kit colours. */
export function KitCrest({ crest, kit, size = 50 }: { crest: string | null; kit: string[]; size?: number }) {
  return (
    <span className="rounded-full p-[3px] shadow-card ring-1 ring-fg/10" style={{ backgroundImage: kitRing(kit) }}>
      <span className="flex items-center justify-center rounded-full bg-bg-elevated" style={{ width: size, height: size }}>
        <TeamCrest src={crest} size={Math.round(size * 0.64)} />
      </span>
    </span>
  );
}

function TeamSide({ name, crest, kit }: { name: string; crest: string | null; kit: string[] }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <KitCrest crest={crest} kit={kit} />
      <span className="line-clamp-2 text-sm font-semibold leading-tight text-fg">{name}</span>
    </div>
  );
}

/** The whole market's fair probability of one outcome, under its price — what bookmakers show as "% des parieurs". */
function MarketShare({ probability, favorite }: { probability: number | null; favorite: boolean }) {
  if (probability === null) return null;
  return (
    <span className="mt-1.5 flex items-center gap-1.5 px-0.5">
      <span className="w-8 text-[11px] font-medium tabular text-fg-muted">
        <span className="sr-only">Probabilité du marché : </span>
        {formatPct(probability)}
      </span>
      <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-bg-row">
        <span className={`block h-full rounded-full ${favorite ? "bg-accent" : "bg-fg/25"}`} style={{ width: `${probability * 100}%` }} />
      </span>
    </span>
  );
}

/** What the 1/X/2 tiles need to know about a match: a board event or a match page's detail. */
type TilesEvent = Pick<
  BoardEvent,
  "id" | "homeTeam" | "awayTeam" | "commenceTime" | "h2h" | "verdicts" | "oddsErrors" | "fairResult"
> & { edges: OutcomeEdge[] };

/**
 * The 1/X/2 prices as big tiles — the best price at a bettable book, clicked into the bet
 * slip — each with the market's probability under it.
 */
export function ResultTiles({ event, codes = false, className = "" }: { event: TilesEvent; codes?: boolean; className?: string }) {
  const boxes = resultBoxes(event.h2h, event.homeTeam, event.awayTeam, bookClassifier().isBettable);
  const kickedOff = hasKickedOff(event.commenceTime);
  const h2hPick = stakedVerdict(event.verdicts, "h2h");
  const favorite = event.fairResult ? Math.max(...Object.values(event.fairResult)) : null;
  const tileLabels: Record<string, string> = codes
    ? { "1": "1", X: "N", "2": "2" }
    : { "1": event.homeTeam, X: "Match nul", "2": event.awayTeam };

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`} title="Sous chaque cote : la probabilité du marché, marge retirée">
      {boxes.map((box) => {
        const isPick = h2hPick?.outcomeName === box.outcomeName;
        const probability = event.fairResult?.[box.outcomeName] ?? null;
        return (
          <div key={box.label} className="flex min-w-0 flex-col">
            {box.best ? (
              <OddsButton
                variant="tile"
                label={tileLabels[box.label]}
                selection={selectionFor(event, box.best, event.edges)}
                isPick={isPick}
                disabled={kickedOff}
                hint={
                  isPick && h2hPick
                    ? `${userLabel(h2hPick.tier)} : ${outcomeLabel("h2h", h2hPick.outcomeName, null, event.homeTeam, event.awayTeam)}`
                    : undefined
                }
                oddsError={oddsErrorsLabel(oddsErrorsFor(event.oddsErrors, "h2h", box.outcomeName))}
              />
            ) : (
              <div className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-row/60 px-2 py-1.5">
                <span className="max-w-full truncate text-[11px] font-medium text-fg-muted">{tileLabels[box.label]}</span>
                <span className="font-display text-lg font-extrabold leading-6 text-fg-muted">—</span>
              </div>
            )}
            <MarketShare probability={probability} favorite={probability !== null && probability === favorite} />
          </div>
        );
      })}
    </div>
  );
}

/** The model's staked picks, and the totals prices flagged as odds errors (the block shows no totals prices). */
export function PickChips({ event }: { event: BoardEvent }) {
  const picks = [stakedVerdict(event.verdicts, "h2h"), stakedVerdict(event.verdicts, "totals")].filter((v) => v !== null);
  const totalsErrors = groupOddsErrors(event.oddsErrors.filter((e) => e.marketKey === "totals"));
  if (picks.length === 0 && totalsErrors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {picks.map((pick) => (
        <span key={pick.marketKey} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated py-0.5 pl-0.5 pr-2">
          <TierBadge tier={pick.tier} compact />
          <span className="tabular text-xs font-medium text-fg">
            {outcomeCode(pick.marketKey, pick.outcomeName, pick.point, event.homeTeam, event.awayTeam)}
            {pick.bestPrice ? <span className="text-fg-muted"> @ {pick.bestPrice.toFixed(2)}</span> : null}
          </span>
        </span>
      ))}
      {totalsErrors.map((errors) => {
        const [first] = errors;
        return (
          <span
            key={`${first.outcomeName}|${first.point}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elevated py-0.5 pl-1.5 pr-2"
          >
            <Icon name="flame" label="Erreur de cote" className="h-3 w-3 text-flame" />
            <span className="tabular text-xs font-medium text-fg">
              {outcomeCode("totals", first.outcomeName, first.point, event.homeTeam, event.awayTeam)}
              <span className="text-fg-muted"> @ {Math.max(...errors.map((e) => e.price)).toFixed(2)}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * A match as a block, bookmaker-style: the competition's band on top, both clubs dressed
 * in their colours, and the 1/X/2 prices as big tiles that go into the bet slip. The team
 * link is stretched over the whole block, so only the tiles take their own clicks.
 */
export function MatchCard({ event }: { event: BoardEvent }) {
  const theme = competitionTheme(event.sportKey, event.sportTitle);
  const homeKit = kitOrTheme(event.homeColors, theme, "home");
  const awayKit = kitOrTheme(event.awayColors, theme, "away");

  return (
    <article className="group/card relative isolate flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-row shadow-card transition-[border-color,box-shadow] duration-200 hover:border-fg/20 hover:shadow-lg">
      <KitStripes colors={homeKit} side="home" />
      <KitStripes colors={awayKit} side="away" />

      <CompetitionBand theme={theme} logo={event.sportLogo} />

      <div className="mx-1.5 mb-1.5 flex flex-1 flex-col gap-4 rounded-b-xl bg-bg-elevated px-3.5 pb-3.5 pt-5 sm:px-4">
        <Link
          href={`/match/${event.id}`}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-accent-strong"
        >
          <TeamSide name={event.homeTeam} crest={event.homeCrest} kit={homeKit} />
          <span className="flex min-w-16 flex-col items-center gap-1 pt-3">
            <KickoffTime commenceTime={event.commenceTime} />
          </span>
          <TeamSide name={event.awayTeam} crest={event.awayCrest} kit={awayKit} />
        </Link>

        <ResultTiles event={event} className="relative z-10 mt-auto" />

        <PickChips event={event} />
      </div>
    </article>
  );
}
