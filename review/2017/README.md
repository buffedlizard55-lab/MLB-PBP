# 2017 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 163 | `GET /api/v1/schedule?teamId=137&startDate=2017-01-01&endDate=2017-12-31` | [Open June 15, 2017 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2017-06-15) |
| Athletics (133) | 163 | `GET /api/v1/schedule?teamId=133&startDate=2017-01-01&endDate=2017-12-31` | [Open June 15, 2017 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2017-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 490110 | 2017-04-02 | SF 5 @ ARI 6 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2017-04-02&game=490110) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/490110/feed/live) |
| ATH | 490104 | 2017-04-03 | LAA 2 @ OAK 4 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2017-04-03&game=490104) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/490104/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
