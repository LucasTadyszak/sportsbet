// Loads the pre-kickoff odds history of a set of events in the shape the market
// signals need. The odds table stores every sync, so it grows fast; this only brings
// back the change points — one row per book/market/line state, with consecutive
// identical syncs collapsed in SQL — plus when each book was last seen quoting.
import { prisma } from "@/lib/prisma";
import type { BookSeries, MarketHistory } from "@/lib/methodology/signals";

type ChangeRow = {
  eventId: string;
  bookmakerKey: string;
  marketKey: string;
  point: number | null;
  capturedAt: Date;
  lastUpdate: Date;
  prices: Record<string, number>;
  lastSeenAt: Date;
};

export type EventMarketHistories = { h2h: MarketHistory | null; totals: MarketHistory[] };

async function loadChangeRows(eventIds: string[]): Promise<ChangeRow[]> {
  if (eventIds.length === 0) return [];
  return prisma.$queryRaw<ChangeRow[]>`
    WITH ticks AS (
      SELECT o."eventId", o."bookmakerKey", o."marketKey", o."point", o."capturedAt",
             MAX(o."lastUpdate") AS "lastUpdate",
             jsonb_object_agg(o."outcomeName", o."price") AS prices
      FROM odds o
      JOIN events e ON e.id = o."eventId"
      WHERE o."eventId" = ANY(${eventIds})
        AND o."marketKey" IN ('h2h', 'totals')
        AND o."capturedAt" < e."commenceTime"
      GROUP BY o."eventId", o."bookmakerKey", o."marketKey", o."point", o."capturedAt"
    ),
    marked AS (
      SELECT t.*,
             LAG(t.prices) OVER w AS "previousPrices",
             MAX(t."capturedAt") OVER (PARTITION BY t."eventId", t."bookmakerKey", t."marketKey", t."point") AS "lastSeenAt"
      FROM ticks t
      WINDOW w AS (PARTITION BY t."eventId", t."bookmakerKey", t."marketKey", t."point" ORDER BY t."capturedAt")
    )
    SELECT "eventId", "bookmakerKey", "marketKey", "point", "capturedAt", "lastUpdate", prices, "lastSeenAt"
    FROM marked
    WHERE "previousPrices" IS NULL OR "previousPrices" <> prices
    ORDER BY "eventId", "marketKey", "point", "bookmakerKey", "capturedAt"
  `;
}

function toSeries(rows: ChangeRow[]): BookSeries[] {
  const byBook = new Map<string, ChangeRow[]>();
  for (const row of rows) {
    const list = byBook.get(row.bookmakerKey) ?? [];
    list.push(row);
    byBook.set(row.bookmakerKey, list);
  }
  return Array.from(byBook, ([bookmakerKey, bookRows]) => ({
    bookmakerKey,
    observations: bookRows.map((r) => ({ capturedAt: r.capturedAt, updatedAt: r.lastUpdate, prices: r.prices })),
    lastSeenAt: bookRows[0].lastSeenAt,
  }));
}

export async function loadMarketHistories(
  events: { id: string; homeTeam: string; awayTeam: string }[]
): Promise<Map<string, EventMarketHistories>> {
  const rows = await loadChangeRows(events.map((e) => e.id));
  const result = new Map<string, EventMarketHistories>();

  for (const event of events) {
    const eventRows = rows.filter((r) => r.eventId === event.id);
    const h2hRows = eventRows.filter((r) => r.marketKey === "h2h");
    const h2h: MarketHistory | null =
      h2hRows.length > 0
        ? { marketKey: "h2h", point: null, outcomes: [event.homeTeam, "Draw", event.awayTeam], books: toSeries(h2hRows) }
        : null;

    const byPoint = new Map<number, ChangeRow[]>();
    for (const row of eventRows) {
      if (row.marketKey !== "totals" || row.point === null) continue;
      const list = byPoint.get(row.point) ?? [];
      list.push(row);
      byPoint.set(row.point, list);
    }
    const totals = Array.from(byPoint, ([point, pointRows]) => ({
      marketKey: "totals",
      point,
      outcomes: ["Over", "Under"],
      books: toSeries(pointRows),
    }));

    result.set(event.id, { h2h, totals });
  }
  return result;
}

/**
 * The totals line to judge: the one most books quote both sides of in the latest sync
 * (ties go to the line closest to 2.5) — pricing every alternative line would just
 * produce correlated picks on the same match.
 */
export function mainTotalsLine(totals: MarketHistory[]): MarketHistory | null {
  if (totals.length === 0) return null;
  const latest = Math.max(...totals.flatMap((m) => m.books.map((b) => b.lastSeenAt.getTime())));
  const quoting = (market: MarketHistory) =>
    market.books.filter((b) => {
      const last = b.observations[b.observations.length - 1];
      return b.lastSeenAt.getTime() >= latest - 2 * 60 * 1000 && last && last.prices.Over && last.prices.Under;
    }).length;
  const ranked = [...totals].sort(
    (a, b) => quoting(b) - quoting(a) || Math.abs((a.point ?? 0) - 2.5) - Math.abs((b.point ?? 0) - 2.5)
  );
  return quoting(ranked[0]) > 0 ? ranked[0] : null;
}
