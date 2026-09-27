// Temporary: the match block variants side by side, on the day's real matches, so one can
// be chosen with real crests and kit colours. Removed once the board settles on one.
import { getBoard, type BoardEvent } from "@/lib/board";
import { parisDateKey } from "@/lib/dates";
import { VariantCard, type CardLook } from "@/components/MatchCardVariants";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Variantes du bloc de match — SportsBet" };

const VARIANTS: { look: CardLook; letter: string; name: string; pitch: string }[] = [
  {
    look: "duel",
    letter: "A",
    name: "Duel",
    pitch: "Chaque moitié du bloc se teinte doucement aux couleurs de son club, l'heure au centre dans une pastille ; la compétition en liseré et en titre.",
  },
  {
    look: "maillots",
    letter: "B",
    name: "Maillots",
    pitch: "Chaque équipe est représentée par son maillot, dessiné à ses couleurs avec l'écusson sur la poitrine, sur une pelouse stylisée.",
  },
  {
    look: "affiche",
    letter: "C",
    name: "Affiche",
    pitch: "Le haut du bloc devient une affiche aux couleurs de la compétition, écussons géants en filigrane, liseré des deux maillots.",
  },
  {
    look: "billet",
    letter: "D",
    name: "Billet",
    pitch: "Le bloc prend la forme d'un billet de match : en-tête aux couleurs de la compétition, pastille des couleurs de chaque club, cotes sous la ligne de découpe.",
  },
  {
    look: "liste",
    letter: "E",
    name: "Liste",
    pitch: "Une ligne par match, plus dense : barre de la compétition à gauche, pastille aux couleurs de chaque club, cotes à droite.",
  },
];

/** Matches that show a look at its best first: priced, both kits known, a pick to flag. */
function showcaseScore(event: BoardEvent): number {
  return (
    (event.h2h.length > 0 ? 4 : 0) +
    (event.homeColors.length > 0 ? 1 : 0) +
    (event.awayColors.length > 0 ? 1 : 0) +
    (event.verdicts.length > 0 ? 1 : 0)
  );
}

export default async function Variantes({ searchParams }: { searchParams: Promise<{ look?: string }> }) {
  const { look } = await searchParams;
  const { events, upcomingFallback } = await getBoard({ dateKey: parisDateKey(new Date()), status: "all", query: "" });
  const showcase = [...(events.length > 0 ? events : upcomingFallback)].sort((a, b) => showcaseScore(b) - showcaseScore(a));
  const cards = showcase.slice(0, 2);
  const rows = showcase.slice(0, 3);

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="board" />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6">
        {showcase.length === 0 ? <p className="text-sm text-fg-muted">Aucun match à venir pour illustrer les variantes.</p> : null}
        {VARIANTS.filter((v) => !look || v.look === look).map((v) => (
          <section key={v.look} id={v.look} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl font-extrabold text-fg">
                <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-fg text-base text-white">{v.letter}</span>
                {v.name}
              </h2>
              <p className="max-w-2xl text-sm text-fg-muted">{v.pitch}</p>
            </div>
            <div className={`grid gap-4 ${v.look === "liste" ? "" : "md:grid-cols-2"}`}>
              {(v.look === "liste" ? rows : cards).map((event) => (
                <VariantCard key={event.id} event={event} look={v.look} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
