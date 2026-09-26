import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNALS } from "@/lib/methodology/config";
import {
  analyzeMarket,
  detectReverseLineMovement,
  detectSteam,
  fairOf,
  lineMovementNudge,
  type BookClassifier,
  type BookSeries,
  type MarketHistory,
} from "@/lib/methodology/signals";

const classifier: BookClassifier = {
  role: (key) => (key === "pinnacle" ? "sharp" : key === "betfair_ex_eu" ? "exchange" : "soft"),
  isBettable: (key) => key !== "pinnacle" && key !== "betfair_ex_eu",
};

const T0 = Date.UTC(2026, 8, 20, 10, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60 * 1000);

function series(bookmakerKey: string, points: { t: number; u?: number; home: number; away: number }[], lastSeen?: number): BookSeries {
  return {
    bookmakerKey,
    observations: points.map((p) => ({ capturedAt: at(p.t), updatedAt: at(p.u ?? p.t), prices: { Home: p.home, Away: p.away } })),
    lastSeenAt: at(lastSeen ?? points[points.length - 1].t),
  };
}

const market = (books: BookSeries[]): MarketHistory => ({ marketKey: "totals", point: 2.5, outcomes: ["Home", "Away"], books });

test("line movement nudge is quadratic below the cap and capped above it", () => {
  assert.equal(lineMovementNudge(0), 0);
  const small = lineMovementNudge(0.01);
  assert.ok(Math.abs(small - SIGNALS.lineMoveCap * (0.01 / SIGNALS.lineMoveFullAt) ** 2) < 1e-12);
  assert.equal(lineMovementNudge(0.1), SIGNALS.lineMoveCap);
  assert.equal(lineMovementNudge(-0.1), -SIGNALS.lineMoveCap);
  assert.ok(Math.abs(lineMovementNudge(0.02)) > Math.abs(small) * 3.9, "twice the move, four times the nudge");
});

test("steam needs two books moving the same way within five minutes", () => {
  const steam = detectSteam(
    market([
      series("book_a", [{ t: 0, home: 2.0, away: 1.9 }, { t: 60, u: 50, home: 1.85, away: 2.05 }]),
      series("book_b", [{ t: 0, home: 2.0, away: 1.9 }, { t: 60, u: 53, home: 1.87, away: 2.02 }]),
      series("book_c", [{ t: 0, home: 2.0, away: 1.9 }, { t: 60, home: 2.0, away: 1.9 }]),
    ]),
    at(90)
  );
  assert.equal(steam.Home?.direction, 1);
  assert.deepEqual(steam.Home?.books.sort(), ["book_a", "book_b"]);
  assert.equal(steam.Away?.direction, -1);

  const tooFarApart = detectSteam(
    market([
      series("book_a", [{ t: 0, home: 2.0, away: 1.9 }, { t: 60, u: 30, home: 1.85, away: 2.05 }]),
      series("book_b", [{ t: 0, home: 2.0, away: 1.9 }, { t: 60, u: 50, home: 1.85, away: 2.05 }]),
    ]),
    at(90)
  );
  assert.equal(tooFarApart.Home, null);

  const oneBook = detectSteam(market([series("book_a", [{ t: 0, home: 2.0, away: 1.9 }, { t: 60, home: 1.7, away: 2.3 }])]), at(90));
  assert.equal(oneBook.Home, null);
});

test("reverse line movement: the sharp book shortens a side the public books drift", () => {
  const rlm = detectReverseLineMovement(
    market([
      series("pinnacle", [{ t: 0, home: 2.0, away: 1.95 }, { t: 120, home: 1.9, away: 2.05 }]),
      series("book_a", [{ t: 0, home: 1.95, away: 1.95 }, { t: 120, home: 2.05, away: 1.85 }]),
      series("book_b", [{ t: 0, home: 1.95, away: 1.95 }, { t: 120, home: 2.05, away: 1.85 }]),
    ]),
    classifier
  );
  assert.equal(rlm.Home?.sharpSide, 1);
  assert.equal(rlm.Away?.sharpSide, -1);
  assert.ok(rlm.Home!.publicMove < 0);
});

test("market analysis: weighted consensus, stale books, best bettable price, predicted CLV", () => {
  const view = analyzeMarket(
    market([
      series("pinnacle", [{ t: 0, home: 1.95, away: 1.95 }, { t: 120, home: 1.8, away: 2.1 }]),
      series("book_a", [{ t: 0, home: 1.9, away: 1.9 }, { t: 120, home: 1.85, away: 1.95 }]),
      series("book_b", [{ t: 0, home: 1.9, away: 1.9 }, { t: 120, home: 2.05, away: 1.75 }]), // slow to move: stale on Home
      series("betfair_ex_eu", [{ t: 0, home: 2.0, away: 2.0 }, { t: 120, home: 1.84, away: 2.18 }]),
      series("book_gone", [{ t: 0, home: 3.0, away: 1.4 }], 0), // stopped quoting
    ]),
    classifier,
    at(121),
    at(300)
  )!;
  assert.ok(view);
  assert.equal(view.bookCount, 4);
  assert.equal(view.hasSharp, true);
  assert.equal(view.hasExchange, true);
  assert.ok(Math.abs(view.consensus.Home + view.consensus.Away - 1) < 1e-9);

  const pinnacle = fairOf({ Home: 1.8, Away: 2.1 }, ["Home", "Away"])!;
  const others = ["book_a", "book_b", "betfair_ex_eu"].map((key) => view.books.find((b) => b.bookmakerKey === key)!.fair.Home);
  const expected = (2 * pinnacle.Home + others.reduce((a, b) => a + b, 0)) / 5;
  assert.ok(Math.abs(view.consensus.Home - expected) < 1e-9, "Pinnacle counts double");

  const home = view.byOutcome.Home;
  assert.equal(home.best?.bookmakerKey, "book_b", "best price among bettable books only");
  assert.equal(home.best?.flag, "stale");
  assert.ok(home.delta > 0, "the market moved toward Home since the opener");
  assert.ok(home.nudge > 0);
  assert.ok(home.sharpDivergence! > 0, "Pinnacle rates Home higher than the soft books");
  assert.ok(home.predictedClv! > 0, "a stale price the sharp book disagrees with should beat the close");
  assert.equal(view.byOutcome.Away.best?.bookmakerKey, "book_a");
});
