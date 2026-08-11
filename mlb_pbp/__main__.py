"""Command-line interface for MLB Plaintext."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Sequence

from . import __version__
from .archive import ArchiveOptions, atomic_write, build_archive, verify_archive
from .client import MLBClient, MLBDataError
from .formatter import format_events_ndjson, format_plain_text


def iso_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"expected YYYY-MM-DD, got {text!r}") from error


def formats(text: str) -> frozenset[str]:
    selected = frozenset(part.strip() for part in text.split(",") if part.strip())
    allowed = {"text", "raw", "events"}
    invalid = selected - allowed
    if not selected or invalid:
        raise argparse.ArgumentTypeError(
            f"formats must be a comma-separated subset of text,raw,events; invalid: {','.join(sorted(invalid))}"
        )
    return selected


def add_client_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--timeout", type=float, default=45.0, help="request timeout in seconds (default: 45)")
    parser.add_argument("--retries", type=int, default=5, help="retry count for transient errors (default: 5)")
    parser.add_argument(
        "--request-delay",
        type=float,
        default=0.15,
        help="minimum delay between requests in seconds (default: 0.15)",
    )


def client_from(args: argparse.Namespace) -> MLBClient:
    return MLBClient(
        timeout=args.timeout,
        retries=max(0, args.retries),
        request_delay=max(0.0, args.request_delay),
    )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        prog="python -m mlb_pbp",
        description="Retrieve verified MLB regular-season and postseason data as plain text.",
    )
    root.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    commands = root.add_subparsers(dest="command", required=True)

    schedule = commands.add_parser("schedule", help="print an official MLB schedule response")
    schedule.add_argument("--start", type=iso_date, help="first date (defaults to --date)")
    schedule.add_argument("--end", type=iso_date, help="last date (defaults to start)")
    schedule.add_argument("--date", type=iso_date, help="one-date shorthand")
    schedule.add_argument("--output", type=Path, default=Path("-"), help="output JSON path or - for stdout")
    add_client_arguments(schedule)

    game = commands.add_parser("game", help="retrieve one official MLB game feed")
    game.add_argument("game_pk", help="MLB gamePk identifier")
    game.add_argument(
        "--format",
        choices=("text", "raw", "events"),
        default="text",
        help="text report, exact raw JSON, or events NDJSON (default: text)",
    )
    game.add_argument("--output", type=Path, default=Path("-"), help="output path or - for stdout")
    add_client_arguments(game)

    archive = commands.add_parser("archive", help="build a resumable multi-game archive")
    archive.add_argument("--start", type=iso_date, default=date(2014, 1, 1))
    archive.add_argument("--end", type=iso_date, default=date.today())
    archive.add_argument("--output", type=Path, default=Path("archive"))
    archive.add_argument(
        "--formats",
        type=formats,
        default=frozenset({"text", "raw"}),
        help="comma-separated text,raw,events (default: text,raw)",
    )
    archive.add_argument("--workers", type=int, default=2, help="parallel game requests (default: 2)")
    archive.add_argument("--refresh", action="store_true", help="refetch files already in the manifest")
    archive.add_argument(
        "--raw-uncompressed",
        action="store_true",
        help="store exact .json instead of exact .json.gz source responses",
    )
    add_client_arguments(archive)

    verify = commands.add_parser("verify", help="verify an archive against its SHA-256 manifest")
    verify.add_argument("archive", type=Path, help="archive directory")
    return root


def write_output(path: Path, content: bytes) -> None:
    if str(path) == "-":
        sys.stdout.buffer.write(content)
    else:
        atomic_write(path, content)


def run_schedule(args: argparse.Namespace) -> int:
    start = args.date or args.start
    if start is None:
        raise ValueError("schedule requires --date or --start")
    end = args.date or args.end or start
    if end < start:
        raise ValueError("--end cannot precede --start")
    result = client_from(args).schedule(start, end)
    write_output(args.output, result.raw)
    print(
        f"verified MLB response: {result.url} sha256={result.sha256}",
        file=sys.stderr,
    )
    return 0


def run_game(args: argparse.Namespace) -> int:
    result = client_from(args).game(args.game_pk)
    metadata = {
        "source_url": result.url,
        "fetched_at": result.fetched_at,
        "source_sha256": result.sha256,
    }
    if args.format == "raw":
        content = result.raw
    elif args.format == "events":
        content = format_events_ndjson(result.data, **metadata).encode("utf-8")
    else:
        content = format_plain_text(result.data, **metadata).encode("utf-8")
    write_output(args.output, content)
    print(
        f"verified MLB gamePk {args.game_pk}: {result.url} sha256={result.sha256}",
        file=sys.stderr,
    )
    return 0


def run_archive(args: argparse.Namespace) -> int:
    if args.end < args.start:
        raise ValueError("--end cannot precede --start")
    options = ArchiveOptions(
        formats=args.formats,
        gzip_raw=not args.raw_uncompressed,
        workers=max(1, args.workers),
        refresh=args.refresh,
    )
    successful, failed = build_archive(
        client_from(args), args.output.resolve(), args.start, args.end, options
    )
    print(json.dumps({"complete": successful, "failed": failed, "archive": str(args.output)}))
    return 1 if failed else 0


def run_verify(args: argparse.Namespace) -> int:
    checked, problems = verify_archive(args.archive.resolve())
    for problem in problems:
        print(f"ERROR: {problem}", file=sys.stderr)
    print(json.dumps({"filesChecked": checked, "problems": len(problems)}))
    return 1 if problems else 0


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "schedule":
            return run_schedule(args)
        if args.command == "game":
            return run_game(args)
        if args.command == "archive":
            return run_archive(args)
        if args.command == "verify":
            return run_verify(args)
    except (MLBDataError, OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
