const value = (input, fallback = "—") => input === undefined || input === null || input === "" ? fallback : String(input);
const playerName = (person) => person?.fullName || person?.name || "Unknown in source";
const teamName = (team) => team?.name || team?.teamName || "Unknown in source";

export function teamAbbreviation(team) {
  return team?.abbreviation || team?.fileCode?.toUpperCase() || team?.teamName || "—";
}

export function ordinalInning(inning) {
  const number = Number(inning);
  if (!Number.isFinite(number)) return value(inning);
  const mod100 = number % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
  return `${number}${suffix}`;
}

export function statusLabel(status) {
  return status?.detailedState || status?.abstractGameState || "Status unavailable";
}

export function eventCode(event) {
  return event?.details?.call?.code || event?.details?.code || "";
}

export function pitchSequence(play) {
  return (play?.playEvents || [])
    .filter((event) => event.isPitch)
    .map(eventCode)
    .filter(Boolean)
    .join("");
}

function scoreAt(play) {
  return `${value(play?.result?.awayScore, "0")}-${value(play?.result?.homeScore, "0")}`;
}

function lineScoreText(feed) {
  const gameData = feed?.gameData || {};
  const linescore = feed?.liveData?.linescore || {};
  const away = gameData?.teams?.away || {};
  const home = gameData?.teams?.home || {};
  const innings = linescore?.innings || [];
  const labels = innings.map((inning) => String(inning.num));
  const width = Math.max(3, teamAbbreviation(away).length, teamAbbreviation(home).length);
  const cell = (input) => value(input).padStart(3);
  const header = " ".repeat(width) + " " + labels.map(cell).join(" ") + "   R   H   E   LOB";
  const row = (side, team) => {
    const totals = linescore?.teams?.[side] || {};
    const inningRuns = innings.map((inning) => cell(inning?.[side]?.runs));
    return teamAbbreviation(team).padEnd(width) + " " + inningRuns.join(" ")
      + ` ${cell(totals.runs)} ${cell(totals.hits)} ${cell(totals.errors)} ${cell(totals.leftOnBase)}`;
  };
  return [header, row("away", away), row("home", home)].join("\n");
}

function decisionsText(feed) {
  const decisions = feed?.liveData?.decisions || {};
  const parts = [];
  if (decisions.winner) parts.push(`W  ${playerName(decisions.winner)}`);
  if (decisions.loser) parts.push(`L  ${playerName(decisions.loser)}`);
  if (decisions.save) parts.push(`SV ${playerName(decisions.save)}`);
  return parts.length ? parts.join("\n") : "No decisions supplied by MLB.";
}

function eventText(event, eventIndex) {
  const details = event?.details || {};
  const count = event?.count || {};
  const pitch = event?.pitchData || {};
  const hit = event?.hitData || {};
  const fields = [
    `    EVENT ${String(eventIndex + 1).padStart(2, "0")}`,
    `index=${value(event?.index)}`,
    `type=${value(event?.type)}`,
    `pitch=${event?.isPitch ? "yes" : "no"}`,
    `description=${value(details.description || details.event)}`,
    `code=${value(eventCode(event))}`,
    `count=${value(count.balls, "0")}-${value(count.strikes, "0")}`,
    `outs=${value(count.outs, "0")}`,
  ];
  if (details.type?.description) fields.push(`pitch_type=${details.type.description}`);
  if (pitch.startSpeed !== undefined) fields.push(`start_mph=${pitch.startSpeed}`);
  if (pitch.endSpeed !== undefined) fields.push(`end_mph=${pitch.endSpeed}`);
  if (pitch.zone !== undefined) fields.push(`zone=${pitch.zone}`);
  if (pitch.coordinates?.pX !== undefined) fields.push(`plate_x=${pitch.coordinates.pX}`);
  if (pitch.coordinates?.pZ !== undefined) fields.push(`plate_z=${pitch.coordinates.pZ}`);
  if (pitch.breaks?.spinRate !== undefined) fields.push(`spin_rpm=${pitch.breaks.spinRate}`);
  if (hit.launchSpeed !== undefined) fields.push(`exit_mph=${hit.launchSpeed}`);
  if (hit.launchAngle !== undefined) fields.push(`launch_angle=${hit.launchAngle}`);
  if (hit.totalDistance !== undefined) fields.push(`distance_ft=${hit.totalDistance}`);
  if (hit.trajectory) fields.push(`trajectory=${hit.trajectory}`);
  if (hit.hardness) fields.push(`hardness=${hit.hardness}`);
  if (event?.playId) fields.push(`play_id=${event.playId}`);
  if (event?.startTime) fields.push(`start=${event.startTime}`);
  if (event?.endTime) fields.push(`end=${event.endTime}`);
  return fields.join(" | ");
}

function runnerText(runner, runnerIndex) {
  const movement = runner?.movement || {};
  const details = runner?.details || {};
  return [
    `    RUNNER ${String(runnerIndex + 1).padStart(2, "0")}`,
    `name=${playerName(details.runner)}`,
    `id=${value(details.runner?.id)}`,
    `start=${value(movement.start)}`,
    `end=${value(movement.end)}`,
    `out=${movement.isOut ? "yes" : "no"}`,
    `rbi=${details.rbi ? "yes" : "no"}`,
    `earned=${details.earned === undefined ? "—" : details.earned ? "yes" : "no"}`,
  ].join(" | ");
}

function playsText(feed) {
  const plays = feed?.liveData?.plays?.allPlays || [];
  if (!plays.length) return "No play-by-play supplied by MLB for this game status.";
  const output = [];
  let lastHalf = "";
  for (const [index, play] of plays.entries()) {
    const half = `${play?.about?.halfInning || ""}-${play?.about?.inning || ""}`;
    if (half !== lastHalf) {
      output.push("", `-- ${(play?.about?.halfInning || "inning").toUpperCase()} ${ordinalInning(play?.about?.inning)} --`);
      lastHalf = half;
    }
    output.push(
      `[${String(index).padStart(3, "0")}] ${value(play?.result?.event)} | ${scoreAt(play)} | ${value(play?.result?.description)}`,
      `    batter=${playerName(play?.matchup?.batter)} (${value(play?.matchup?.batter?.id)}) | pitcher=${playerName(play?.matchup?.pitcher)} (${value(play?.matchup?.pitcher?.id)}) | scoring=${play?.about?.isScoringPlay ? "yes" : "no"} | complete=${play?.about?.isComplete ? "yes" : "no"} | start=${value(play?.about?.startTime)} | end=${value(play?.about?.endTime)}`,
    );
    (play?.playEvents || []).forEach((event, eventIndex) => output.push(eventText(event, eventIndex)));
    (play?.runners || []).forEach((runner, runnerIndex) => output.push(runnerText(runner, runnerIndex)));
  }
  return output.join("\n").trimStart();
}

function boxScoreText(feed) {
  const box = feed?.liveData?.boxscore || {};
  const gameTeams = feed?.gameData?.teams || {};
  const output = [];
  for (const side of ["away", "home"]) {
    const team = box?.teams?.[side] || {};
    output.push(`\n${teamName(team?.team || gameTeams?.[side]).toUpperCase()}`);
    output.push("BATTERS");
    output.push("name | id | pos | AB | R | H | 2B | 3B | HR | RBI | BB | SO | SB | AVG | OBP | SLG");
    const seen = new Set();
    for (const rawId of team?.battingOrder || []) {
      const id = String(rawId);
      if (seen.has(id)) continue;
      seen.add(id);
      const player = team?.players?.[`ID${id}`] || {};
      const stats = player?.stats?.batting || {};
      output.push([
        playerName(player.person), id, player?.position?.abbreviation,
        stats.atBats, stats.runs, stats.hits, stats.doubles, stats.triples,
        stats.homeRuns, stats.rbi, stats.baseOnBalls, stats.strikeOuts,
        stats.stolenBases, stats.avg, stats.obp, stats.slg,
      ].map((item) => value(item)).join(" | "));
    }
    output.push("PITCHERS");
    output.push("name | id | IP | H | R | ER | BB | SO | HR | pitches | strikes | ERA");
    for (const rawId of team?.pitchers || []) {
      const id = String(rawId);
      const player = team?.players?.[`ID${id}`] || {};
      const stats = player?.stats?.pitching || {};
      output.push([
        playerName(player.person), id, stats.inningsPitched, stats.hits,
        stats.runs, stats.earnedRuns, stats.baseOnBalls, stats.strikeOuts,
        stats.homeRuns, stats.numberOfPitches, stats.strikes, stats.era,
      ].map((item) => value(item)).join(" | "));
    }
  }
  return output.join("\n").trim();
}

export function formatPlainText(feed, { sourceUrl, fetchedAt } = {}) {
  const game = feed?.gameData?.game || {};
  const datetime = feed?.gameData?.datetime || {};
  const teams = feed?.gameData?.teams || {};
  const linescore = feed?.liveData?.linescore || {};
  const venue = feed?.gameData?.venue || {};
  const status = feed?.gameData?.status || {};
  const awayRuns = linescore?.teams?.away?.runs;
  const homeRuns = linescore?.teams?.home?.runs;
  const divider = "=".repeat(78);

  return [
    "MLB PLAINTEXT PLAY-BY-PLAY",
    divider,
    `${teamName(teams.away)} at ${teamName(teams.home)}`,
    `${value(awayRuns)} - ${value(homeRuns)} | ${statusLabel(status)}`,
    "",
    "PROVENANCE",
    `MLB gamePk: ${value(feed?.gamePk || game.pk)}`,
    `Official source: ${value(sourceUrl || (feed?.link ? `https://statsapi.mlb.com${feed.link}` : undefined))}`,
    `Retrieved UTC: ${value(fetchedAt)}`,
    `MLB notice: ${value(feed?.copyright)}`,
    "",
    "GAME",
    `Official date: ${value(datetime.officialDate || datetime.originalDate)}`,
    `Scheduled UTC: ${value(datetime.dateTime)}`,
    `Type code: ${value(game.type)} | Season: ${value(game.season)}`,
    `Venue: ${value(venue.name)} | Venue ID: ${value(venue.id)}`,
    `Status: ${statusLabel(status)} | Status code: ${value(status.statusCode)}`,
    "",
    "LINE SCORE",
    lineScoreText(feed),
    "",
    "DECISIONS",
    decisionsText(feed),
    "",
    "PLAY-BY-PLAY",
    divider,
    playsText(feed),
    "",
    "BOX SCORE",
    divider,
    boxScoreText(feed),
    "",
    divider,
    "END OF HUMAN-READABLE REPORT",
    "Download the raw JSON to retain every field exactly as MLB supplied it.",
    "",
  ].join("\n");
}

export function formatEventsNdjson(feed, { sourceUrl, fetchedAt } = {}) {
  const gamePk = feed?.gamePk;
  const records = [{
    recordType: "metadata",
    gamePk,
    sourceUrl,
    fetchedAt,
    copyright: feed?.copyright,
    gameData: feed?.gameData,
  }];
  for (const [playIndex, play] of (feed?.liveData?.plays?.allPlays || []).entries()) {
    records.push({
      recordType: "play",
      gamePk,
      playIndex,
      result: play.result,
      about: play.about,
      count: play.count,
      matchup: play.matchup,
      runners: play.runners,
    });
    for (const [eventIndex, event] of (play?.playEvents || []).entries()) {
      records.push({ recordType: "event", gamePk, playIndex, eventIndex, ...event });
    }
  }
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}
