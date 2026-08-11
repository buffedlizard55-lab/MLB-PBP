"""Resumable on-disk archive builder for official MLB game feeds."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from .client import FetchResult, MLBClient, MLBDataError, month_windows, qualifying_games
from .formatter import format_events_ndjson, format_plain_text

SCHEMA_VERSION = 1


@dataclass(frozen=True)
class ArchiveOptions:
    formats: frozenset[str] = frozenset({"text", "raw"})
    gzip_raw: bool = True
    workers: int = 2
    refresh: bool = False


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_bytes(content)
    os.replace(temporary, path)


def relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def load_manifest(path: Path) -> dict[int, dict[str, Any]]:
    records: dict[int, dict[str, Any]] = {}
    if not path.exists():
        return records
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
                if record.get("recordType") == "game":
                    records[int(record["gamePk"])] = record
            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
                raise MLBDataError(f"Invalid archive manifest at line {line_number}: {path}") from error
    return records


def load_schedule_manifest(path: Path) -> dict[tuple[str, str], dict[str, Any]]:
    records: dict[tuple[str, str], dict[str, Any]] = {}
    if not path.exists():
        return records
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
                if record.get("recordType") == "schedule":
                    key = (str(record["startDate"]), str(record["endDate"]))
                    records[key] = record
            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
                raise MLBDataError(f"Invalid schedule manifest at line {line_number}: {path}") from error
    return records


def write_manifest(path: Path, records: Iterable[dict[str, Any]]) -> None:
    ordered = sorted(
        records,
        key=lambda item: (
            item.get("officialDate") or item.get("startDate", ""),
            item.get("gamePk", 0),
        ),
    )
    content = "".join(
        json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for record in ordered
    ).encode("utf-8")
    atomic_write(path, content)


def _game_paths(root: Path, official_date: str, game_pk: int, options: ArchiveOptions) -> dict[str, Path]:
    try:
        year, month, day = official_date.split("-")
    except ValueError as error:
        raise MLBDataError(f"Invalid officialDate from MLB for game {game_pk}: {official_date!r}") from error
    relative_dir = Path(year, month, day)
    paths: dict[str, Path] = {}
    if "text" in options.formats:
        paths["text"] = root / "games" / relative_dir / f"{game_pk}.txt"
    if "raw" in options.formats:
        suffix = ".json.gz" if options.gzip_raw else ".json"
        paths["raw"] = root / "raw" / relative_dir / f"{game_pk}{suffix}"
    if "events" in options.formats:
        paths["events"] = root / "events" / relative_dir / f"{game_pk}.ndjson"
    return paths


def _existing_complete(record: dict[str, Any] | None, root: Path, paths: dict[str, Path]) -> bool:
    if not record or not paths:
        return False
    return all(path.exists() and path.is_file() for path in paths.values())


def _team_manifest(entry: dict[str, Any], side: str) -> dict[str, Any]:
    team = entry.get("teams", {}).get(side, {}).get("team", {})
    return {"id": team.get("id"), "name": team.get("name")}


def archive_one(
    client: MLBClient,
    root: Path,
    schedule_game: dict[str, Any],
    options: ArchiveOptions,
) -> dict[str, Any]:
    game_pk = int(schedule_game["gamePk"])
    official_date = schedule_game.get("officialDate")
    if not isinstance(official_date, str):
        raise MLBDataError(f"MLB schedule omitted officialDate for gamePk {game_pk}")
    paths = _game_paths(root, official_date, game_pk, options)
    result = client.game(game_pk)
    metadata = {
        "source_url": result.url,
        "fetched_at": result.fetched_at,
        "source_sha256": result.sha256,
    }
    files: dict[str, dict[str, Any]] = {}

    if "text" in paths:
        content = format_plain_text(result.data, **metadata).encode("utf-8")
        atomic_write(paths["text"], content)
        files["text"] = {
            "path": relative(paths["text"], root),
            "sha256": sha256_bytes(content),
            "mediaType": "text/plain",
        }

    if "raw" in paths:
        if options.gzip_raw:
            content = gzip.compress(result.raw, compresslevel=9, mtime=0)
            encoding = "gzip"
        else:
            content = result.raw
            encoding = "identity"
        atomic_write(paths["raw"], content)
        files["raw"] = {
            "path": relative(paths["raw"], root),
            "sha256": sha256_bytes(content),
            "sourceSha256": result.sha256,
            "mediaType": "application/json",
            "contentEncoding": encoding,
        }

    if "events" in paths:
        content = format_events_ndjson(result.data, **metadata).encode("utf-8")
        atomic_write(paths["events"], content)
        files["events"] = {
            "path": relative(paths["events"], root),
            "sha256": sha256_bytes(content),
            "mediaType": "application/x-ndjson",
        }

    return {
        "schemaVersion": SCHEMA_VERSION,
        "recordType": "game",
        "gamePk": game_pk,
        "officialDate": official_date,
        "season": schedule_game.get("season"),
        "gameType": schedule_game.get("gameType"),
        "gameDate": schedule_game.get("gameDate"),
        "status": schedule_game.get("status"),
        "away": _team_manifest(schedule_game, "away"),
        "home": _team_manifest(schedule_game, "home"),
        "sourceUrl": result.url,
        "fetchedAt": result.fetched_at,
        "sourceSha256": result.sha256,
        "copyright": result.data.get("copyright"),
        "files": files,
    }


def save_schedule_source(root: Path, start: date, end: date, result: FetchResult) -> dict[str, Any]:
    filename = f"{start.isoformat()}_{end.isoformat()}.json.gz"
    path = root / "schedules" / filename
    stored = gzip.compress(result.raw, compresslevel=9, mtime=0)
    atomic_write(path, stored)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "recordType": "schedule",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "sourceUrl": result.url,
        "fetchedAt": result.fetched_at,
        "sourceSha256": result.sha256,
        "copyright": result.data.get("copyright"),
        "file": {
            "path": relative(path, root),
            "sha256": sha256_bytes(stored),
            "sourceSha256": result.sha256,
            "mediaType": "application/json",
            "contentEncoding": "gzip",
        },
    }


def discover_games(
    client: MLBClient, root: Path, start: date, end: date
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    games: dict[int, dict[str, Any]] = {}
    schedules: list[dict[str, Any]] = []
    for window_start, window_end in month_windows(start, end):
        print(f"schedule {window_start} through {window_end}", file=sys.stderr)
        result = client.schedule(window_start, window_end)
        schedules.append(save_schedule_source(root, window_start, window_end, result))
        for game in qualifying_games(result.data):
            games[int(game["gamePk"])] = game
    ordered = sorted(
        games.values(),
        key=lambda game: (game.get("officialDate", ""), game.get("gameDate", ""), game["gamePk"]),
    )
    return ordered, schedules


def build_archive(
    client: MLBClient,
    root: Path,
    start: date,
    end: date,
    options: ArchiveOptions,
) -> tuple[int, int]:
    """Build/update an archive, returning (successful_or_skipped, failed)."""
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "manifest.ndjson"
    existing = load_manifest(manifest_path)
    schedule_manifest_path = root / "schedules" / "manifest.ndjson"
    existing_schedules = load_schedule_manifest(schedule_manifest_path)
    games, schedule_records = discover_games(client, root, start, end)
    for record in schedule_records:
        existing_schedules[(record["startDate"], record["endDate"])] = record
    write_manifest(schedule_manifest_path, existing_schedules.values())
    print(f"MLB schedule returned {len(games)} qualifying games", file=sys.stderr)

    pending: list[dict[str, Any]] = []
    skipped = 0
    for game in games:
        game_pk = int(game["gamePk"])
        official_date = game.get("officialDate", "")
        paths = _game_paths(root, official_date, game_pk, options)
        if not options.refresh and _existing_complete(existing.get(game_pk), root, paths):
            skipped += 1
        else:
            pending.append(game)

    print(f"{skipped} already complete; {len(pending)} to fetch", file=sys.stderr)
    failures: list[dict[str, Any]] = []
    completed = 0
    with ThreadPoolExecutor(max_workers=max(1, options.workers)) as executor:
        futures = {
            executor.submit(archive_one, client, root, game, options): game
            for game in pending
        }
        for future in as_completed(futures):
            game = futures[future]
            game_pk = int(game["gamePk"])
            try:
                record = future.result()
                existing[game_pk] = record
                completed += 1
                print(
                    f"[{completed + skipped}/{len(games)}] gamePk {game_pk} {record['officialDate']}",
                    file=sys.stderr,
                )
            except Exception as error:  # continue the archive, then report every failed game
                failures.append(
                    {
                        "schemaVersion": SCHEMA_VERSION,
                        "recordType": "error",
                        "gamePk": game_pk,
                        "officialDate": game.get("officialDate"),
                        "error": str(error),
                    }
                )
                print(f"ERROR gamePk {game_pk}: {error}", file=sys.stderr)

    write_manifest(manifest_path, existing.values())
    error_path = root / "errors.ndjson"
    if failures:
        content = "".join(
            json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in failures
        ).encode("utf-8")
        atomic_write(error_path, content)
    elif error_path.exists():
        error_path.unlink()
    return skipped + completed, len(failures)


def verify_archive(root: Path) -> tuple[int, list[str]]:
    """Verify every manifest file and uncompressed official-response hash."""
    game_records = load_manifest(root / "manifest.ndjson")
    schedule_records = load_schedule_manifest(root / "schedules" / "manifest.ndjson")
    checked = 0
    problems: list[str] = []

    def check_file(
        owner: str,
        label: str,
        metadata: dict[str, Any],
        source_sha256: str | None = None,
    ) -> None:
        nonlocal checked
        path = root / metadata["path"]
        if not path.is_file():
            problems.append(f"{owner} {label}: missing {metadata['path']}")
            return
        content = path.read_bytes()
        actual = sha256_bytes(content)
        if actual != metadata.get("sha256"):
            problems.append(
                f"{owner} {label}: file SHA-256 {actual} != {metadata.get('sha256')}"
            )
            return
        if source_sha256 is not None:
            try:
                source = (
                    gzip.decompress(content)
                    if metadata.get("contentEncoding") == "gzip"
                    else content
                )
            except gzip.BadGzipFile:
                problems.append(f"{owner} {label}: invalid gzip stream")
                return
            source_hash = sha256_bytes(source)
            if source_hash != source_sha256:
                problems.append(
                    f"{owner} {label}: source SHA-256 {source_hash} != {source_sha256}"
                )
                return
        checked += 1

    for game_pk, record in sorted(game_records.items()):
        for label, metadata in record.get("files", {}).items():
            check_file(
                f"gamePk {game_pk}",
                label,
                metadata,
                record.get("sourceSha256") if label == "raw" else None,
            )

    for (start, end), record in sorted(schedule_records.items()):
        metadata = record.get("file")
        if isinstance(metadata, dict):
            check_file(
                f"schedule {start}..{end}",
                "raw",
                metadata,
                record.get("sourceSha256"),
            )
        else:
            problems.append(f"schedule {start}..{end}: missing file metadata")
    return checked, problems
