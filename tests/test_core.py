"""Unit tests use an explicitly synthetic schema fixture; no fixture is MLB game data."""

from __future__ import annotations

import gzip
import hashlib
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from mlb_pbp.archive import verify_archive
from mlb_pbp.client import MLBClient, MLBDataError, month_windows, qualifying_games
from mlb_pbp.formatter import format_events_ndjson, format_plain_text


# TEST FIXTURE ONLY. These values do not represent a real game and are never
# included in the website or archives produced by the application.
SYNTHETIC_FEED = {
    "copyright": "TEST FIXTURE — NOT MLB DATA",
    "gamePk": 999,
    "gameData": {
        "game": {"pk": 999, "type": "R", "season": "TEST"},
        "datetime": {"officialDate": "2099-01-01", "dateTime": "2099-01-01T00:00:00Z"},
        "status": {"detailedState": "Test complete", "statusCode": "T"},
        "venue": {"id": 0, "name": "Test venue"},
        "teams": {
            "away": {"name": "Test Away", "abbreviation": "TST"},
            "home": {"name": "Test Home", "abbreviation": "TST"},
        },
    },
    "liveData": {
        "linescore": {
            "innings": [{"num": 1, "away": {"runs": 1}, "home": {"runs": 0}}],
            "teams": {
                "away": {"runs": 1, "hits": 1, "errors": 0, "leftOnBase": 0},
                "home": {"runs": 0, "hits": 0, "errors": 0, "leftOnBase": 0},
            },
        },
        "plays": {
            "allPlays": [
                {
                    "result": {
                        "event": "Test Event",
                        "description": "Synthetic description",
                        "awayScore": 1,
                        "homeScore": 0,
                    },
                    "about": {
                        "halfInning": "top",
                        "inning": 1,
                        "isScoringPlay": True,
                        "isComplete": True,
                    },
                    "matchup": {
                        "batter": {"id": 1, "fullName": "Test Batter"},
                        "pitcher": {"id": 2, "fullName": "Test Pitcher"},
                    },
                    "playEvents": [
                        {
                            "index": 0,
                            "isPitch": True,
                            "type": "pitch",
                            "details": {
                                "description": "Synthetic pitch",
                                "call": {"code": "X"},
                                "type": {"description": "Test pitch type"},
                            },
                            "count": {"balls": 0, "strikes": 0, "outs": 0},
                            "pitchData": {"startSpeed": 1.0, "zone": 1},
                        }
                    ],
                    "runners": [],
                }
            ]
        },
        "boxscore": {"teams": {"away": {}, "home": {}}},
    },
}


class ClientUtilitiesTests(unittest.TestCase):
    def test_month_windows_are_inclusive(self) -> None:
        self.assertEqual(
            list(month_windows(date(2020, 1, 30), date(2020, 3, 2))),
            [
                (date(2020, 1, 30), date(2020, 1, 31)),
                (date(2020, 2, 1), date(2020, 2, 29)),
                (date(2020, 3, 1), date(2020, 3, 2)),
            ],
        )

    def test_only_regular_and_postseason_types_qualify(self) -> None:
        schedule = {
            "dates": [
                {
                    "games": [
                        {"gamePk": 3, "gameType": "S", "officialDate": "2020-01-01"},
                        {"gamePk": 2, "gameType": "W", "officialDate": "2020-10-01"},
                        {"gamePk": 1, "gameType": "R", "officialDate": "2020-04-01"},
                    ]
                }
            ]
        }
        self.assertEqual([game["gamePk"] for game in qualifying_games(schedule)], [1, 2])

    def test_non_mlb_absolute_url_is_rejected(self) -> None:
        with self.assertRaises(MLBDataError):
            MLBClient._url("https://example.com/not-mlb")


class FormatterTests(unittest.TestCase):
    def test_plain_text_contains_provenance_and_source_values(self) -> None:
        report = format_plain_text(
            SYNTHETIC_FEED,
            source_url="https://statsapi.mlb.com/test-only",
            fetched_at="2099-01-01T00:00:01Z",
            source_sha256="abc123",
        )
        self.assertIn("TEST FIXTURE — NOT MLB DATA", report)
        self.assertIn("Synthetic description", report)
        self.assertIn("start_mph=1.0", report)
        self.assertIn("Official response SHA-256: abc123", report)

    def test_ndjson_has_metadata_play_and_event(self) -> None:
        content = format_events_ndjson(
            SYNTHETIC_FEED,
            source_url="https://statsapi.mlb.com/test-only",
            fetched_at="2099-01-01T00:00:01Z",
            source_sha256="abc123",
        )
        records = [json.loads(line) for line in content.splitlines()]
        self.assertEqual([item["recordType"] for item in records], ["metadata", "play", "event"])
        self.assertEqual(records[-1]["playIndex"], 0)
        self.assertEqual(records[-1]["eventIndex"], 0)


class VerificationTests(unittest.TestCase):
    def test_verifies_stored_and_source_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = b'{"test":true}'
            stored = gzip.compress(source, mtime=0)
            raw_path = root / "raw" / "2099" / "01" / "01" / "999.json.gz"
            raw_path.parent.mkdir(parents=True)
            raw_path.write_bytes(stored)
            record = {
                "recordType": "game",
                "gamePk": 999,
                "officialDate": "2099-01-01",
                "sourceSha256": hashlib.sha256(source).hexdigest(),
                "files": {
                    "raw": {
                        "path": raw_path.relative_to(root).as_posix(),
                        "sha256": hashlib.sha256(stored).hexdigest(),
                        "contentEncoding": "gzip",
                    }
                },
            }
            (root / "manifest.ndjson").write_text(json.dumps(record) + "\n", encoding="utf-8")
            checked, problems = verify_archive(root)
            self.assertEqual(checked, 1)
            self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
