"""Deterministic text and NDJSON projections of an official MLB game feed."""

from __future__ import annotations

import json
from typing import Any, Iterable

MISSING = "—"


def value(item: Any, fallback: str = MISSING) -> str:
    return fallback if item is None or item == "" else str(item)


def dig(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
    return default if current is None else current


def person_name(person: dict[str, Any] | None) -> str:
    person = person or {}
    return person.get("fullName") or person.get("name") or "Not supplied by MLB"


def team_name(team: dict[str, Any] | None) -> str:
    team = team or {}
    return team.get("name") or team.get("teamName") or "Not supplied by MLB"


def abbreviation(team: dict[str, Any] | None) -> str:
    team = team or {}
    return team.get("abbreviation") or str(team.get("fileCode", MISSING)).upper()


def ordinal(number: Any) -> str:
    try:
        integer = int(number)
    except (TypeError, ValueError):
        return value(number)
    if 11 <= integer % 100 <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(integer % 10, "th")
    return f"{integer}{suffix}"


def status_label(status: dict[str, Any] | None) -> str:
    status = status or {}
    return status.get("detailedState") or status.get("abstractGameState") or "Not supplied by MLB"


def _line_score(feed: dict[str, Any]) -> list[str]:
    linescore = dig(feed, "liveData", "linescore", default={})
    teams = dig(feed, "gameData", "teams", default={})
    innings = linescore.get("innings", [])
    width = max(4, len(abbreviation(teams.get("away"))), len(abbreviation(teams.get("home"))))
    cell = lambda item: value(item).rjust(3)  # noqa: E731
    output = [
        " ".ljust(width) + " " + " ".join(cell(item.get("num")) for item in innings) + "   R   H   E LOB"
    ]
    for side in ("away", "home"):
        totals = dig(linescore, "teams", side, default={})
        runs = " ".join(cell(dig(inning, side, "runs")) for inning in innings)
        output.append(
            f"{abbreviation(teams.get(side)).ljust(width)} {runs}"
            f" {cell(totals.get('runs'))} {cell(totals.get('hits'))}"
            f" {cell(totals.get('errors'))} {cell(totals.get('leftOnBase'))}"
        )
    return output


def _event_line(event: dict[str, Any], index: int) -> str:
    details = event.get("details", {})
    count = event.get("count", {})
    pitch = event.get("pitchData", {})
    hit = event.get("hitData", {})
    fields: list[tuple[str, Any]] = [
        ("index", event.get("index")),
        ("type", event.get("type")),
        ("pitch", "yes" if event.get("isPitch") else "no"),
        ("description", details.get("description") or details.get("event")),
        ("code", dig(details, "call", "code") or details.get("code")),
        ("count", f"{count.get('balls', 0)}-{count.get('strikes', 0)}"),
        ("outs", count.get("outs", 0)),
    ]
    optional: list[tuple[str, Any]] = [
        ("pitch_type", dig(details, "type", "description")),
        ("start_mph", pitch.get("startSpeed")),
        ("end_mph", pitch.get("endSpeed")),
        ("zone", pitch.get("zone")),
        ("plate_x", dig(pitch, "coordinates", "pX")),
        ("plate_z", dig(pitch, "coordinates", "pZ")),
        ("spin_rpm", dig(pitch, "breaks", "spinRate")),
        ("exit_mph", hit.get("launchSpeed")),
        ("launch_angle", hit.get("launchAngle")),
        ("distance_ft", hit.get("totalDistance")),
        ("trajectory", hit.get("trajectory")),
        ("hardness", hit.get("hardness")),
        ("play_id", event.get("playId")),
        ("start", event.get("startTime")),
        ("end", event.get("endTime")),
    ]
    fields.extend((key, item) for key, item in optional if item is not None and item != "")
    return f"    EVENT {index + 1:02d} | " + " | ".join(
        f"{key}={value(item)}" for key, item in fields
    )


def _runner_line(runner: dict[str, Any], index: int) -> str:
    movement = runner.get("movement", {})
    details = runner.get("details", {})
    fields = [
        ("name", person_name(details.get("runner"))),
        ("id", dig(details, "runner", "id")),
        ("start", movement.get("start")),
        ("end", movement.get("end")),
        ("out", "yes" if movement.get("isOut") else "no"),
        ("rbi", "yes" if details.get("rbi") else "no"),
        (
            "earned",
            MISSING if "earned" not in details else "yes" if details.get("earned") else "no",
        ),
    ]
    return f"    RUNNER {index + 1:02d} | " + " | ".join(
        f"{key}={value(item)}" for key, item in fields
    )


def _plays(feed: dict[str, Any]) -> list[str]:
    plays = dig(feed, "liveData", "plays", "allPlays", default=[])
    if not plays:
        return ["No play-by-play supplied by MLB for this game status."]
    output: list[str] = []
    last_half: tuple[Any, Any] | None = None
    for index, play in enumerate(plays):
        about = play.get("about", {})
        result = play.get("result", {})
        matchup = play.get("matchup", {})
        half = (about.get("halfInning"), about.get("inning"))
        if half != last_half:
            output.extend(
                ["", f"-- {value(half[0], 'inning').upper()} {ordinal(half[1])} --"]
            )
            last_half = half
        output.append(
            f"[{index:03d}] {value(result.get('event'))} | "
            f"{value(result.get('awayScore'), '0')}-{value(result.get('homeScore'), '0')} | "
            f"{value(result.get('description'))}"
        )
        output.append(
            "    "
            f"batter={person_name(matchup.get('batter'))} ({value(dig(matchup, 'batter', 'id'))}) | "
            f"pitcher={person_name(matchup.get('pitcher'))} ({value(dig(matchup, 'pitcher', 'id'))}) | "
            f"scoring={'yes' if about.get('isScoringPlay') else 'no'} | "
            f"complete={'yes' if about.get('isComplete') else 'no'} | "
            f"start={value(about.get('startTime'))} | end={value(about.get('endTime'))}"
        )
        output.extend(
            _event_line(event, event_index)
            for event_index, event in enumerate(play.get("playEvents", []))
        )
        output.extend(
            _runner_line(runner, runner_index)
            for runner_index, runner in enumerate(play.get("runners", []))
        )
    return output[1:] if output and output[0] == "" else output


def _player_rows(
    team: dict[str, Any], ids: Iterable[Any], kind: str, columns: list[tuple[str, str]]
) -> list[str]:
    output = ["name | id | " + " | ".join(label for label, _ in columns)]
    seen: set[str] = set()
    for raw_id in ids:
        player_id = str(raw_id)
        if player_id in seen:
            continue
        seen.add(player_id)
        player = team.get("players", {}).get(f"ID{player_id}", {})
        stats = dig(player, "stats", kind, default={})
        output.append(
            " | ".join(
                [person_name(player.get("person")), player_id]
                + [value(stats.get(key)) for _, key in columns]
            )
        )
    if not seen:
        output.append(f"No {kind} lines supplied by MLB.")
    return output


def _box_score(feed: dict[str, Any]) -> list[str]:
    box = dig(feed, "liveData", "boxscore", default={})
    game_teams = dig(feed, "gameData", "teams", default={})
    batting = [
        ("AB", "atBats"), ("R", "runs"), ("H", "hits"), ("2B", "doubles"),
        ("3B", "triples"), ("HR", "homeRuns"), ("RBI", "rbi"),
        ("BB", "baseOnBalls"), ("SO", "strikeOuts"), ("SB", "stolenBases"),
        ("AVG", "avg"), ("OBP", "obp"), ("SLG", "slg"),
    ]
    pitching = [
        ("IP", "inningsPitched"), ("H", "hits"), ("R", "runs"),
        ("ER", "earnedRuns"), ("BB", "baseOnBalls"), ("SO", "strikeOuts"),
        ("HR", "homeRuns"), ("P", "numberOfPitches"), ("S", "strikes"),
        ("ERA", "era"),
    ]
    output: list[str] = []
    for side in ("away", "home"):
        team = dig(box, "teams", side, default={})
        output.extend(
            [
                "",
                team_name(team.get("team") or game_teams.get(side)).upper(),
                "BATTERS",
                *_player_rows(team, team.get("battingOrder", []), "batting", batting),
                "PITCHERS",
                *_player_rows(team, team.get("pitchers", []), "pitching", pitching),
            ]
        )
    return output[1:] if output else ["No box score supplied by MLB."]


def format_plain_text(
    feed: dict[str, Any], *, source_url: str, fetched_at: str, source_sha256: str
) -> str:
    """Build a searchable report solely from values in an MLB game feed."""
    game = dig(feed, "gameData", "game", default={})
    game_datetime = dig(feed, "gameData", "datetime", default={})
    teams = dig(feed, "gameData", "teams", default={})
    linescore = dig(feed, "liveData", "linescore", default={})
    status = dig(feed, "gameData", "status", default={})
    venue = dig(feed, "gameData", "venue", default={})
    decisions = dig(feed, "liveData", "decisions", default={})
    divider = "=" * 78
    output = [
        "MLB PLAINTEXT PLAY-BY-PLAY",
        divider,
        f"{team_name(teams.get('away'))} at {team_name(teams.get('home'))}",
        f"{value(dig(linescore, 'teams', 'away', 'runs'))} - "
        f"{value(dig(linescore, 'teams', 'home', 'runs'))} | {status_label(status)}",
        "",
        "PROVENANCE",
        f"MLB gamePk: {value(feed.get('gamePk') or game.get('pk'))}",
        f"Official source: {source_url}",
        f"Retrieved UTC: {fetched_at}",
        f"Official response SHA-256: {source_sha256}",
        f"MLB notice: {value(feed.get('copyright'))}",
        "",
        "GAME",
        f"Official date: {value(game_datetime.get('officialDate') or game_datetime.get('originalDate'))}",
        f"Scheduled UTC: {value(game_datetime.get('dateTime'))}",
        f"Type code: {value(game.get('type'))} | Season: {value(game.get('season'))}",
        f"Venue: {value(venue.get('name'))} | Venue ID: {value(venue.get('id'))}",
        f"Status: {status_label(status)} | Status code: {value(status.get('statusCode'))}",
        "",
        "LINE SCORE",
        *_line_score(feed),
        "",
        "DECISIONS",
    ]
    supplied_decisions = False
    for label, key in (("W", "winner"), ("L", "loser"), ("SV", "save")):
        if decisions.get(key):
            supplied_decisions = True
            output.append(f"{label}  {person_name(decisions[key])}")
    if not supplied_decisions:
        output.append("No decisions supplied by MLB.")
    output.extend(
        [
            "",
            "PLAY-BY-PLAY",
            divider,
            *_plays(feed),
            "",
            "BOX SCORE",
            divider,
            *_box_score(feed),
            "",
            divider,
            "END OF HUMAN-READABLE REPORT",
            "The raw JSON copy retains every field exactly as MLB supplied it.",
            "",
        ]
    )
    return "\n".join(output)


def format_events_ndjson(
    feed: dict[str, Any], *, source_url: str, fetched_at: str, source_sha256: str
) -> str:
    """Build one metadata, play, or event record per line."""
    game_pk = feed.get("gamePk")
    records: list[dict[str, Any]] = [
        {
            "recordType": "metadata",
            "gamePk": game_pk,
            "sourceUrl": source_url,
            "fetchedAt": fetched_at,
            "sourceSha256": source_sha256,
            "copyright": feed.get("copyright"),
            "gameData": feed.get("gameData"),
        }
    ]
    for play_index, play in enumerate(dig(feed, "liveData", "plays", "allPlays", default=[])):
        records.append(
            {
                "recordType": "play",
                "gamePk": game_pk,
                "playIndex": play_index,
                **{key: play.get(key) for key in ("result", "about", "count", "matchup", "runners")},
            }
        )
        for event_index, event in enumerate(play.get("playEvents", [])):
            records.append(
                {
                    "recordType": "event",
                    "gamePk": game_pk,
                    "playIndex": play_index,
                    "eventIndex": event_index,
                    **event,
                }
            )
    return "".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n" for record in records)
