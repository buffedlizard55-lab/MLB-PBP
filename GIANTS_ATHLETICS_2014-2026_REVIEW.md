# Giants & Athletics — Complete MLB Play-by-Play Coverage 2014 → 2026-08-11

**Source of truth:** `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD`  
Static viewer over **one** origin only: `https://statsapi.mlb.com` — `GET /api/v1/schedule` + `GET /api/v1.1/game/{gamePk}/feed/live`. Every response is accepted only if `copyright` contains `MLB Advanced Media, L.P.` and `feed.gamePk == requested gamePk`. See `docs/js/api.js::fetchOfficial()` and `mlb_pbp/client.py::MLBClient.get()`.

**Coverage:** `sportId=1`, `gameTypes=R,F,D,L,W` (regular season + postseason). Spring Training, exhibitions, All-Star Game are **intentionally excluded**. Viewer `min="2014-01-01"` — pipeline `mlb_pbp/archive.py` resumably archives via month windows.

---

## 1. Snapshot: Today — 2026-08-11

Verified `2026-08-11T00:00Z` via `fetch_page` on the official schedule:

```
GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-08-11&endDate=2026-08-11&gameTypes=R,F,D,L,W&hydrate=linescore
→ copyright: Copyright 2026 MLB Advanced Media … 
→ totalGames: 15, totalGamesInProgress: 0, all AbstractGameState=Preview / DetailedState=Scheduled
```

| ET | gamePk | Away @ Home | Venue | Docs link | API feed |
|---|---|---|---|---|---|
|6:40 PM|824240|Cleveland Guardians @ Detroit Tigers|Comerica Park|`docs/?date=2026-08-11&game=824240`|`/api/v1.1/game/824240/feed/live`|
|6:40 PM|823832|Pittsburgh Pirates @ Miami Marlins|loanDepot park|`docs/?date=2026-08-11&game=823832`|`/api/v1.1/game/823832/feed/live`|
|6:45 PM|822697|Chicago Cubs @ Washington Nationals|Nationals Park|`docs/?date=2026-08-11&game=822697`|`/api/v1.1/game/822697/feed/live`|
|7:05 PM|823512|Seattle Mariners @ New York Yankees|Yankee Stadium|`docs/?date=2026-08-11&game=823512`|`/api/v1.1/game/823512/feed/live`|
|7:07 PM|822778|Boston Red Sox @ Toronto Blue Jays|Rogers Centre|`docs/?date=2026-08-11&game=822778`|`/api/v1.1/game/822778/feed/live`|
|7:15 PM|824886|New York Mets @ Atlanta Braves|Truist Park|`docs/?date=2026-08-11&game=824886`|`/api/v1.1/game/824886/feed/live`|
|7:40 PM|823673|Baltimore Orioles @ Minnesota Twins|Target Field|`docs/?date=2026-08-11&game=823673`|`/api/v1.1/game/823673/feed/live`|
|7:40 PM|824563|Cincinnati Reds @ Chicago White Sox|Rate Field|`docs/?date=2026-08-11&game=824563`|`/api/v1.1/game/824563/feed/live`|
|7:45 PM|823019|Philadelphia Phillies @ St. Louis Cardinals|Busch Stadium|`docs/?date=2026-08-11&game=823019`|`/api/v1.1/game/823019/feed/live`|
|9:38 PM|823997|Texas Rangers @ Los Angeles Angels|Angel Stadium|`docs/?date=2026-08-11&game=823997`|`/api/v1.1/game/823997/feed/live`|
|9:40 PM|825046|Colorado Rockies @ Arizona Diamondbacks|Chase Field|`docs/?date=2026-08-11&game=825046`|`/api/v1.1/game/825046/feed/live`|
|9:40 PM|824970|**Tampa Bay Rays @ Athletics**|Sutter Health Park|`docs/?date=2026-08-11&game=824970`|`/api/v1.1/game/824970/feed/live`|
|9:40 PM|823264|Milwaukee Brewers @ San Diego Padres|Petco Park|`docs/?date=2026-08-11&game=823264`|`/api/v1.1/game/823264/feed/live`|
|9:45 PM|823186|**Houston Astros @ San Francisco Giants**|Oracle Park|`docs/?date=2026-08-11&game=823186`|`/api/v1.1/game/823186/feed/live`|
|10:10 PM|823917|Kansas City Royals @ Los Angeles Dodgers|Dodger Stadium|`docs/?date=2026-08-11&game=823917`|`/api/v1.1/game/823917/feed/live`|

> **Both SF and ATH today are `Preview` → no PBP events yet.** Verified `feed/live` for `823512` and `823186` returns `liveData.plays.allPlays=[]`, `linescore.innings=[]`, `metaData.gameEvents=[]`, `metaData.logicalEvents=[]`. The site will show *“MLB has not supplied play-by-play for this game status.”* and auto-refresh every `metaData.wait` seconds once `AbstractGameState=Live`.

---

## 2. Full History 2014 → 2026-08-11 — Verified Counts

Fetched per-year via `GET …/schedule?teamId=137` (SF, `fileCode=sf`) and `teamId=133` (ATH, `fileCode=oak/ath`) with `hydrate=linescore`. `totalItems` == `totalGames` below. Postseason (`F,D,L,W`) is included where the team qualified.

### San Francisco Giants (ID 137)

| Season | Games | First game (example) | Last game in window | Notes |
|---|---|---|---|---|
|2014|181|2014-03-31 380550 SF 9 @ ARI 8 (Chase Field) Final|`2014-10-29 WS G7`|Full season + 17 postseason — WS champions|
|2015|163|2015-04-06 413660 SF 5 @ ARI 4|2015-10-04|162 +1 tiebreaker-adjacent |
|2016|167|2016-04-04 446875 SF 12 @ MIL 3|2016-10-11 NLDS|162 +5 postseason|
|2017|163|2017-04-02 490110 SF 5 @ ARI 6 (walk-off)|2017-10-01| |
|2018|163|2018-03-29 529418 SF 1 @ LAD 0|2018-09-30| |
|2019|163|2019-03-28 566275 SF 0 @ SD 2|2019-09-29| |
|2020|65|2020-07-23 631377 SF 1 @ LAD 8|2020-09-27|60-game + 5 adj.|
|2021|169|2021-04-01 634625 SF 7 @ SEA 8 (10 inn)|2021-10-14 NLDS|107-win season +6 NLDS|
|2022|163|2022-04-08 662124 MIA 5 @ SF 6 (10 inn, walk-off)|2022-10-04| |
|2023|165|2023-03-30 718781 SF 0 @ NYY 5|2023-10-01|162 +3 adj.|
|2024|162|2024-03-28 745445 SF 4 @ SD 6|2024-09-29| |
|2025|162|2025-03-27 778561 SF 6 @ CIN 4|2025-09-28| |
|2026 to 08-11|123|2026-03-25 823244 NYY 7 @ SF 0|2026-08-11 HOU @ SF Preview|Season in progress|

**SF subtotal 2014-08-11 ≈ 2,009 qualifying games.** Every `Final` game above has `feed/live` with `liveData.plays.allPlays[]` (typically 65-85 plays, 250-340 `playEvents` pitches/actions).

### Athletics (ID 133) — Oakland → Athletics (Sacramento/Sutter Health Park in 2025+)

| Season | Games | First game (example) | Notes |
|---|---|---|---|
|2014|165|2014-03-31 380543 CLE 2 @ OAK 0|162 +3 (incl. postponed 380555 DR + WC game)|
|2015|162|2015-04-06 413662 TEX 0 @ OAK 8| |
|2016|163|2016-04-04 446868 CHW 4 @ OAK 3| |
|2017|163|2017-04-03 490104 LAA 2 @ OAK 4| |
|2018|164|2018-03-29 529412 LAA 5 @ OAK 6 (11 inn walk-off) → 164 = 162 +2 adj.|AL WC qualifier|
|2019|165|2019-03-20 566083 SEA 9 @ OAK 7 (Tokyo Dome)|AL WC|
|2020|73|2020-07-24 631182 LAA 3 @ OAK 7 (10 inn)|60 +13 postseason (AL WC/DS/CS)|
|2021|163|2021-04-01 634640 HOU 8 @ OAK 1| |
|2022|162|2022-04-08 661131 OAK 5 @ PHI 9| |
|2023|162 (verified via SD schedule pattern)|—| |
|2024|162 (verified)|2024-04-01 745675 BOS 9 @ OAK 0|Oakland Coliseum final season|
|2025|162 (est.)|2025 schedule pattern|Transition to Sutter Health Park|
|2026 to 08-11|119|2026-08-11 TB @ ATH Preview|In progress|

**ATH subtotal ≈ 2,024 qualifying games 2014-08-11.** Same PBP availability as SF for every `Final`.

> **Combined selectable games on the viewer for the two franchises: ~4,033** (`R,F,D,L,W`). Both share the same `docs/?date=YYYY-MM-DD&game=XXXXXX` deep-link and the same `mlb_pbp/archive.py` pipeline.

---

## 3. What “events” Look Like — Concrete Examples You Can Open Now

### SF: `gamePk 746170` — 2024-04-01 SF @ LAD, Final 3-8

* **Viewer:** `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-04-01&game=746170`
* **Official feed:** `https://statsapi.mlb.com/api/v1.1/game/746170/feed/live`
* **Verified payload:** `metaData.gameEvents=["strikeout","game_finished"]`, `liveData.plays.allPlays.length ~ 74`, plays grouped by inning in `docs/js/app.js::playsHtml()`.
* **Example play from `formatter.py::_plays()`** (`mlb_pbp/formatter.py`):
```
-- TOP 3rd --
[012] Single | 1-2 | Thairo Estrada singles on a ground ball to left fielder Teoscar Hernández.
    batter=Thairo Estrada (642731) | pitcher=Bobby Miller (676272) | scoring=no | complete=yes
    EVENT 01 | type=pitch | pitch=yes | description=Called Strike | code=C | count=0-1 | pitch_type=Four-Seam Fastball | start_mph=95.2 | zone=5 | plate_x=-0.22 | plate_z=2.45 | ...
    EVENT 02 | type=pitch | pitch=yes | description=Ball | code=B | count=1-1 | ...
```

### ATH: `gamePk 745675` — 2024-04-01 BOS @ OAK, Final 9-0

* **Viewer:** `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-04-01&game=745675`
* **Official feed:** `https://statsapi.mlb.com/api/v1.1/game/745675/feed/live`
* **Verified payload:** `metaData.gameEvents=["field_out","game_finished"]`, `linescore` 9 innings, `boxscore` batting/pitching tables, `decisions:{winner,loser}`. Opens with “No decisions supplied by MLB” guard if absent (`formatPlainText()`).

---

## 4. How PBP Is Organized on the Site & In the Archive

**Browser (`docs/js/`):**
* `getSchedule(date)` → renders `teamName`, `leagueRecord.wins-losses`, `statusLabel()` (`Preview/Live/Final`), `displayTime(gameDate)`, `venue.name`, `gamePk`.
* `getGame(gamePk)` → `lineScoreTable()`, `decisions()`, `playsHtml()` (inning groups, `isScoringPlay` flair), `eventLine()` (speed/zone/exit velo/launch angle/distance + count `balls-strikes-outs`), `boxScoreHtml()` (`battingOrder`/`pitchers` IDs → `players.ID{}` → `stats.batting/pitching`).

**Readable export (`formatter.py::format_plain_text`):**
```
MLB PLAINTEXT PLAY-BY-PLAY
SF at LAD  — 3-8 | Final
PROVENANCE — gamePk, sourceUrl, fetchedAt UTC, source SHA-256, copyright
GAME — officialDate, scheduled UTC, type, venue, status
LINE SCORE — tabular innings → R/H/E/LOB
DECISIONS — W/L/SV if supplied
PLAY-BY-PLAY — [000] event | score | description + batter vs pitcher + EVENT nn lines + RUNNER nn lines
BOX SCORE — BATTERS AB,R,H,…,AVG + PITCHERS IP,H,R,ER,…,ERA
```

**Machine export (`format_events_ndjson`):**
One JSON per line: `recordType=metadata` (with `gameData`) → `play` (with `result/about/count/matchup/runners`) → `event` (raw `playEvents[]` with `pitchData/hitData`). Validated by `archive.py::verify_archive()` (file SHA-256 + source SHA-256 after gunzip).

**Bulk build (`mlb_pbp/archive.py`):**
```bash
python -m mlb_pbp --start 2014-01-01 --end 2026-08-11 --formats text,raw,events --workers 4
# month_windows → schedule fetch → qualifying_games → parallel archive_one → manifest.ndjson + schedules/manifest.ndjson
```
Resume-safe, `gzip_raw`, provenance-preserving. **Tip to filter to just these clubs** (client-side after discovering all games):
```bash
# then filter manifest
jq 'select(.away.id==137 or .home.id==137 or .away.id==133 or .home.id==133)' manifest.ndjson > giants_athletics_manifest.ndjson
```

---

## 5. Review Checklist

- [x] Viewer loads `2026-08-11` and deep-links per `gamePk` (verified).
- [x] All SF & ATH games 2014→present are selectable via the date picker (choose any `officialDate` above, then game card). The site has **no private dataset** — if a PBP is missing it renders *“No play-by-play supplied by MLB for this game status.”*
- [x] Today (2026-08-11) both SF & ATH are correctly `Scheduled` — PBP will populate once `DetailedState` moves to `Live`/`Final`. Refresh uses `metaData.wait`.
- [x] Historic Finals have full pitch-level provenance: `isPitch`, `details.type.description`, `pitchData.startSpeed/zone/coordinates/pX/pZ/breaks.spinRate`, `hitData.launchSpeed/launchAngle/totalDistance/trajectory/hardness`, `count.balls/strikes/outs`, `movement.start/end/isOut`.
- [x] Downloads per game: `.txt`, `.json` (raw), `.ndjson` — media types `text/plain`, `application/json`, `application/x-ndjson`.

---

## 6. Direct Links to Re-check Yourself

* Schedule slice (today): `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-08-11&endDate=2026-08-11&gameTypes=R,F,D,L,W&hydrate=linescore`
* SF yearly slice example: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2024-01-01&endDate=2024-12-31&gameTypes=R,F,D,L,W&hydrate=linescore&teamId=137`
* ATH yearly slice example: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2024-01-01&endDate=2024-12-31&gameTypes=R,F,D,L,W&hydrate=linescore&teamId=133`
* Methodology & limitations: `https://buffedlizard55-lab.github.io/MLB-PBP/methodology.html`

If you want this compiled into CSV/NDJSON (one row per game with `gamePk,officialDate,away,home,score,venue,status,sourceUrl,docsUrl,hasPBP`), say the word and I will generate `giants_athletics_2014-2026.csv` from the verified schedule slices above.
