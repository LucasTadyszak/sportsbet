// Exploration: five other looks for a match block, without the striped side frame. Compared
// side by side at /variantes until one is chosen; the others then go.
import Link from "next/link";
import type { BoardEvent } from "@/lib/board";
import { competitionTheme } from "@/lib/competitions";
import { leadColor } from "@/lib/teamColors";
import { CompetitionBand, CompetitionIcon } from "@/components/Competition";
import { KickoffTime, PickChips, ResultTiles, kitOrTheme } from "@/components/MatchCard";
import { TeamCrest } from "@/components/TeamCrest";

export type CardLook = "duel" | "maillots" | "affiche" | "billet" | "liste";

const STRETCHED =
  "after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-accent-strong";

/** A colour washed out toward white: pct of the colour, the rest white. */
function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, white)`;
}

function looksOf(event: BoardEvent) {
  const theme = competitionTheme(event.sportKey, event.sportTitle);
  const homeKit = kitOrTheme(event.homeColors, theme, "home");
  const awayKit = kitOrTheme(event.awayColors, theme, "away");
  return { theme, homeKit, awayKit, home: leadColor(homeKit) ?? theme.to, away: leadColor(awayKit) ?? theme.from };
}

/* ── A · Duel ─────────────────────────────────────────────────────────── */

function DuelSide({ name, crest, color }: { name: string; crest: string | null; color: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-elevated"
        style={{ boxShadow: `0 0 0 3px ${tint(color, 55)}, 0 2px 6px rgba(15, 23, 42, 0.12)` }}
      >
        <TeamCrest src={crest} size={34} />
      </span>
      <span className="line-clamp-2 text-sm font-semibold leading-tight text-fg">{name}</span>
    </div>
  );
}

export function DuelCard({ event }: { event: BoardEvent }) {
  const { theme, home, away } = looksOf(event);
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-card transition-shadow duration-200 hover:shadow-lg">
      <span aria-hidden className="h-1" style={{ backgroundImage: `linear-gradient(90deg, ${theme.from}, ${theme.to})` }} />
      <div className="flex items-center gap-2 px-4 pt-3">
        <CompetitionIcon theme={theme} size={16} />
        <span className="truncate text-xs font-bold uppercase tracking-wider" style={{ color: theme.from }}>
          {theme.name}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4 sm:pt-3">
        <Link
          href={`/match/${event.id}`}
          className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl px-2 py-5 ${STRETCHED}`}
          style={{
            backgroundImage: `linear-gradient(90deg, ${tint(home, 24)}, ${tint(home, 6)} 42%, ${tint(away, 6)} 58%, ${tint(away, 24)})`,
          }}
        >
          <DuelSide name={event.homeTeam} crest={event.homeCrest} color={home} />
          <span className="flex min-w-20 flex-col items-center gap-1 rounded-2xl bg-bg-elevated px-3 py-2.5 shadow-card">
            <KickoffTime commenceTime={event.commenceTime} />
          </span>
          <DuelSide name={event.awayTeam} crest={event.awayCrest} color={away} />
        </Link>
        <ResultTiles event={event} className="relative z-10 mt-auto" />
        <PickChips event={event} />
      </div>
    </article>
  );
}

/* ── B · Maillots ─────────────────────────────────────────────────────── */

/** A jersey in the club's kit: body in its first colour, sleeves in the second, trim in the third. */
function Jersey({ kit, crest, size = 72 }: { kit: string[]; crest: string | null; size?: number }) {
  const body = kit[0];
  const sleeves = kit[1] ?? kit[0];
  const trim = kit[2] ?? kit[1] ?? kit[0];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" aria-hidden className="h-full w-full drop-shadow-sm">
        <g stroke="rgba(15, 23, 42, 0.25)" strokeWidth="1" strokeLinejoin="round">
          <path d="M21 9 7 17l4 14 10-4z" fill={sleeves} />
          <path d="M43 9l14 8-4 14-10-4z" fill={sleeves} />
          <path d="M21 9l6-2.5c2 3.5 8 3.5 10 0L43 9l1.5 47c-6.5 2.5-18.5 2.5-25 0z" fill={body} />
        </g>
        <path d="M27 6.5c2 3.5 8 3.5 10 0" fill="none" stroke={trim} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M7.8 19.2l3.3 11.2M56.2 19.2l-3.3 11.2" stroke={trim} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="absolute left-1/2 top-[27%] -translate-x-1/2">
        <TeamCrest src={crest} size={Math.round(size * 0.3)} />
      </span>
    </span>
  );
}

/** A mown pitch seen from above: light green bands, white lines. */
function Pitch() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-xl"
      style={{ backgroundImage: "repeating-linear-gradient(90deg, #eaf6ec 0 34px, #e1f1e4 34px 68px)" }}
    >
      <span className="absolute inset-2 rounded-md border-2 border-white/90" />
      <span className="absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 bg-white/90" />
      <span className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90" />
      <span className="absolute left-2 top-1/2 h-20 w-7 -translate-y-1/2 border-2 border-l-0 border-white/90" />
      <span className="absolute right-2 top-1/2 h-20 w-7 -translate-y-1/2 border-2 border-r-0 border-white/90" />
    </span>
  );
}

export function JerseyCard({ event }: { event: BoardEvent }) {
  const { theme, homeKit, awayKit } = looksOf(event);
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-card transition-shadow duration-200 hover:shadow-lg">
      <CompetitionBand theme={theme} />
      <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
        <div className="relative isolate">
          <Pitch />
          <Link
            href={`/match/${event.id}`}
            className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-5 ${STRETCHED}`}
          >
            <span className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <Jersey kit={homeKit} crest={event.homeCrest} size={84} />
              <span className="line-clamp-2 rounded-md bg-white/85 px-1.5 text-sm font-semibold leading-tight text-fg">{event.homeTeam}</span>
            </span>
            <span className="flex min-w-20 flex-col items-center gap-1 rounded-2xl bg-bg-elevated px-3 py-2.5 shadow-card">
              <KickoffTime commenceTime={event.commenceTime} />
            </span>
            <span className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <Jersey kit={awayKit} crest={event.awayCrest} size={84} />
              <span className="line-clamp-2 rounded-md bg-white/85 px-1.5 text-sm font-semibold leading-tight text-fg">{event.awayTeam}</span>
            </span>
          </Link>
        </div>
        <ResultTiles event={event} className="relative z-10 mt-auto" />
        <PickChips event={event} />
      </div>
    </article>
  );
}

/* ── C · Affiche ──────────────────────────────────────────────────────── */

/** Both kits side by side as a thin ribbon: home colours on the left half, away on the right. */
function KitRibbon({ home, away }: { home: string[]; away: string[] }) {
  const half = (kit: string[]) => (
    <span className="flex flex-1">
      {kit.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  );
  return (
    <span aria-hidden className="flex h-1.5 border-b border-border">
      {half(home)}
      {half(away)}
    </span>
  );
}

function PosterSide({ name, crest }: { name: string; crest: string | null }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-white/15">
        <TeamCrest src={crest} size={34} />
      </span>
      <span className="line-clamp-2 text-sm font-bold leading-tight text-white">{name}</span>
    </span>
  );
}

export function PosterCard({ event }: { event: BoardEvent }) {
  const { theme, homeKit, awayKit } = looksOf(event);
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-card transition-shadow duration-200 hover:shadow-lg">
      <div
        className="relative isolate overflow-hidden px-4 pb-5 pt-3"
        style={{ backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${theme.to}, ${theme.from})` }}
      >
        <span aria-hidden className="absolute -left-12 top-1/2 -z-10 -translate-y-1/2 opacity-[0.16] saturate-0 brightness-200">
          <TeamCrest src={event.homeCrest} size={180} />
        </span>
        <span aria-hidden className="absolute -right-12 top-1/2 -z-10 -translate-y-1/2 opacity-[0.16] saturate-0 brightness-200">
          <TeamCrest src={event.awayCrest} size={180} />
        </span>
        <span className="flex items-center justify-center gap-2 text-xs font-semibold tracking-wide text-white">
          <CompetitionIcon theme={theme} size={16} />
          {theme.name}
        </span>
        <Link
          href={`/match/${event.id}`}
          className={`mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 ${STRETCHED}`}
        >
          <PosterSide name={event.homeTeam} crest={event.homeCrest} />
          <span className="flex min-w-20 flex-col items-center gap-1">
            <KickoffTime commenceTime={event.commenceTime} inverted />
          </span>
          <PosterSide name={event.awayTeam} crest={event.awayCrest} />
        </Link>
      </div>
      <KitRibbon home={homeKit} away={awayKit} />
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <ResultTiles event={event} className="relative z-10" />
        <PickChips event={event} />
      </div>
    </article>
  );
}

/* ── D · Billet ───────────────────────────────────────────────────────── */

/** A half-disc bitten out of the ticket's edge, where it would be torn. */
function Notch({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-border bg-bg ${side === "left" ? "-left-3" : "-right-3"}`}
    />
  );
}

function TicketSide({ name, crest, kit }: { name: string; crest: string | null; kit: string[] }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamCrest src={crest} size={44} />
      <span className="line-clamp-2 font-display text-base font-extrabold leading-tight text-fg">{name}</span>
      <KitCapsule kit={kit} />
    </span>
  );
}

export function TicketCard({ event }: { event: BoardEvent }) {
  const { theme, homeKit, awayKit } = looksOf(event);
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-card transition-shadow duration-200 hover:shadow-lg">
      <div className="flex items-center gap-2 px-4 py-2.5 text-white" style={{ backgroundImage: `linear-gradient(90deg, ${theme.from}, ${theme.to})` }}>
        <CompetitionIcon theme={theme} size={16} />
        <span className="truncate text-xs font-bold uppercase tracking-wider">{theme.name}</span>
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-widest text-white/75">Billet</span>
      </div>
      <Link
        href={`/match/${event.id}`}
        className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-4 pb-5 pt-5 ${STRETCHED}`}
      >
        <TicketSide name={event.homeTeam} crest={event.homeCrest} kit={homeKit} />
        <span className="flex min-w-20 flex-col items-center gap-1 pt-2">
          <KickoffTime commenceTime={event.commenceTime} />
        </span>
        <TicketSide name={event.awayTeam} crest={event.awayCrest} kit={awayKit} />
      </Link>
      <div aria-hidden className="relative flex h-6 items-center">
        <Notch side="left" />
        <span className="mx-5 flex-1 border-t-2 border-dashed border-border" />
        <Notch side="right" />
      </div>
      <div className="flex flex-1 flex-col gap-3 bg-bg-row/40 p-3 pt-2 sm:p-4 sm:pt-2">
        <ResultTiles event={event} className="relative z-10" />
        <PickChips event={event} />
      </div>
    </article>
  );
}

/* ── E · Liste ────────────────────────────────────────────────────────── */

/** A club's kit as a small capsule next to its name. */
function KitCapsule({ kit }: { kit: string[] }) {
  return (
    <span aria-hidden className="flex h-2.5 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-fg/15">
      {kit.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

function TeamLine({ name, crest, kit }: { name: string; crest: string | null; kit: string[] }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold text-fg">
      <TeamCrest src={crest} size={22} />
      <span className="truncate">{name}</span>
      <KitCapsule kit={kit} />
    </span>
  );
}

export function CompactCard({ event }: { event: BoardEvent }) {
  const { theme, homeKit, awayKit } = looksOf(event);
  return (
    <article className="relative flex overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card transition-shadow duration-200 hover:shadow-md">
      <span aria-hidden className="w-1.5 shrink-0" style={{ backgroundImage: `linear-gradient(180deg, ${theme.from}, ${theme.to})` }} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-5 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex w-20 shrink-0 flex-col items-center gap-1 whitespace-nowrap border-r border-border pr-3 [&>span]:text-[11px]">
            <KickoffTime commenceTime={event.commenceTime} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.from }}>
              <CompetitionIcon theme={theme} size={14} />
              {theme.name}
            </span>
            <Link href={`/match/${event.id}`} className={`flex min-w-0 flex-col gap-1.5 ${STRETCHED}`}>
              <TeamLine name={event.homeTeam} crest={event.homeCrest} kit={homeKit} />
              <TeamLine name={event.awayTeam} crest={event.awayCrest} kit={awayKit} />
            </Link>
            <PickChips event={event} />
          </div>
        </div>
        <ResultTiles event={event} codes className="relative z-10 sm:w-80" />
      </div>
    </article>
  );
}

export function VariantCard({ event, look }: { event: BoardEvent; look: CardLook }) {
  if (look === "duel") return <DuelCard event={event} />;
  if (look === "maillots") return <JerseyCard event={event} />;
  if (look === "affiche") return <PosterCard event={event} />;
  if (look === "billet") return <TicketCard event={event} />;
  return <CompactCard event={event} />;
}
