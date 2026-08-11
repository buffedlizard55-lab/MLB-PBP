# 2018 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 163 | `GET /api/v1/schedule?teamId=137&startDate=2018-01-01&endDate=2018-12-31` | [Open June 15, 2018 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2018-06-15) |
| Athletics (133) | 164 | `GET /api/v1/schedule?teamId=133&startDate=2018-01-01&endDate=2018-12-31` | [Open June 15, 2018 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2018-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 529418 | 2018-03-29 | SF 1 @ LAD 0 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2018-03-29&game=529418) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/529418/feed/live) |
| ATH | 529412 | 2018-03-29 | LAA 5 @ OAK 6 (11 inn) | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2018-03-29&game=529412) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/529412/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
