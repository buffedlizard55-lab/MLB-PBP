# 2022 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 163 | `GET /api/v1/schedule?teamId=137&startDate=2022-01-01&endDate=2022-12-31` | [Open June 15, 2022 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2022-06-15) |
| Athletics (133) | 162 | `GET /api/v1/schedule?teamId=133&startDate=2022-01-01&endDate=2022-12-31` | [Open June 15, 2022 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2022-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 662124 | 2022-04-08 | MIA 5 @ SF 6 (10 inn) | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2022-04-08&game=662124) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/662124/feed/live) |
| ATH | 661131 | 2022-04-08 | OAK 5 @ PHI 9 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2022-04-08&game=661131) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/661131/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
