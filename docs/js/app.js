import { API_ORIGIN, OfficialDataError, getGame, getSchedule } from "./api.js";
import {
  eventCode,
  formatEventsNdjson,
  formatPlainText,
  ordinalInning,
  pitchSequence,
  statusLabel,
  teamAbbreviation,
} from "./format.js";
import {
  createLogStore,
  renderEventLogHTML,
} from "./eventlog.js";

const elements = {
  form: document.querySelector("#date-form"),
  date: document.querySelector("#game-date"),
  previous: document.querySelector("#previous-day"),
  next: document.querySelector("#next-day"),
  today: document.querySelector("#today"),
  schedule: document.querySelector("#schedule"),
  detail: document.querySelector("#game-detail"),
  notice: document.querySelector("#notice"),
  loading: document.querySelector("#loading-template"),
};

const state = {
  date: "",
  gamePk: "",
  schedule: null,
  feed: null,
  raw: null,
  source: null,
  scheduleController: null,
  gameController: null,
  refreshTimer: null,
};

// Per-game transient-event log. (Re)created to match the selected gamePk inside
// renderGame so every entry is namespaced and persisted for later retrieval.
let eventLog = null;

const escapeHtml = (input) => String(input ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const e = escapeHtml;
const safe = (input, fallback = "—") => input === undefined || input === null || input === "" ? fallback : input;
const personName = (person) => person?.fullName || person?.name || "Not supplied";
const teamName = (team) => team?.name || team?.teamName || "Not supplied";

function localISODate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function validDate(input) {
  return /^\d{4}-\d{2}-\d{2}$/.test(input || "") && !Number.isNaN(Date.parse(`${input}T00:00:00Z`));
}

function shiftDate(input, amount) {
  const date = new Date(`${input}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function displayDate(input) {
  const date = new Date(`${input}T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function displayTime(input) {
  if (!input) return "Time not supplied";
  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) return String(input);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function formatNumber(input) {
  return input === undefined || input === null ? "—" : new Intl.NumberFormat().format(input);
}

function setLoading(container) {
  container.replaceChildren(elements.loading.content.cloneNode(true));
  container.setAttribute("aria-busy", "true");
}

function showError(error) {
  const sourceLink = error?.url
    ? `<a href="${e(error.url)}" rel="noreferrer">Open the official request</a>`
    : "";
  elements.notice.innerHTML = `<strong>Official data could not be loaded.</strong><span>${e(error?.message || "Unknown error")}</span> ${sourceLink}`;
  elements.notice.hidden = false;
}

function clearError() {
  elements.notice.hidden = true;
  elements.notice.replaceChildren();
}

function updateUrl({ date = state.date, gamePk = "" }, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("date", date);
  if (gamePk) url.searchParams.set("game", gamePk);
  else url.searchParams.delete("game");
  history[replace ? "replaceState" : "pushState"]({ date, gamePk }, "", url);
}

function gameStatusClass(game) {
  return game?.status?.abstractGameState === "Live" ? "live" : "";
}

function renderSchedule(result) {
  state.schedule = result;
  const games = result?.data?.dates?.flatMap((date) => date.games || []) || [];
  const selected = String(state.gamePk);
  if (!games.length) {
    elements.schedule.innerHTML = `
      <div class="empty-state">
        <h2>No qualifying games returned</h2>
        <p>MLB returned no regular-season or postseason games for ${e(displayDate(state.date))}. Spring training and exhibition games are intentionally excluded.</p>
        <a href="${e(result.url)}" rel="noreferrer">Inspect MLB's response</a>
      </div>`;
    elements.schedule.setAttribute("aria-busy", "false");
    return;
  }

  const cards = games.map((game) => {
    const away = game?.teams?.away || {};
    const home = game?.teams?.home || {};
    const id = String(game?.gamePk || "");
    const url = new URL(window.location.href);
    url.searchParams.set("date", state.date);
    url.searchParams.set("game", id);
    const record = (entry) => entry?.leagueRecord
      ? `${safe(entry.leagueRecord.wins, "0")}-${safe(entry.leagueRecord.losses, "0")}`
      : "record unavailable";
    return `
      <a class="game-card ${id === selected ? "selected" : ""}" href="${e(url.href)}" data-game-pk="${e(id)}">
        <div class="game-status">
          <span class="${gameStatusClass(game)}">${e(statusLabel(game.status))}</span>
          <span>${e(displayTime(game.gameDate))}</span>
        </div>
        <div class="team-row">
          <span>${e(teamName(away.team))} <small>${e(record(away))}</small></span>
          <span class="team-score">${e(safe(away.score))}</span>
        </div>
        <div class="team-row">
          <span>${e(teamName(home.team))} <small>${e(record(home))}</small></span>
          <span class="team-score">${e(safe(home.score))}</span>
        </div>
        <div class="game-meta">${e(game.venue?.name || game.seriesDescription || `MLB gamePk ${id}`)}</div>
      </a>`;
  }).join("");

  elements.schedule.innerHTML = `
    <div class="schedule-heading">
      <h2>${e(displayDate(state.date))}</h2>
      <span>${games.length} ${games.length === 1 ? "game" : "games"} · official MLB schedule</span>
    </div>
    <div class="game-grid">${cards}</div>`;
  elements.schedule.setAttribute("aria-busy", "false");
  elements.schedule.querySelectorAll("[data-game-pk]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectGame(link.dataset.gamePk);
    });
  });
}

function lineScoreTable(feed) {
  const linescore = feed?.liveData?.linescore || {};
  const teams = feed?.gameData?.teams || {};
  const innings = linescore.innings || [];
  const headers = innings.map((inning) => `<th scope="col">${e(inning.num)}</th>`).join("");
  const row = (side) => {
    const team = teams[side] || {};
    const totals = linescore?.teams?.[side] || {};
    const runs = innings.map((inning) => `<td>${e(safe(inning?.[side]?.runs))}</td>`).join("");
    return `<tr>
      <th scope="row">${e(teamAbbreviation(team))}</th>${runs}
      <td><strong>${e(safe(totals.runs))}</strong></td>
      <td>${e(safe(totals.hits))}</td><td>${e(safe(totals.errors))}</td><td>${e(safe(totals.leftOnBase))}</td>
    </tr>`;
  };
  return `<div class="table-scroll"><table aria-label="Line score">
    <thead><tr><th scope="col">Team</th>${headers}<th scope="col">R</th><th scope="col">H</th><th scope="col">E</th><th scope="col">LOB</th></tr></thead>
    <tbody>${row("away")}${row("home")}</tbody>
  </table></div>`;
}

function decisions(feed) {
  const data = feed?.liveData?.decisions || {};
  const items = [];
  if (data.winner) items.push(`<span><strong>W</strong> ${e(personName(data.winner))}</span>`);
  if (data.loser) items.push(`<span><strong>L</strong> ${e(personName(data.loser))}</span>`);
  if (data.save) items.push(`<span><strong>SV</strong> ${e(personName(data.save))}</span>`);
  return items.length ? `<div class="decision-row">${items.join("")}</div>` : "";
}

function eventLine(event, index) {
  const detail = event?.details || {};
  const pitch = event?.pitchData || {};
  const hit = event?.hitData || {};
  const bits = [
    `${String(index + 1).padStart(2, "0")}.`,
    detail.description || detail.event || event.type,
  ];
  if (event.isPitch && detail.type?.description) bits.push(detail.type.description);
  if (pitch.startSpeed !== undefined) bits.push(`${pitch.startSpeed} mph`);
  if (pitch.zone !== undefined) bits.push(`zone ${pitch.zone}`);
  if (hit.launchSpeed !== undefined) bits.push(`${hit.launchSpeed} mph exit`);
  if (hit.launchAngle !== undefined) bits.push(`${hit.launchAngle}°`);
  if (hit.totalDistance !== undefined) bits.push(`${hit.totalDistance} ft`);
  const count = event?.count;
  if (count) bits.push(`count ${safe(count.balls, 0)}-${safe(count.strikes, 0)}, ${safe(count.outs, 0)} out`);
  return `<li>${e(bits.filter(Boolean).join(" · "))}</li>`;
}

function playHtml(play, index) {
  const about = play?.about || {};
  const result = play?.result || {};
  const sequence = pitchSequence(play);
  const eventItems = (play?.playEvents || []).map(eventLine).join("");
  const searchText = [
    result.event, result.description, personName(play?.matchup?.batter),
    personName(play?.matchup?.pitcher), ...(play?.playEvents || []).map((event) => event?.details?.description),
  ].filter(Boolean).join(" ").toLowerCase();
  return `<article class="play" data-scoring="${about.isScoringPlay ? "true" : "false"}" data-search="${e(searchText)}">
    <div class="play-marker">${about.isTopInning ? "TOP" : "BOT"} ${e(safe(about.inning))}</div>
    <div>
      <p class="play-description ${about.isScoringPlay ? "scoring" : ""}">${e(result.description || result.event || "Description not supplied by MLB")}</p>
      <div class="play-subline">
        <span>${e(personName(play?.matchup?.batter))} vs ${e(personName(play?.matchup?.pitcher))}</span>
        ${sequence ? `<span class="pitch-sequence" title="MLB pitch result codes">${e(sequence)}</span>` : ""}
        <span>${e(safe(play?.count?.outs, 0))} out</span>
      </div>
      ${eventItems ? `<details><summary>Official event detail (${play.playEvents.length})</summary><ol class="event-list">${eventItems}</ol></details>` : ""}
    </div>
    <div class="play-score">${e(safe(result.awayScore, 0))}–${e(safe(result.homeScore, 0))}</div>
  </article>`;
}

function playsHtml(feed) {
  const plays = feed?.liveData?.plays?.allPlays || [];
  if (!plays.length) return `<div class="empty-state"><p>MLB has not supplied play-by-play for this game status.</p></div>`;
  const groups = new Map();
  plays.forEach((play, index) => {
    const inning = play?.about?.inning || "unknown";
    if (!groups.has(inning)) groups.set(inning, []);
    groups.get(inning).push({ play, index });
  });
  return [...groups.entries()].map(([inning, entries]) => {
    const scoring = entries.filter(({ play }) => play?.about?.isScoringPlay).length;
    return `<section class="inning" id="inning-${e(inning)}">
      <div class="inning-heading"><h3>${e(ordinalInning(inning))} inning</h3><span>${entries.length} plays · ${scoring} scoring</span></div>
      ${entries.map(({ play, index }) => playHtml(play, index)).join("")}
    </section>`;
  }).join("");
}

const battingColumns = [
  ["AB", "atBats"], ["R", "runs"], ["H", "hits"], ["2B", "doubles"], ["3B", "triples"],
  ["HR", "homeRuns"], ["RBI", "rbi"], ["BB", "baseOnBalls"], ["SO", "strikeOuts"], ["AVG", "avg"],
];
const pitchingColumns = [
  ["IP", "inningsPitched"], ["H", "hits"], ["R", "runs"], ["ER", "earnedRuns"], ["BB", "baseOnBalls"],
  ["SO", "strikeOuts"], ["HR", "homeRuns"], ["P", "numberOfPitches"], ["S", "strikes"], ["ERA", "era"],
];

function statTable(team, kind, columns, ids) {
  const uniqueIds = [...new Set(ids || [])];
  const rows = uniqueIds.map((rawId) => {
    const id = String(rawId);
    const player = team?.players?.[`ID${id}`] || {};
    const stats = player?.stats?.[kind] || {};
    const position = player?.position?.abbreviation ? `, ${player.position.abbreviation}` : "";
    return `<tr><th scope="row">${e(personName(player.person))}${e(position)}</th>${columns.map(([, key]) => `<td>${e(safe(stats[key]))}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="table-scroll"><table>
    <thead><tr><th scope="col">Player</th>${columns.map(([label]) => `<th scope="col">${e(label)}</th>`).join("")}</tr></thead>
    <tbody>${rows || `<tr><td colspan="${columns.length + 1}">No ${e(kind)} lines supplied.</td></tr>`}</tbody>
  </table></div>`;
}

function boxScoreHtml(feed) {
  const box = feed?.liveData?.boxscore || {};
  const teams = feed?.gameData?.teams || {};
  return ["away", "home"].map((side) => {
    const team = box?.teams?.[side] || {};
    return `<section class="box-team">
      <h3>${e(teamName(team.team || teams[side]))}</h3>
      <h4>Batting</h4>
      ${statTable(team, "batting", battingColumns, team.battingOrder)}
      <h4>Pitching</h4>
      ${statTable(team, "pitching", pitchingColumns, team.pitchers)}
    </section>`;
  }).join("");
}

function gameFacts(feed) {
  const info = feed?.gameData?.gameInfo || {};
  const weather = feed?.gameData?.weather || {};
  const facts = [];
  if (info.attendance !== undefined) facts.push(`Attendance ${formatNumber(info.attendance)}`);
  if (info.gameDurationMinutes !== undefined) facts.push(`Duration ${Math.floor(info.gameDurationMinutes / 60)}h ${info.gameDurationMinutes % 60}m`);
  if (weather.temp !== undefined) facts.push(`${weather.temp}°F`);
  if (weather.condition) facts.push(weather.condition);
  if (weather.wind) facts.push(weather.wind);
  return facts;
}

function renderGame(result) {
  state.feed = result.data;
  state.raw = result.raw;
  state.source = { sourceUrl: result.url, fetchedAt: result.fetchedAt };
  const feed = result.data;
  const game = feed?.gameData?.game || {};
  const datetime = feed?.gameData?.datetime || {};
  const status = feed?.gameData?.status || {};
  const teams = feed?.gameData?.teams || {};
  const linescore = feed?.liveData?.linescore || {};
  const venue = feed?.gameData?.venue || {};
  const awayScore = safe(linescore?.teams?.away?.runs, "—");
  const homeScore = safe(linescore?.teams?.home?.runs, "—");
  const facts = gameFacts(feed);
  const rawLink = result.url;

  elements.detail.innerHTML = `
    <div class="game-hero">
      <div class="game-hero-top">
        <span>MLB gamePk ${e(feed.gamePk)} · type ${e(safe(game.type))}</span>
        <span>${e(statusLabel(status))} · fetched ${e(displayTime(result.fetchedAt))}</span>
      </div>
      <div class="matchup">
        <div class="matchup-team">
          <span class="team-abbr">${e(teamAbbreviation(teams.away))} · AWAY</span>
          <strong class="team-name">${e(teamName(teams.away))}</strong>
          <span class="team-record">${e(teams.away?.record?.wins ?? "—")}–${e(teams.away?.record?.losses ?? "—")}</span>
        </div>
        <div class="final-score" aria-label="Score ${e(awayScore)} to ${e(homeScore)}">${e(awayScore)}–${e(homeScore)}</div>
        <div class="matchup-team">
          <span class="team-abbr">${e(teamAbbreviation(teams.home))} · HOME</span>
          <strong class="team-name">${e(teamName(teams.home))}</strong>
          <span class="team-record">${e(teams.home?.record?.wins ?? "—")}–${e(teams.home?.record?.losses ?? "—")}</span>
        </div>
      </div>
      <div class="game-facts">
        <span>${e(displayTime(datetime.dateTime))}</span>
        <span>${e(venue.name || "Venue not supplied")}</span>
        ${facts.map((fact) => `<span>${e(fact)}</span>`).join("")}
      </div>
    </div>
    <div class="detail-shell">
      <div class="tab-bar" role="tablist" aria-label="Game views">
        <button class="tab-button" role="tab" aria-selected="true" aria-controls="summary-panel" id="summary-tab">Summary</button>
        <button class="tab-button" role="tab" aria-selected="false" aria-controls="plays-panel" id="plays-tab">Play-by-play</button>
        <button class="tab-button" role="tab" aria-selected="false" aria-controls="box-panel" id="box-tab">Box score</button>
        <button class="tab-button" role="tab" aria-selected="false" aria-controls="data-panel" id="data-tab">Plain text &amp; raw data</button>
        <button class="tab-button" role="tab" aria-selected="false" aria-controls="log-panel" id="log-tab">Event log</button>
      </div>
      <section class="tab-panel" id="summary-panel" role="tabpanel" aria-labelledby="summary-tab">
        <div class="section-title"><h2>Line score</h2><span class="eyebrow">As supplied by MLB</span></div>
        ${lineScoreTable(feed)}
        ${decisions(feed)}
      </section>
      <section class="tab-panel" id="plays-panel" role="tabpanel" aria-labelledby="plays-tab" hidden>
        <div class="section-title"><h2>Play-by-play</h2><span class="eyebrow">${e((feed?.liveData?.plays?.allPlays || []).length)} plays</span></div>
        <div class="play-tools">
          <label class="sr-only" for="play-search">Search plays</label>
          <input id="play-search" type="search" placeholder="Search player, result, or description…">
          <button id="scoring-filter" class="button filter-button" type="button" aria-pressed="false">Scoring only</button>
        </div>
        <div id="play-list">${playsHtml(feed)}</div>
        <p id="play-no-results" class="no-results" hidden>No matching plays.</p>
      </section>
      <section class="tab-panel" id="box-panel" role="tabpanel" aria-labelledby="box-tab" hidden>
        <div class="section-title"><h2>Box score</h2><span class="eyebrow">Official game totals</span></div>
        ${boxScoreHtml(feed)}
      </section>
      <section class="tab-panel" id="data-panel" role="tabpanel" aria-labelledby="data-tab" hidden>
        <div class="section-title"><h2>Use the data</h2><span class="eyebrow">No transformed values in raw JSON</span></div>
        <div class="download-grid">
          <article class="download-card"><h3>Readable text</h3><p>A searchable game report with plays, pitch events, runners, linescore, and box score.</p><button class="button button-primary" id="download-text" type="button">Download .txt</button></article>
          <article class="download-card"><h3>Raw official JSON</h3><p>The complete response, preserving every field exactly as MLB returned it.</p><button class="button button-primary" id="download-json" type="button">Download .json</button></article>
          <article class="download-card"><h3>Events NDJSON</h3><p>One metadata, play, or pitch/action event object per line for streaming parsers.</p><button class="button button-primary" id="download-ndjson" type="button">Download .ndjson</button></article>
        </div>
        <dl class="source-details">
          <dt>Official endpoint</dt><dd><a href="${e(rawLink)}" rel="noreferrer">${e(rawLink)}</a></dd>
          <dt>Retrieved</dt><dd>${e(result.fetchedAt)}</dd>
          <dt>MLB response notice</dt><dd>${e(feed.copyright)}</dd>
        </dl>
      </section>
      <section class="tab-panel" id="log-panel" role="tabpanel" aria-labelledby="log-tab" hidden></section>
    </div>`;

  elements.detail.hidden = false;
  elements.detail.setAttribute("aria-busy", "false");
  bindGameControls();
  selectScheduleCard();
  scheduleLiveRefresh(status, feed?.metaData?.wait);

  // Capture transient official-game events (score changes, scoring-pending
  // rulings, scoring-ruling changes, boundary calls) observed in this feed and
  // render the retrievable log. The store is scoped to the game so entries
  // survive a refresh and can be reopened later. Ingestion happens only while
  // the game is Live: we record what this page actually watched unfold, and we
  // do not synthesize misleading single-stage (resolved-only) entries for a game
  // that was never opened while Live. The persisted log is still rendered on any
  // later reopen, Live or Final.
  if (state.gamePk) {
    if (!eventLog || eventLog.gamePk !== state.gamePk) {
      eventLog = createLogStore(state.gamePk);
      eventLog.load();
    }
    if (status?.abstractGameState === "Live") {
      eventLog.ingest(result.data, result.fetchedAt);
    }
    renderEventLogInto();
  }
}

function renderEventLogInto() {
  const panel = elements.detail.querySelector("#log-panel");
  if (!panel) return;
  panel.innerHTML = renderEventLogHTML(eventLog ? eventLog.getEntries() : []);
  const tab = elements.detail.querySelector("#log-tab");
  if (tab && eventLog) {
    const count = eventLog.count();
    tab.textContent = count > 0 ? `Event log (${count})` : "Event log";
  }
  panel.querySelector("#log-clear")?.addEventListener("click", () => {
    eventLog?.clear();
    renderEventLogInto();
  });
}

function selectScheduleCard() {
  elements.schedule.querySelectorAll(".game-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.gamePk === String(state.gamePk));
  });
}

function bindGameControls() {
  const tabs = [...elements.detail.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let target = index;
      if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = tabs.length - 1;
      tabs[target].focus();
      activateTab(tabs[target]);
    });
  });

  const search = elements.detail.querySelector("#play-search");
  const scoring = elements.detail.querySelector("#scoring-filter");
  const applyFilter = () => {
    const query = search.value.trim().toLowerCase();
    const scoringOnly = scoring.getAttribute("aria-pressed") === "true";
    let visible = 0;
    elements.detail.querySelectorAll(".play").forEach((play) => {
      const show = (!query || play.dataset.search.includes(query)) && (!scoringOnly || play.dataset.scoring === "true");
      play.hidden = !show;
      if (show) visible += 1;
    });
    elements.detail.querySelectorAll(".inning").forEach((inning) => {
      inning.hidden = !inning.querySelector(".play:not([hidden])");
    });
    elements.detail.querySelector("#play-no-results").hidden = visible > 0;
  };
  search?.addEventListener("input", applyFilter);
  scoring?.addEventListener("click", () => {
    scoring.setAttribute("aria-pressed", scoring.getAttribute("aria-pressed") !== "true" ? "true" : "false");
    applyFilter();
  });

  elements.detail.querySelector("#download-text")?.addEventListener("click", () => {
    download(`${state.gamePk}.txt`, formatPlainText(state.feed, state.source), "text/plain;charset=utf-8");
  });
  elements.detail.querySelector("#download-json")?.addEventListener("click", () => {
    download(`${state.gamePk}.json`, state.raw, "application/json;charset=utf-8");
  });
  elements.detail.querySelector("#download-ndjson")?.addEventListener("click", () => {
    download(`${state.gamePk}.events.ndjson`, formatEventsNdjson(state.feed, state.source), "application/x-ndjson;charset=utf-8");
  });
}

function activateTab(tab) {
  const tabs = elements.detail.querySelectorAll('[role="tab"]');
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    const panel = elements.detail.querySelector(`#${item.getAttribute("aria-controls")}`);
    if (panel) panel.hidden = !active;
  });
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function scheduleLiveRefresh(status, waitSeconds) {
  clearTimeout(state.refreshTimer);
  if (status?.abstractGameState !== "Live") return;
  const delay = Math.max(10, Math.min(Number(waitSeconds) || 15, 60)) * 1_000;
  state.refreshTimer = setTimeout(() => loadGame(state.gamePk, { quiet: true }), delay);
}

async function loadSchedule(date) {
  state.scheduleController?.abort();
  state.scheduleController = new AbortController();
  state.date = date;
  elements.date.value = date;
  clearError();
  setLoading(elements.schedule);
  try {
    const result = await getSchedule(date, { signal: state.scheduleController.signal });
    renderSchedule(result);
  } catch (error) {
    if (error?.name === "AbortError" || error?.cause?.name === "AbortError") return;
    elements.schedule.replaceChildren();
    elements.schedule.setAttribute("aria-busy", "false");
    showError(error);
  }
}

async function loadGame(gamePk, { quiet = false, scroll = false } = {}) {
  state.gameController?.abort();
  state.gameController = new AbortController();
  state.gamePk = String(gamePk);
  clearTimeout(state.refreshTimer);
  clearError();
  if (!quiet) {
    elements.detail.hidden = false;
    setLoading(elements.detail);
  }
  try {
    const result = await getGame(gamePk, { signal: state.gameController.signal });
    renderGame(result);
    if (scroll) elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error?.name === "AbortError" || error?.cause?.name === "AbortError") return;
    if (!quiet) {
      elements.detail.hidden = true;
      elements.detail.replaceChildren();
    }
    showError(error);
  }
}

function selectGame(gamePk) {
  state.gamePk = String(gamePk);
  updateUrl({ date: state.date, gamePk: state.gamePk });
  selectScheduleCard();
  loadGame(state.gamePk, { scroll: true });
}

async function navigateDate(date, { replace = false } = {}) {
  if (!validDate(date)) return;
  clearTimeout(state.refreshTimer);
  state.gamePk = "";
  state.feed = null;
  state.raw = null;
  state.source = null;
  eventLog = null;
  elements.detail.hidden = true;
  elements.detail.replaceChildren();
  updateUrl({ date, gamePk: "" }, replace);
  await loadSchedule(date);
}

function bindPageControls() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    navigateDate(elements.date.value);
  });
  elements.previous.addEventListener("click", () => navigateDate(shiftDate(state.date, -1)));
  elements.next.addEventListener("click", () => navigateDate(shiftDate(state.date, 1)));
  elements.today.addEventListener("click", () => navigateDate(localISODate()));
  window.addEventListener("popstate", () => initializeFromUrl({ replace: true }));
}

async function initializeFromUrl({ replace = false } = {}) {
  const params = new URLSearchParams(window.location.search);
  const date = validDate(params.get("date")) ? params.get("date") : localISODate();
  const gamePk = /^\d+$/.test(params.get("game") || "") ? params.get("game") : "";
  state.gamePk = gamePk;
  updateUrl({ date, gamePk }, replace || !params.get("date"));
  await loadSchedule(date);
  if (gamePk) await loadGame(gamePk);
}

bindPageControls();
initializeFromUrl({ replace: true });

// Exported only for browser-console inspection by data users.
window.MLBPlaintext = Object.freeze({ API_ORIGIN, getSchedule, getGame });
