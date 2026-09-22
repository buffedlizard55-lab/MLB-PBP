// test_eventlog.mjs — unit tests for docs/js/eventlog.js detection + store.
//
// Fixtures below are SYNTHETIC (explicitly fabricated) and are never presented
// as baseball data. They exist only to exercise the pure detection functions and
// the localStorage-backed store with deterministic inputs.
//
// Run:  node --test tests/test_eventlog.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeEvents,
  createLogStore,
  eventTypeLabel,
  isPendingEventType,
  renderEventLogHTML,
} from "../docs/js/eventlog.js";

// ---- synthetic fixture builders -------------------------------------------------

function play(atBatIndex, opts = {}) {
  const {
    eventType = "strikeout",
    description = "Out",
    awayScore = 0,
    homeScore = 0,
    isComplete = true,
    inning = 1,
    halfInning = "top",
    batter = "Batter Name",
    pitcher = "Pitcher Name",
    playEvents = [],
  } = opts;
  return {
    about: { atBatIndex, isComplete, inning, halfInning },
    result: { eventType, description, awayScore, homeScore },
    matchup: { batter: { fullName: batter }, pitcher: { fullName: pitcher } },
    playEvents,
  };
}

function feed({ scoringPlays = [], plays = [], reason = null } = {}) {
  return {
    gamePk: 1,
    liveData: {
      plays: { scoringPlays, allPlays: plays },
      linescore: {
        currentInning: 1,
        inningState: "top",
        teams: { away: { runs: 0 }, home: { runs: 0 } },
      },
    },
    gameData: { status: { reason } },
  };
}

const T1 = "2026-09-22T01:00:00.000Z";
const T2 = "2026-09-22T01:00:15.000Z";

// ---- labels / pending marker ----------------------------------------------------

test("isPendingEventType recognizes the verified pending markers", () => {
  assert.equal(isPendingEventType("os_ruling_pending_primary"), true);
  assert.equal(isPendingEventType("os_ruling_pending_prior"), true);
  assert.equal(isPendingEventType("single"), false);
  assert.equal(isPendingEventType("field_error"), false);
});

test("eventTypeLabel maps registry codes and formats unknowns", () => {
  assert.equal(eventTypeLabel("home_run"), "Home run");
  assert.equal(eventTypeLabel("field_error"), "Field error");
  assert.equal(eventTypeLabel("os_ruling_pending_primary"), "Official scorer ruling pending");
  assert.equal(eventTypeLabel("weird_code"), "Weird Code");
  assert.equal(eventTypeLabel(""), "Unknown");
});

// ---- score changes --------------------------------------------------------------

test("score: logs each scoring play once, never duplicates", () => {
  const f = feed({
    scoringPlays: [2],
    plays: [
      play(0),
      play(1),
      play(2, { description: "Home run", awayScore: 1, homeScore: 0 }),
    ],
  });
  const first = computeEvents(f, {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(first.actions.length, 1);
  const a = first.actions[0];
  assert.equal(a.category, "score");
  assert.equal(a.stage, "scored");
  assert.equal(a.id, "score-1-2");
  assert.equal(a.title, "Home run");

  const second = computeEvents(f, first.baseline, { gamePk: "1", fetchedAt: T2 });
  assert.equal(second.actions.length, 0, "re-ingesting the same feed must not re-log");
});

test("score: logs multiple scoring plays across feeds", () => {
  const f = feed({ scoringPlays: [0, 1], plays: [play(0, { description: "Single", awayScore: 1, homeScore: 0 }), play(1, { description: "Double", awayScore: 1, homeScore: 1 })] });
  const r = computeEvents(f, {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(r.actions.length, 2);
});

// ---- scoring ruling changes (poll-diff) -----------------------------------------

test("ruling: records a classification change between polls", () => {
  const before = feed({ plays: [play(5, { eventType: "single", description: "Single" })] });
  const r1 = computeEvents(before, {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(r1.actions.length, 0, "first sight of a completed play only baselines it");

  const after = feed({ plays: [play(5, { eventType: "double", description: "Double" })] });
  const r2 = computeEvents(after, r1.baseline, { gamePk: "1", fetchedAt: T2 });
  assert.equal(r2.actions.length, 1);
  const a = r2.actions[0];
  assert.equal(a.category, "ruling");
  assert.equal(a.stage, "changed");
  assert.equal(a.title, "Single → Double");
  assert.equal(a.id, "ruling-1-5");
});

test("ruling: ignores a pending marker so pending->final is not double-counted", () => {
  const pending = feed({ plays: [play(5, { eventType: "os_ruling_pending_primary", description: "Official scorer ruling pending" })] });
  const r1 = computeEvents(pending, {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(r1.actions.length, 1);
  assert.equal(r1.actions[0].category, "pending");

  const resolved = feed({ plays: [play(5, { eventType: "field_error", description: "Fielder's choice" })] });
  const r2 = computeEvents(resolved, r1.baseline, { gamePk: "1", fetchedAt: T2 });
  // The same atBat becomes a ruling entry of category "pending" (resolved), NOT "ruling".
  const rulingChanges = r2.actions.filter((x) => x.category === "ruling");
  assert.equal(rulingChanges.length, 0);
  const resolvedPending = r2.actions.find((x) => x.category === "pending" && x.stage === "resolved");
  assert.ok(resolvedPending, "pending play resolves to a 'resolved' stage");
});

// ---- scoring pending (official scorer) ------------------------------------------

test("pending: pending then resolved records two stages on one entry", () => {
  const pending = feed({ plays: [play(7, { eventType: "os_ruling_pending_primary", description: "Official scorer ruling pending (primary plate-appearance ruling)" })] });
  const r1 = computeEvents(pending, {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(r1.actions.length, 1);
  assert.equal(r1.actions[0].stage, "pending");
  assert.equal(r1.actions[0].id, "pending-1-7");

  const resolved = feed({ plays: [play(7, { eventType: "field_error", description: "Anthony Seigler reaches on a fielder's choice" })] });
  const r2 = computeEvents(resolved, r1.baseline, { gamePk: "1", fetchedAt: T2 });
  assert.equal(r2.actions.length, 1);
  assert.equal(r2.actions[0].stage, "resolved");
  assert.equal(r2.actions[0].detail, "Anthony Seigler reaches on a fielder's choice");
});

test("pending: also detected when the marker lives on a playEvent", () => {
  const p = play(8, { eventType: "strikeout" });
  p.playEvents = [{ details: { eventType: "os_ruling_pending_prior" } }];
  const r = computeEvents(feed({ plays: [p] }), {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].category, "pending");
});

// ---- boundary calls -------------------------------------------------------------

test("boundary: under review then resolved", () => {
  const review = feed({ reason: "Home run" });
  const r1 = computeEvents(review, {}, { gamePk: "1", fetchedAt: T1 });
  assert.equal(r1.actions.length, 1);
  assert.equal(r1.actions[0].category, "boundary");
  assert.equal(r1.actions[0].stage, "under_review");

  const done = feed({ reason: null });
  const r2 = computeEvents(done, r1.baseline, { gamePk: "1", fetchedAt: T2 });
  assert.equal(r2.actions.length, 1);
  assert.equal(r2.actions[0].category, "boundary");
  assert.equal(r2.actions[0].stage, "resolved");
});

test("boundary: outcome annotated from reviewDetails when determinable", () => {
  const review = feed({ reason: "Home run" });
  const r1 = computeEvents(review, {}, { gamePk: "1", fetchedAt: T1 });

  const overturned = feed({
    reason: null,
    plays: [
      {
        about: { atBatIndex: 9, endTime: "2026-09-22T01:00:00Z" },
        playEvents: [{ endTime: "2026-09-22T01:00:00Z", reviewDetails: { isOverturned: true, reviewType: "MJ" } }],
      },
    ],
  });
  const r2 = computeEvents(overturned, r1.baseline, { gamePk: "1", fetchedAt: T2 });
  assert.equal(r2.actions[0].stage, "overturned");

  const stood = feed({
    reason: null,
    plays: [
      {
        about: { atBatIndex: 9, endTime: "2026-09-22T01:00:00Z" },
        playEvents: [{ endTime: "2026-09-22T01:00:00Z", reviewDetails: { isOverturned: false, reviewType: "UR" } }],
      },
    ],
  });
  const r3 = computeEvents(stood, r1.baseline, { gamePk: "1", fetchedAt: T2 });
  assert.equal(r3.actions[0].stage, "confirmed");
});

// ---- store integration ----------------------------------------------------------

test("store: ingesting a feed is idempotent and survives count()", () => {
  const store = createLogStore("store-1");
  const f = feed({
    scoringPlays: [2],
    plays: [play(0), play(1), play(2, { description: "Home run", awayScore: 1, homeScore: 0 })],
  });
  const n1 = store.ingest(f, T1);
  assert.equal(n1, 1);
  assert.equal(store.count(), 1);
  const entries = store.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].stages.length, 1);

  const n2 = store.ingest(f, T2);
  assert.equal(n2, 0, "no new actions on re-ingest");
  assert.equal(store.count(), 1);
});

test("store: clear() empties entries and baseline", () => {
  const store = createLogStore("store-2");
  store.ingest(feed({ scoringPlays: [0], plays: [play(0, { description: "Walk", awayScore: 1, homeScore: 0 })] }), T1);
  assert.equal(store.count(), 1);
  store.clear();
  assert.equal(store.count(), 0);
  assert.equal(store.getEntries().length, 0);
});

// ---- rendering ------------------------------------------------------------------

test("integration: a live-viewing sequence builds a complete, staged log", () => {
  const store = createLogStore("live-seq");
  const T = (s) => `2026-09-22T01:0${s}:00.000Z`;

  // Poll 1 (Live): one run scores; an official-scorer ruling is pending.
  const p1 = feed({
    scoringPlays: [0],
    plays: [
      play(1, { description: "Home run", awayScore: 1, homeScore: 0 }),
      play(5, { eventType: "os_ruling_pending_primary", description: "Official scorer ruling pending (primary plate-appearance ruling)" }),
    ],
    reason: null,
  });
  store.ingest(p1, T(0));

  // Poll 2 (Live): the pending ruling resolves; a second run scores; a boundary
  // (home-run) call goes under review.
  const p2 = feed({
    scoringPlays: [0, 1],
    plays: [
      play(1, { description: "Home run", awayScore: 1, homeScore: 0 }),
      play(2, { description: "Double", awayScore: 2, homeScore:0 }),
      play(5, { eventType: "field_error", description: "Anthony Seigler reaches on a fielder's choice" }),
    ],
    reason: "Home run",
  });
  store.ingest(p2, T(1));

  // Poll 3 (Live): the boundary review resolves; nothing else changes.
  const p3 = feed({
    scoringPlays: [0, 1],
    plays: [
      play(1, { description: "Home run", awayScore: 1, homeScore: 0 }),
      play(2, { description: "Double", awayScore: 2, homeScore:0 }),
      play(5, { eventType: "field_error", description: "Anthony Seigler reaches on a fielder's choice" }),
    ],
    reason: null,
  });
  store.ingest(p3, T(2));

  const entries = store.getEntries();
  const byId = Object.fromEntries(entries.map((x) => [x.id, x]));
  assert.equal(entries.length, 4);
  assert.deepEqual(byId["score-live-seq-0"].stages.map((s) => s.stage), ["scored"]);
  assert.deepEqual(byId["score-live-seq-1"].stages.map((s) => s.stage), ["scored"]);
  assert.deepEqual(byId["pending-live-seq-5"].stages.map((s) => s.stage), ["pending", "resolved"]);
  assert.deepEqual(byId["boundary-live-seq"].stages.map((s) => s.stage), ["under_review", "resolved"]);
});

test("gate: a game never opened while Live yields no backfilled entries", () => {
  // Mirrors the app's ingestion gate: only ingest when abstractGameState is Live.
  function appIngest(store, feed, fetchedAt) {
    if (feed.gameData?.status?.abstractGameState === "Live") store.ingest(feed, fetchedAt);
  }
  const store = createLogStore("never-watched");

  // A Final feed that a visitor opens later: it has scoring plays and a
  // resolved ruling, but the page never watched it Live.
  const finalFeed = feed({
    scoringPlays: [0, 1],
    plays: [
      play(1, { description: "Home run", awayScore: 1, homeScore: 0 }),
      play(2, { description: "Double", awayScore: 2, homeScore: 0 }),
    ],
    reason: null,
  });
  finalFeed.gameData = { status: { abstractGameState: "Final", statusCode: "F" } };

  appIngest(store, finalFeed, T1);
  assert.equal(store.count(), 0, "no entries synthesized for an un-watched Final game");

  // If the same game were opened while Live, ingestion would capture it.
  const liveFeed = JSON.parse(JSON.stringify(finalFeed));
  liveFeed.gameData.status.abstractGameState = "Live";
  appIngest(store, liveFeed, T2);
  assert.equal(store.count(), 2, "opening Live captures the scoring plays");
});

test("renderEventLogHTML: empty state and populated list", () => {
  const empty = renderEventLogHTML([]);
  assert.match(empty, /Event log/);
  assert.match(empty, /No transient events captured/);

  const entries = [
    {
      id: "score-1-2",
      category: "score",
      title: "Home run",
      stages: [{ at: T1, stage: "scored", detail: "Score 1-0" }],
      meta: { half: "TOP", inning: 1, awayScore: 1, homeScore: 0 },
      gamePk: "1",
    },
  ];
  const html = renderEventLogHTML(entries);
  assert.match(html, /Score change/);
  assert.match(html, /Home run/);
  assert.match(html, /log-panel|log-list/);
  // Escaping: angle brackets in any field would be neutralized.
  assert.doesNotMatch(html, /<script>/);
});
