# 2024 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 162 | `GET /api/v1/schedule?teamId=137&startDate=2024-01-01&endDate=2024-12-31` | [Open June 15, 2024 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-06-15) |
| Athletics (133) | 162 | `GET /api/v1/schedule?teamId=133&startDate=2024-01-01&endDate=2024-12-31` | [Open June 15, 2024 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 745445 | 2024-03-28 | SF 4 @ SD 6 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-03-28&game=745445) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/745445/feed/live) |
| SF | 746170 | 2024-04-01 | SF 3 @ LAD 8 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-04-01&game=746170) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/746170/feed/live) |
| ATH | 745675 | 2024-04-01 | BOS 9 @ OAK 0 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2024-04-01&game=745675) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/745675/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
