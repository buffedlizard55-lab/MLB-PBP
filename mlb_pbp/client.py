"""Strict, standard-library client for MLB's Stats API."""

from __future__ import annotations

import hashlib
import json
import random
import ssl
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

API_ORIGIN = "https://statsapi.mlb.com"
GAME_TYPES = ("R", "F", "D", "L", "W")
GAME_TYPES_PARAM = ",".join(GAME_TYPES)
USER_AGENT = "MLB-PBP/1.0 (+https://github.com/buffedlizard55-lab/MLB-PBP)"


class MLBDataError(RuntimeError):
    """Raised when official data cannot be fetched or fails provenance checks."""


@dataclass(frozen=True)
class FetchResult:
    data: dict[str, Any]
    raw: bytes
    url: str
    fetched_at: str
    sha256: str


class MLBClient:
    """Fetch only verified JSON responses from the official MLB API host."""

    def __init__(
        self,
        *,
        timeout: float = 45.0,
        retries: int = 5,
        request_delay: float = 0.15,
        user_agent: str = USER_AGENT,
    ) -> None:
        self.timeout = timeout
        self.retries = retries
        self.request_delay = request_delay
        self.user_agent = user_agent
        self._rate_lock = threading.Lock()
        self._last_request = 0.0
        self._ssl_context = ssl.create_default_context()

    def _throttle(self) -> None:
        with self._rate_lock:
            elapsed = time.monotonic() - self._last_request
            if elapsed < self.request_delay:
                time.sleep(self.request_delay - elapsed)
            self._last_request = time.monotonic()

    @staticmethod
    def _url(path: str, params: dict[str, Any] | None = None) -> str:
        url = urljoin(f"{API_ORIGIN}/", path.lstrip("/"))
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "statsapi.mlb.com":
            raise MLBDataError(f"Refused non-official source URL: {url}")
        query = urlencode(
            {key: value for key, value in (params or {}).items() if value is not None},
            doseq=True,
        )
        return f"{url}?{query}" if query else url

    @staticmethod
    def _retry_after(error: HTTPError) -> float | None:
        header = error.headers.get("Retry-After") if error.headers else None
        if not header:
            return None
        try:
            return max(0.0, float(header))
        except ValueError:
            try:
                return max(0.0, (parsedate_to_datetime(header) - datetime.now(timezone.utc)).total_seconds())
            except (TypeError, ValueError):
                return None

    def get(self, path: str, params: dict[str, Any] | None = None) -> FetchResult:
        url = self._url(path, params)
        last_error: BaseException | None = None
        for attempt in range(self.retries + 1):
            self._throttle()
            request = Request(
                url,
                headers={"Accept": "application/json", "User-Agent": self.user_agent},
                method="GET",
            )
            try:
                with urlopen(request, timeout=self.timeout, context=self._ssl_context) as response:
                    raw = response.read()
                    status = response.status
                if status != 200:
                    raise MLBDataError(f"MLB returned HTTP {status} for {url}")
                try:
                    data = json.loads(raw)
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise MLBDataError(f"MLB returned invalid JSON for {url}") from error
                notice = data.get("copyright")
                if not isinstance(notice, str) or "MLB Advanced Media" not in notice:
                    raise MLBDataError(
                        f"Response lacked MLB Advanced Media provenance notice: {url}"
                    )
                return FetchResult(
                    data=data,
                    raw=raw,
                    url=url,
                    fetched_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    sha256=hashlib.sha256(raw).hexdigest(),
                )
            except HTTPError as error:
                last_error = error
                retryable = error.code in {408, 425, 429, 500, 502, 503, 504}
                if not retryable or attempt >= self.retries:
                    raise MLBDataError(f"MLB returned HTTP {error.code} for {url}") from error
                delay = self._retry_after(error)
            except (URLError, TimeoutError, ConnectionError, ssl.SSLError) as error:
                last_error = error
                if attempt >= self.retries:
                    break
                delay = None
            if delay is None:
                delay = min(30.0, (2**attempt) + random.uniform(0.0, 0.5))
            time.sleep(delay)
        raise MLBDataError(f"Unable to reach official MLB API at {url}: {last_error}") from last_error

    def schedule(self, start: date, end: date) -> FetchResult:
        if end < start:
            raise ValueError("Schedule end date precedes start date")
        return self.get(
            "/api/v1/schedule",
            {
                "sportId": 1,
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "gameTypes": GAME_TYPES_PARAM,
                "hydrate": "linescore",
            },
        )

    def game(self, game_pk: int | str) -> FetchResult:
        text = str(game_pk)
        if not text.isdigit():
            raise ValueError(f"Invalid MLB gamePk: {game_pk!r}")
        result = self.get(f"/api/v1.1/game/{text}/feed/live")
        if int(result.data.get("gamePk", -1)) != int(text):
            raise MLBDataError(
                f"Requested gamePk {text}, but MLB returned {result.data.get('gamePk')!r}"
            )
        return result


def month_windows(start: date, end: date) -> Iterator[tuple[date, date]]:
    """Yield inclusive calendar-month windows clipped to start/end."""
    cursor = start
    while cursor <= end:
        if cursor.month == 12:
            next_month = date(cursor.year + 1, 1, 1)
        else:
            next_month = date(cursor.year, cursor.month + 1, 1)
        window_end = min(end, next_month - timedelta(days=1))
        yield cursor, window_end
        cursor = window_end + timedelta(days=1)


def qualifying_games(schedule: dict[str, Any]) -> list[dict[str, Any]]:
    """Return unique MLB regular/postseason games in official-date order."""
    games: dict[int, dict[str, Any]] = {}
    for date_entry in schedule.get("dates", []):
        for game in date_entry.get("games", []):
            game_pk = game.get("gamePk")
            if isinstance(game_pk, int) and game.get("gameType") in GAME_TYPES:
                games[game_pk] = game
    return sorted(
        games.values(),
        key=lambda game: (game.get("officialDate", ""), game.get("gameDate", ""), game["gamePk"]),
    )
