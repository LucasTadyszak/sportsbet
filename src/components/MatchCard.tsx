import Link from "next/link";
import { boardPhase, groupOddsErrors, oddsErrorsFor, resultBoxes, stakedVerdict, type BoardEvent, type LiveScore } from "@/lib/board";
import { bookClassifier } from "@/lib/bookmakers";
import { competitionTheme, type CompetitionTheme } from "@/lib/competitions";
import { formatShortDay, formatTime, hasKickedOff } from "@/lib/dates";
import { formatPct, liveStatusLabel, oddsErrorsLabel, outcomeCode, outcomeLabel, upperFirst } from "@/lib/labels";
import { userLabel } from "@/lib/methodology/verdict";
import { selectionFor, type OutcomeEdge } from "@/lib/selection";
import { CompetitionBand } from "@/components/Competition";
import { Icon } from "@/components/Icon";
import { OddsButton } from "@/components/OddsButton";
import { TeamCrest } from "@/components/TeamCrest";
import { TierBadge } from "@/components/Verdict";

const CAPTION = "whitespace-nowrap font-cond text-xs font-bold uppercase tracking-widest";

/** "● 37'" in red: the match is on, with its clock when the live feed gives it. */
function LiveBadge({ label = "En cours" }: { label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-fall ${CAPTION}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fall opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-fall" />
      </span>
      {label}
    </span>
  );
}

/**
 * The middle of a scoreboard: the kick-off hour in big figures, "Coup d'envoi" under it; once the
 * match is on, the score and the live badge — with the clock when Free API Live Football Data
 * follows it; once it's over, the final score, or why there is none.
 */
export function KickoffTime({ commenceTime, live = null, size = "md" }: { commenceTime: Date; live?: LiveScore | null; size?: "md" | "lg" }) {
  const phase = boardPhase({ commenceTime, live });
  const big = `whitespace-nowrap font-display leading-none tracking-wide ${size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl sm:text-[44px]"}`;
  const score = live && live.homeScore !== null && live.awayScore !== null ? { home: live.homeScore, away: live.awayScore } : null;
  if (live && score && (phase === "live" || live.status === "finished" || live.status === "abandoned")) {
    return (
      <>
        <span className={`${big} text-fg`}>
          <span className="sr-only">Score : </span>
          {score.home}
          <span aria-hidden className="px-1.5 text-fg-muted">
            –
          </span>
          <span className="sr-only"> à </span>
          {score.away}
        </span>
        {phase === "live" ? <LiveBadge label={liveStatusLabel(live)} /> : <span className={`${CAPTION} text-fg-muted`}>{liveStatusLabel(live)}</span>}
      </>
    );
  }
  // Postponed or cancelled: the hour it was meant to be played at, struck through.
  const off = live?.status === "postponed" || live?.status === "cancelled";
  return (
    <>
      <time className={`${big} ${off || phase === "live" ? "text-fg-muted" : "text-fg"} ${off ? "line-through decoration-2" : ""}`}>
        {formatTime(commenceTime)}
      </time>
      {phase === "live" ? (
        <LiveBadge label={live ? liveStatusLabel(live) : undefined} />
      ) : (
        <span className={`${CAPTION} ${off ? "text-fall" : "text-fg-muted"}`}>
          {live && live.status !== "scheduled" ? liveStatusLabel(live) : "Coup d'envoi"}
        </span>
      )}
    </>
  );
}

/** A club's colours, or the competition's when football-data.org doesn't give them. */
export function kitOrTheme(colors: string[], theme: CompetitionTheme, side: "home" | "away"): string[] {
  if (colors.length > 0) return colors;
  return side === "home" ? [theme.to, theme.accents[0]] : [theme.from, theme.accents[1] ?? theme.accents[0]];
}

/** A club's kit as a bar of its colours: across above the crest on a phone, upright at the block's edge from `sm`. */
export function KitBar({ colors, size = "md" }: { colors: string[]; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`flex h-1.5 w-10 shrink-0 overflow-hidden sm:w-1.5 sm:flex-col ${size === "lg" ? "sm:h-16" : "sm:h-11"}`}
    >
      {colors.map((color, i) => (
        <span key={i} className="flex-1" style={{ background: color }} />
      ))}
    </span>
  );
}

/** One side of a scoreboard: the kit bar, the crest, the name in condensed capitals. */
export function TeamSide({
  name,
  crest,
  kit,
  side,
  size = "md",
}: {
  name: string;
  crest: string | null;
  kit: string[];
  side: "home" | "away";
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 ${
        side === "away" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"
      }`}
    >
      <KitBar colors={kit} size={size} />
      <TeamCrest src={crest} size={size === "lg" ? 52 : 36} />
      <span
        className={`line-clamp-2 min-w-0 font-cond font-extrabold uppercase leading-[1.05] tracking-wide text-fg ${
          size === "lg" ? "text-2xl sm:text-4xl" : "text-lg sm:text-2xl"
        }`}
      >
        {name}
      </span>
    </div>
  );
}

/** What the 1/X/2 blocks need to know about a match: a board event or a match page's detail. */
type TilesEvent = Pick<
  BoardEvent,
  "id" | "homeTeam" | "awayTeam" | "commenceTime" | "h2h" | "verdicts" | "oddsErrors" | "fairResult"
> & { edges: OutcomeEdge[] };

const TILE_CODES: Record<string, string> = { "1": "1", X: "N", "2": "2" };

/**
 * The 1/N/2 prices as chunky blocks — the best price at a bettable book, clicked into the bet
 * slip — each labelled with its code and the market's probability, margin removed.
 */
export function ResultTiles({ event, className = "" }: { event: TilesEvent; className?: string }) {
  const boxes = resultBoxes(event.h2h, event.homeTeam, event.awayTeam, bookClassifier().isBettable);
  const kickedOff = hasKickedOff(event.commenceTime);
  const h2hPick = stakedVerdict(event.verdicts, "h2h");

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`} title="Dans chaque cote : la probabilité du marché, marge des bookmakers retirée">
      {boxes.map((box) => {
        const isPick = h2hPick?.outcomeName === box.outcomeName;
        const probability = event.fairResult?.[box.outcomeName] ?? null;
        const label = `${TILE_CODES[box.label]}${probability !== null ? ` · ${formatPct(probability)}` : ""}`;
        return box.best ? (
          <OddsButton
            key={box.label}
            variant="tile"
            label={label}
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
          <div key={box.label} className="flex min-h-14 items-center justify-between gap-2 border-2 border-dashed border-border px-3 py-2">
            <span className="font-cond text-[13px] font-bold uppercase tracking-wide text-fg-muted">{label}</span>
            <span className="font-display text-2xl leading-none text-fg-muted">—</span>
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {picks.map((pick) => (
        <span key={pick.marketKey} className="inline-flex items-center gap-2">
          <TierBadge tier={pick.tier} compact />
          <span className="figures text-[15px] font-bold text-fg">
            {outcomeCode(pick.marketKey, pick.outcomeName, pick.point, event.homeTeam, event.awayTeam)}
            {pick.bestPrice ? <span className="text-fg-muted"> @ {pick.bestPrice.toFixed(2)}</span> : null}
          </span>
        </span>
      ))}
      {totalsErrors.map((errors) => {
        const [first] = errors;
        return (
          <span key={`${first.outcomeName}|${first.point}`} className="inline-flex items-center gap-1.5">
            <Icon name="flame" label="Erreur de cote" className="h-3.5 w-3.5 text-flame" />
            <span className="figures text-[15px] font-bold text-fg">
              {outcomeCode("totals", first.outcomeName, first.point, event.homeTeam, event.awayTeam)}
              <span className="text-fg-muted"> @ {Math.max(...errors.map((e) => e.price)).toFixed(2)}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

const TEAMS_ROW = "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3";

/**
 * A match as a scoreboard: the competition's band, both clubs with their kit colours as bars,
 * the kick-off (or the live score) in big figures, and the 1/N/2 prices as blocks that go into
 * the bet slip. The team link is stretched over its own row only (not the whole card): letting
 * it balloon out over the price blocks via z-index used to leave them untappable on iOS Safari.
 * A match The Odds API doesn't price (src/lib/liveCompetitions.ts) has no blocks and no match
 * page: just its teams, and its kick-off or score.
 */
export function MatchCard({ event }: { event: BoardEvent }) {
  const theme = competitionTheme(event.sportKey, event.sportTitle);
  const homeKit = kitOrTheme(event.homeColors, theme, "home");
  const awayKit = kitOrTheme(event.awayColors, theme, "away");
  const phase = boardPhase(event);
  const teams = (
    <>
      <TeamSide name={event.homeTeam} crest={event.homeCrest} kit={homeKit} side="home" />
      <span className="flex min-w-20 flex-col items-center gap-1.5 text-center">
        <KickoffTime commenceTime={event.commenceTime} live={event.live} />
      </span>
      <TeamSide name={event.awayTeam} crest={event.awayCrest} kit={awayKit} side="away" />
    </>
  );

  return (
    <article
      className={`group/card relative flex flex-col bg-bg-elevated shadow-hard render-near-screen ${
        event.priced ? "transition-transform duration-200 hover:-translate-y-0.5" : ""
      }`}
    >
      <CompetitionBand
        theme={theme}
        logo={event.sportLogo}
        right={phase === "live" ? <span className="text-fall">En direct</span> : upperFirst(formatShortDay(event.commenceTime))}
      />

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-5 sm:px-5">
        {event.priced ? (
          <>
            <Link
              href={`/match/${event.id}`}
              className={`${TEAMS_ROW} relative after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-focus`}
            >
              {teams}
            </Link>

            <ResultTiles event={event} className="relative z-10 mt-auto" />

            <PickChips event={event} />
          </>
        ) : (
          <>
            <div className={TEAMS_ROW}>{teams}</div>
            {phase === "upcoming" ? <p className={`mt-auto text-center text-fg-muted ${CAPTION}`}>Pas de cotes suivies pour ce match</p> : null}
          </>
        )}
      </div>
    </article>
  );
}
