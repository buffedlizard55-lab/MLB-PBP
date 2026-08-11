# 2026 — Giants & Athletics

| Team | Games | Schedule (official) | Docs viewer (any date in year) |
|---|---|---|---|
| Giants (137) | 123 | `GET /api/v1/schedule?teamId=137&startDate=2026-01-01&endDate=2026-12-31` | [Open June 15, 2026 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2026-06-15) |
| Athletics (133) | 119 | `GET /api/v1/schedule?teamId=133&startDate=2026-01-01&endDate=2026-12-31` | [Open June 15, 2026 on PBP viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2026-06-15) |

## How to review events for this year

1. Click the Docs viewer link above → pick any `officialDate` → game card → `Play-by-play` tab → expand `Official event detail`.
2. Or open any `gamePk` directly: `https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK`
3. Or fetch raw PBP: `https://statsapi.mlb.com/api/v1.1/game/GAMEPK/feed/live` (contains `liveData.plays.allPlays[]` + `playEvents[]` with `pitchData`/`hitData`).

## Verified game examples this year
| Team | gamePk | Official Date | Score | Docs | API |
|---|---|---|---|---|---|
| SF | 823186 | 2026-08-11 | HOU @ SF Preview (today) | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2026-08-11&game=823186) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/823186/feed/live) |
| ATH | 824970 | 2026-08-11 | TB @ ATH Preview (today) | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2026-08-11&game=824970) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/824970/feed/live) |
| SF | 823244 | 2026-03-25 | NYY 7 @ SF 0 | [Viewer](https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=2026-03-25&game=823244) | [feed/live](https://statsapi.mlb.com/api/v1.1/game/823244/feed/live) |

Full per-game list for the year: use the `api_schedule_url` in the master index CSV — returns every `gamePk`, `officialDate`, `teams`, `linescore`, `venue`, `status`.
