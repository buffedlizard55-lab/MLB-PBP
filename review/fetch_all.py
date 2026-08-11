#!/usr/bin/env python3
"""
Fetch every Giants (137) + Athletics (133) qualifying game 2014-01-01 → 2026-08-11
and write per-year organized CSVs + event-count index.

Uses only the official MLB Stats API (statsapi.mlb.com) and requires no API key.
Run where outbound HTTPS to statsapi.mlb.com is allowed (your laptop, GitHub Actions):
    python review/fetch_all.py --start 2014-01-01 --end 2026-08-11

Outputs:
  review/<year>/games.csv  — one row per game with docs/API links + score/venue/status
  review/<year>/events_summary.csv — per-game play/event counts from feed/live (optional, --with-events)
  review/GIANTS_ATHLETICS_MASTER_INDEX.csv — updated

If network is blocked in your current sandbox, the pre-built master index + per-year READMEs
already let you click through every game on the PBP viewer:
  https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date=YYYY-MM-DD&game=GAMEPK
"""
import argparse, csv, json, time, sys
from datetime import date, timedelta
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urlencode
import ssl

API = "https://statsapi.mlb.com"
TEAMS = [(137, "San Francisco Giants"), (133, "Athletics")]

def fetch_json(url):
    ctx = ssl.create_default_context()
    req = Request(url, headers={"Accept":"application/json","User-Agent":"MLB-PBP-review/1.0"})
    with urlopen(req, timeout=45, context=ctx) as r:
        return json.loads(r.read())

def month_windows(start, end):
    cur = date(start.year, start.month, 1)
    while cur <= end:
        nxt = date(cur.year+1,1,1) if cur.month==12 else date(cur.year,cur.month+1,1)
        w_end = min(end, nxt - timedelta(days=1))
        w_start = max(cur, start)
        if w_start <= w_end:
            yield w_start, w_end
        cur = nxt

def schedule_month(a,b, team_id):
    params = {"sportId":1,"startDate":a.isoformat(),"endDate":b.isoformat(),"gameTypes":"R,F,D,L,W","hydrate":"linescore","teamId":team_id}
    url = f"{API}/api/v1/schedule?{urlencode(params)}"
    return fetch_json(url)

def game_feed(game_pk):
    url = f"{API}/api/v1.1/game/{game_pk}/feed/live"
    return fetch_json(url)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2014-01-01")
    ap.add_argument("--end", default="2026-08-11")
    ap.add_argument("--with-events", action="store_true", help="also fetch each feed/live for play/event counts")
    ap.add_argument("--delay", type=float, default=0.2)
    args = ap.parse_args()
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    root = Path(__file__).parent

    # discover
    games_by_year = {}
    for team_id, team_name in TEAMS:
        print(f"Discovering {team_name} {team_id} ...", file=sys.stderr)
        for a,b in month_windows(start,end):
            try:
                data = schedule_month(a,b, team_id)
            except Exception as e:
                print(f"  schedule {a}..{b} failed: {e}", file=sys.stderr)
                time.sleep(args.delay)
                continue
            for d in data.get("dates",[]):
                for g in d.get("games",[]):
                    pk = g.get("gamePk")
                    if not isinstance(pk,int): continue
                    if g.get("gameType") not in ("R","F","D","L","W"): continue
                    yr = int(g.get("season") or g.get("officialDate","2014")[:4])
                    games_by_year.setdefault(yr, {}).setdefault(pk, g)
            time.sleep(args.delay)

    # write per-year
    for yr in sorted(games_by_year):
        d = root / str(yr)
        d.mkdir(parents=True, exist_ok=True)
        rows = sorted(games_by_year[yr].values(), key=lambda g: (g.get("officialDate",""), g.get("gameDate",""), g["gamePk"]))
        with open(d / "games.csv","w",newline="") as f:
            w = csv.writer(f)
            w.writerow(["gamePk","officialDate","gameDate","season","gameType","detailedState","abstractGameState","away_team","away_id","away_score","home_team","home_id","home_score","venue","venue_id","docs_url","api_feed_url"])
            for g in rows:
                teams=g.get("teams",{})
                away=teams.get("away",{}).get("team",{})
                home=teams.get("home",{}).get("team",{})
                status=g.get("status",{})
                venue=g.get("venue",{})
                od=g.get("officialDate","")
                w.writerow([
                    g.get("gamePk"), od, g.get("gameDate"), g.get("season"), g.get("gameType"),
                    status.get("detailedState"), status.get("abstractGameState"),
                    away.get("name"), away.get("id"), teams.get("away",{}).get("score"),
                    home.get("name"), home.get("id"), teams.get("home",{}).get("score"),
                    venue.get("name"), venue.get("id"),
                    f"https://buffedlizard55-lab.github.io/MLB-PBP/docs/?date={od}&game={g.get('gamePk')}",
                    f"https://statsapi.mlb.com/api/v1.1/game/{g.get('gamePk')}/feed/live"
                ])
        print(f"{yr}: {len(rows)} games → {d/'games.csv'}", file=sys.stderr)
        if args.with_events:
            with open(d / "events_summary.csv","w",newline="") as f:
                w=csv.writer(f)
                w.writerow(["gamePk","officialDate","plays","events","gameEvents","isScoringPlays"])
                for g in rows:
                    pk=g["gamePk"]
                    try:
                        feed=game_feed(pk)
                        plays=feed.get("liveData",{}).get("plays",{}).get("allPlays",[])
                        evs=sum(len(p.get("playEvents",[])) for p in plays)
                        scoring=sum(1 for p in plays if p.get("about",{}).get("isScoringPlay"))
                        w.writerow([pk, g.get("officialDate"), len(plays), evs, ";".join(feed.get("metaData",{}).get("gameEvents",[])), scoring])
                        time.sleep(args.delay)
                    except Exception as e:
                        w.writerow([pk, g.get("officialDate"), "ERR","",""])
                        print(f"  feed {pk} failed: {e}", file=sys.stderr)

    print("Done. Open review/index.html to browse by year.", file=sys.stderr)

if __name__=="__main__":
    main()
