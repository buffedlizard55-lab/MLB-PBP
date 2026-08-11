# 2014 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 181 | `GET /api/v1/schedule?teamId=137&startDate=2014-01-01&endDate=2014-12-31` | [Open June 15, 2014 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2014-06-15) |
| Athletics (133) | 165 | `GET /api/v1/schedule?teamId=133&startDate=2014-01-01&endDate=2014-12-31` | [Open June 15, 2014 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2014-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 380550 | 2014-03-31 | SF 9 @ ARI 8 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2014-03-31&game=380550) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/380550/feed/live) |
| ATH | 380543 | 2014-03-31 | CLE 2 @ OAK 0 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2014-03-31&game=380543) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/380543/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
