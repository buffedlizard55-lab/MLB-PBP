# 2020 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 65 | `GET /api/v1/schedule?teamId=137&startDate=2020-01-01&endDate=2020-12-31` | [Open June 15, 2020 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2020-06-15) |
| Athletics (133) | 73 | `GET /api/v1/schedule?teamId=133&startDate=2020-01-01&endDate=2020-12-31` | [Open June 15, 2020 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2020-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 631377 | 2020-07-23 | SF 1 @ LAD 8 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2020-07-23&game=631377) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/631377/feed/live) |
| ATH | 631182 | 2020-07-24 | LAA 3 @ OAK 7 (10 inn) | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2020-07-24&game=631182) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/631182/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
