// eventlog.js — local, retrievable log of transient official-game events.
//
// WHAT THIS DOES
// --------------
// While the site polls a LIVE game (the existing live-refresh in app.js), MLB's
// feed shows short-lived states that disappear once they resolve: a run scoring,
// an official-scorer ruling that is initially "pending" and later finalized, a
// scoring ruling that is corrected after the fact, and a home-run / boundary
// call that goes under replay review. This module captures each of those at every
// stage it is observed and persists them in the browser so they can be reopened
// and read after the event (or the game) is over.
//
// DATA PROVENANCE (verified, no invention)
// ---------------------------------------
// Every field read here comes from the same /api/v1.1/game/{gamePk}/feed/live
// payload the site already fetches. The exact names were confirmed line-by-line
// against the live StatsAPI (see the sibling project's verified PBP_FIELDS):
//   liveData.plays.scoringPlays                       -> number[] of play indices
//   liveData.plays.allPlays[].about.atBatIndex         -> stable plate-appearance id
//   liveData.plays.allPlays[].about.inning/halfInning/isComplete
//   liveData.plays.allPlays[].result.eventType/event/description/awayScore/homeScore
//   liveData.plays.allPlays[].matchup.batter/pitcher.{id,fullName}
//   liveData.plays.allPlays[].playEvents[].details.eventType  (carries pending markers)
//   liveData.plays.allPlays[].playEvents[].reviewDetails.{inProgress,isOverturned,reviewType,challengeTeamId}
//   liveData.linescore.teams.{away,home}.runs / currentInning / inningState
//   gameData.status.statusCode / gameData.status.reason  ("Home run" => boundary review)
//
// The ONLY invented values are human-readable labels derived from the official
// eventType codes (e.g. "home_run" -> "Home run"); the baseball data itself is
// always the literal value MLB returned.

const STORAGE_PREFIX = "mlbPbpEventLog.v1.";
const STORAGE_VERSION = 1;

// Official-scorer ruling-pending markers (verified live; MLB eventType registry).
const PENDING_EVENT_TYPES = new Set([
  "os_ruling_pending_primary",
  "os_ruling_pending_prior",
]);

// Human-readable labels for the verified eventType registry codes. Unknown codes
// are formatted (underscores -> spaces, title-cased) rather than guessed.
const EVENT_TYPE_LABELS = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  home_run: "Home run",
  field_error: "Field error",
  error: "Error",
  walk: "Walk",
  intentional_walk: "Intentional walk",
  hit_by_pitch: "Hit by pitch",
  strikeout: "Strikeout",
  strikeout_looking: "Strikeout (looking)",
  strikeout_swinging: "Strikeout (swinging)",
  ground_out: "Groundout",
  flyout: "Flyout",
  line_out: "Lineout",
  popup: "Pop out",
  force_out: "Force out",
  double_play: "Double play",
  triple_play: "Triple play",
  fielders_choice: "Fielder's choice",
  catcher_interf: "Catcher interference",
  sac_bunt: "Sacrifice bunt",
  sac_fly: "Sacrifice fly",
  os_ruling_pending_primary: "Official scorer ruling pending",
  os_ruling_pending_prior: "Official scorer ruling pending",
};

export const CATEGORY_LABELS = {
  score: "Score change",
  ruling: "Scoring ruling",
  pending: "Scoring pending",
  boundary: "Boundary call",
};

export const STAGE_LABELS = {
  scored: "Scored",
  changed: "Ruling changed",
  pending: "Pending",
  resolved: "Resolved",
  under_review: "Under review",
  overturned: "Overturned",
  confirmed: "Confirmed",
};

const esc = (input) =>
  String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function isPendingEventType(code) {
  return PENDING_EVENT_TYPES.has(code);
}

export function eventTypeLabel(code) {
  if (!code) return "Unknown";
  if (EVENT_TYPE_LABELS[code]) return EVENT_TYPE_LABELS[code];
  return code
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyBaseline() {
  return {
    scorePlayIds: [],
    eventTypes: Object.create(null),
    pending: Object.create(null),
    boundaryActive: false,
    prevReason: null,
  };
}

function cloneBaseline(baseline) {
  const b = baseline || emptyBaseline();
  return {
    scorePlayIds: Array.isArray(b.scorePlayIds) ? [...b.scorePlayIds] : [],
    eventTypes: { ...(b.eventTypes || {}) },
    pending: { ...(b.pending || {}) },
    boundaryActive: Boolean(b.boundaryActive),
    prevReason: b.prevReason ?? null,
  };
}

function metaFromPlay(play, linescore) {
  const about = play?.about || {};
  const result = play?.result || {};
  return {
    inning: about.inning ?? null,
    half: about.halfInning === "bottom" ? "BOT" : about.halfInning === "top" ? "TOP" : "",
    awayScore: result.awayScore ?? null,
    homeScore: result.homeScore ?? null,
    batter: play?.matchup?.batter?.fullName || "",
    pitcher: play?.matchup?.pitcher?.fullName || "",
    description: result.description || result.event || "",
  };
}

function metaFromLinescore(linescore) {
  const state = (linescore?.inningState || "").toLowerCase();
  return {
    inning: linescore?.currentInning ?? null,
    half: state === "bottom" ? "BOT" : state === "top" ? "TOP" : "",
    awayScore: linescore?.teams?.away?.runs ?? null,
    homeScore: linescore?.teams?.home?.runs ?? null,
    batter: "",
    pitcher: "",
    description: "",
  };
}

// Best-effort: find the most recent reviewed play whose reviewDetails carries an
// explicit isOverturned boolean. Used only to annotate a boundary review's
// outcome. Returns null when no determinable outcome exists (never guessed).
function findReviewedPlayOutcome(feed) {
  const plays = feed?.liveData?.plays?.allPlays || [];
  let best = null;
  for (const play of plays) {
    for (const ev of play?.playEvents || []) {
      const rd = ev?.reviewDetails;
      if (rd && typeof rd.isOverturned === "boolean") {
        const time = play?.about?.endTime || ev?.endTime || "";
        if (!best || (time && time > best.time)) {
          best = { isOverturned: rd.isOverturned, time };
        }
      }
    }
  }
  return best;
}

/**
 * Pure detection. Compares `feed` against `baseline` and returns the list of
 * stage actions to record plus the updated baseline. Does NOT mutate either
 * argument. `fetchedAt` is the time we observed the feed (used as the stage
 * timestamp) and `gamePk` namespaces entry ids.
 */
export function computeEvents(feed, baseline, { gamePk, fetchedAt }) {
  const next = cloneBaseline(baseline);
  const actions = [];
  if (!feed) return { actions, baseline: next };

  const plays = feed?.liveData?.plays?.allPlays || [];
  const scoringPlays = feed?.liveData?.plays?.scoringPlays || [];
  const linescore = feed?.liveData?.linescore || {};
  const status = feed?.gameData?.status || {};

  // 1) SCORE CHANGES — each play the official feed lists as a scoring play.
  for (const idx of scoringPlays) {
    if (next.scorePlayIds.includes(idx)) continue;
    const play = plays[idx];
    if (!play) continue;
    next.scorePlayIds.push(idx);
    const meta = metaFromPlay(play, linescore);
    const result = play?.result || {};
    actions.push({
      id: `score-${gamePk}-${idx}`,
      category: "score",
      stage: "scored",
      title: result.description || result.event || "Run scored",
      detail: `Score ${meta.awayScore ?? "?"}-${meta.homeScore ?? "?"}`,
      meta,
    });
  }

  // 2) SCORING RULING CHANGES (poll-diff) + 3) SCORING PENDING, in one pass.
  const seenPending = new Set();
  for (const play of plays) {
    const about = play?.about || {};
    const atBat = about.atBatIndex;
    if (atBat == null) continue;
    const result = play?.result || {};
    const et = result?.eventType;
    const pendingHere =
      isPendingEventType(et) ||
      (play?.playEvents || []).some((ev) => isPendingEventType(ev?.details?.eventType));

    if (pendingHere) {
      seenPending.add(atBat);
      if (!next.pending[atBat]) {
        next.pending[atBat] = { eventType: et, description: result?.description || "" };
        actions.push({
          id: `pending-${gamePk}-${atBat}`,
          category: "pending",
          stage: "pending",
          title: "Official scorer ruling pending",
          detail: result?.description || "Official scorer ruling pending",
          meta: metaFromPlay(play, linescore),
        });
      }
    } else {
      if (next.pending[atBat]) {
        delete next.pending[atBat];
        actions.push({
          id: `pending-${gamePk}-${atBat}`,
          category: "pending",
          stage: "resolved",
          title: "Ruling complete",
          detail: result?.description || "Official ruling recorded.",
          meta: metaFromPlay(play, linescore),
        });
      }
      // Ruling diff only for completed, non-pending plays; pending markers are
      // never baselined so a pending->final transition is not double-counted.
      if (about.isComplete && et && !isPendingEventType(et)) {
        const prev = next.eventTypes[atBat];
        if (prev === undefined) {
          next.eventTypes[atBat] = et;
        } else if (prev !== et) {
          actions.push({
            id: `ruling-${gamePk}-${atBat}`,
            category: "ruling",
            stage: "changed",
            title: `${eventTypeLabel(prev)} → ${eventTypeLabel(et)}`,
            detail: result?.description || "",
            meta: metaFromPlay(play, linescore),
          });
          next.eventTypes[atBat] = et;
        }
      }
    }
  }

  // 3b) Any pending play that vanished from the payload before resolution.
  for (const key of Object.keys(next.pending)) {
    const atBat = Number(key);
    if (!seenPending.has(atBat)) {
      const p = next.pending[key];
      delete next.pending[key];
      actions.push({
        id: `pending-${gamePk}-${atBat}`,
        category: "pending",
        stage: "resolved",
        title: "Ruling complete",
        detail: p?.description || "Play left the feed before a resolved ruling was observed.",
        meta: {},
      });
    }
  }

  // 4) BOUNDARY CALLS — a home-run / boundary replay review (status reason
  //    "Home run"). The registry attaches `reason` only to review states.
  const reason = status?.reason;
  const isBoundary = reason === "Home run";
  if (isBoundary && !next.boundaryActive) {
    next.boundaryActive = true;
    next.prevReason = reason;
    actions.push({
      id: `boundary-${gamePk}`,
      category: "boundary",
      stage: "under_review",
      title: "Boundary call under review",
      detail: reason || "Home run boundary review",
      meta: metaFromLinescore(linescore),
    });
  } else if (!isBoundary && next.boundaryActive) {
    next.boundaryActive = false;
    next.prevReason = null;
    const outcome = findReviewedPlayOutcome(feed);
    const stage = outcome ? (outcome.isOverturned ? "overturned" : "confirmed") : "resolved";
    const detail = outcome
      ? `Review complete (call ${outcome.isOverturned ? "overturned" : "stood"}).`
      : "Review complete.";
    actions.push({
      id: `boundary-${gamePk}`,
      category: "boundary",
      stage,
      title: "Boundary call resolved",
      detail,
      meta: metaFromLinescore(linescore),
    });
  }

  return { actions, baseline: next };
}

// ---- persistence (localStorage with in-memory fallback for tests/SSR) ----

const memoryStore = new Map();
let storageAvailable = true;

function readRaw(key) {
  try {
    if (storageAvailable && typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
    storageAvailable = false;
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function writeRaw(key, value) {
  try {
    if (storageAvailable && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    storageAvailable = false;
  }
  memoryStore.set(key, value);
}

function removeRaw(key) {
  try {
    if (storageAvailable && typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
      return;
    }
  } catch {
    storageAvailable = false;
  }
  memoryStore.delete(key);
}

/**
 * Per-game log store. Loads any previously captured entries + baseline from
 * localStorage, applies new detections on each ingest, and persists them so the
 * log survives a page refresh and can be reopened later.
 */
export function createLogStore(gamePk) {
  let entries = Object.create(null);
  let baseline = emptyBaseline();
  let loaded = false;

  function load() {
    const raw = readRaw(STORAGE_PREFIX + gamePk);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          entries =
            parsed.entries && typeof parsed.entries === "object" ? parsed.entries : Object.create(null);
          baseline = cloneBaseline(parsed.baseline);
        }
      } catch {
        // Corrupt record: start fresh rather than crash.
        entries = Object.create(null);
        baseline = emptyBaseline();
      }
    }
    loaded = true;
  }

  function persist() {
    writeRaw(
      STORAGE_PREFIX + gamePk,
      JSON.stringify({ version: STORAGE_VERSION, gamePk, entries, baseline }),
    );
  }

  function applyAction(action, fetchedAt) {
    const existing = entries[action.id];
    const stage = { at: fetchedAt, stage: action.stage, detail: action.detail || "" };
    if (existing) {
      existing.stages.push(stage);
      if (action.title) existing.title = action.title;
      if (action.meta) Object.assign(existing.meta, action.meta);
    } else {
      entries[action.id] = {
        id: action.id,
        category: action.category,
        title: action.title || "",
        stages: [stage],
        meta: action.meta || {},
        gamePk,
      };
    }
  }

  function ingest(feed, fetchedAt) {
    if (!loaded) load();
    const { actions, baseline: next } = computeEvents(feed, baseline, { gamePk, fetchedAt });
    baseline = next;
    for (const action of actions) applyAction(action, fetchedAt);
    if (actions.length) persist();
    return actions.length;
  }

  function getEntries() {
    const arr = Object.values(entries);
    arr.sort((a, b) =>
      String(a.stages[0]?.at || "").localeCompare(String(b.stages[0]?.at || "")),
    );
    return arr;
  }

  function clear() {
    entries = Object.create(null);
    baseline = emptyBaseline();
    removeRaw(STORAGE_PREFIX + gamePk);
  }

  return {
    gamePk,
    load,
    ingest,
    getEntries,
    clear,
    count: () => Object.keys(entries).length,
  };
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return String(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function metaLine(meta) {
  if (!meta) return "";
  const parts = [];
  if (meta.half && meta.inning != null) parts.push(`${esc(meta.half)} ${esc(meta.inning)}`);
  if (meta.awayScore != null && meta.homeScore != null)
    parts.push(`Score ${esc(meta.awayScore)}-${esc(meta.homeScore)}`);
  if (meta.batter) parts.push(esc(meta.batter));
  if (meta.pitcher) parts.push(`vs ${esc(meta.pitcher)}`);
  return parts.join(" · ");
}

/**
 * Render the entry list as an HTML string for the Event log tab. Safe to inject:
 * all dynamic text is HTML-escaped via esc().
 */
export function renderEventLogHTML(entries) {
  if (!entries || !entries.length) {
    return `<div class="log-intro">
        <h3>Event log</h3>
        <p>No transient events captured yet for this game. Open a game while it is
        <strong>Live</strong> and the site will record score changes, official-scorer
        ruling changes, scoring-pending rulings, and boundary calls here as they occur
        — then keep them so you can read them after the fact.</p>
        <p class="log-note">Entries are stored only in this browser (localStorage),
        keyed to the game. They are a record of what this page observed; they are not
        part of MLB’s official payload.</p>
      </div>`;
  }

  const cards = entries
    .map((entry) => {
      const category = CATEGORY_LABELS[entry.category] || entry.category;
      const stages = entry.stages
        .map((stage) => {
          const label = STAGE_LABELS[stage.stage] || stage.stage;
          return `<li class="log-stage">
            <span class="log-stage-label">${esc(label)}</span>
            <span class="log-stage-time">${esc(fmtTime(stage.at))}</span>
            ${stage.detail ? `<span class="log-stage-detail">${esc(stage.detail)}</span>` : ""}
          </li>`;
        })
        .join("");
      const meta = metaLine(entry.meta);
      return `<article class="log-entry" data-category="${esc(entry.category)}">
        <div class="log-entry-head">
          <span class="log-chip log-chip-${esc(entry.category)}">${esc(category)}</span>
          <h4 class="log-title">${esc(entry.title)}</h4>
        </div>
        ${meta ? `<p class="log-meta">${meta}</p>` : ""}
        <ul class="log-timeline">${stages}</ul>
      </article>`;
    })
    .join("");

  return `<div class="log-intro">
      <div class="log-intro-row">
        <h3>Event log</h3>
        <button id="log-clear" class="button button-secondary" type="button">Clear log</button>
      </div>
      <p class="log-note">Captured in this browser as events were observed during live
      viewing. Stored locally per game; not part of MLB’s official payload.</p>
    </div>
    <div class="log-list">${cards}</div>`;
}
