# MLB Plaintext Play-by-Play

A searchable web viewer and reproducible archive pipeline for MLB regular-season and postseason games from 2014 forward.

**Website:** [buffedlizard55-lab.github.io/MLB-PBP](https://buffedlizard55-lab.github.io/MLB-PBP/)

The project uses one baseball-data source: HTTPS responses from MLB's own [`statsapi.mlb.com`](https://statsapi.mlb.com/api/v1/sports/1) domain. It does not invent, estimate, silently repair, or manually enter a score, name, play, or measurement. The raw download is the exact official response body. Human-readable files are deterministic projections of fields in that response.

> This repository does **not** relicense MLB data. Every saved record keeps MLB Advanced Media's returned notice, exact source URL, UTC retrieval time, and a SHA-256 digest. Users are responsible for complying with MLB's terms.

## What it does

- Browses the official schedule by date.
- Includes MLB `sportId=1` game types `R,F,D,L,W`: regular season and postseason; excludes Spring Training, exhibitions, and the All-Star Game.
- Renders line scores, decisions, every play, pitch/action details, runner movements, and batting/pitching box scores.
- Searches a game's official descriptions and player names in the browser.
- Downloads a readable `.txt` report, complete raw `.json`, or event-oriented `.ndjson` without a server or account.
- Bulk-archives January 1, 2014 through any requested end date with retries, rate limiting, resume support, provenance checks, and checksums.
- Refreshes live games automatically using the wait interval returned in MLB's feed.

The site has no sample scores and no fallback dataset. If the official endpoint cannot be reached or does not return a value, the interface says so.

## Official requests

The browser and CLI use:

```text
GET https://statsapi.mlb.com/api/v1/schedule
    ?sportId=1
    &startDate=YYYY-MM-DD
    &endDate=YYYY-MM-DD
    &gameTypes=R,F,D,L,W
    &hydrate=linescore

GET https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live
```

A response is accepted only if:

1. the URL is HTTPS on the exact `statsapi.mlb.com` host;
2. the response is successful JSON;
3. it contains MLB Advanced Media's provenance notice; and
4. a game feed's returned `gamePk` matches the requested `gamePk`.

See the site's [data and methodology page](https://buffedlizard55-lab.github.io/MLB-PBP/methodology.html) for scope, format semantics, and limitations.

## Web app

The site is dependency-free static HTML, CSS, and JavaScript in [`docs/`](docs/). It requests data directly from MLB in the visitor's browser. No third-party analytics, proxy, database, generated game content, logo, or team artwork is used.

Run it locally:

```bash
python -m http.server 8000 --directory site --bind 0.0.0.0
# open http://localhost:8000
```

Opening `docs/index.html` as a `file://` URL is not recommended; use an HTTP server so browser module and CORS behavior matches GitHub Pages.

## Command-line archive

Python 3.11+ is required. The archiver has no runtime dependencies outside the standard library.

### One game

A human-readable report:

```bash
python -m mlb_pbp game 746865 --format text --output 746865.txt
```

The exact response body or event records:

```bash
python -m mlb_pbp game 746865 --format raw --output 746865.json
python -m mlb_pbp game 746865 --format events --output 746865.events.ndjson
```

`746865` is only an example identifier for demonstrating CLI syntax; the command validates whatever feed MLB returns rather than relying on repository metadata.

### Complete requested range

To retrieve the requested project range through August 11, 2026:

```bash
python -m mlb_pbp archive \
  --start 2014-01-01 \
  --end 2026-08-11 \
  --output archive \
  --formats text,raw,events \
  --workers 2 \
  --request-delay 0.2
```

The end date is explicit, so the result is reproducible. For an archive through the machine's current UTC/local calendar date, omit `--end`. The default range starts on `2014-01-01`; dates before Opening Day simply contain no qualifying game.

The command first enumerates every qualifying `gamePk` from MLB's schedule endpoint in calendar-month windows, then retrieves each official feed. Re-run the same command to resume: files represented in the manifest are skipped. Use `--refresh` when MLB may have corrected completed feeds or when a game was previously saved before it ended.

Raw responses are gzip-compressed by default, without changing their decompressed bytes. Use `--raw-uncompressed` for direct `.json` files.

### Verify an archive

```bash
python -m mlb_pbp verify archive
```

Verification checks every stored file digest. For each raw file it also decompresses the content, when needed, and compares that SHA-256 with the exact official response digest recorded at retrieval.

### Archive layout

```text
archive/
├── manifest.ndjson
├── errors.ndjson                         # only present when a game failed
├── schedules/
│   ├── manifest.ndjson
│   └── 2026-08-01_2026-08-11.json.gz    # exact schedule response
├── games/2026/08/05/824646.txt           # readable report
├── raw/2026/08/05/824646.json.gz         # complete official response
└── events/2026/08/05/824646.ndjson       # streaming records
```

`manifest.ndjson` is the machine-readable inventory. A game record contains:

- MLB `gamePk`, official date, season, game type, status, and official team IDs/names;
- exact official feed URL and response notice;
- retrieval timestamp and raw response SHA-256;
- each local file's relative path, media type, encoding, and SHA-256.

The raw JSON is canonical for no-loss use. The `.txt` report is optimized for `grep`, reading, and full-text indexing. NDJSON is optimized for streaming parsers.

## Durable season releases

[`automation/github-actions/archive.yml`](automation/github-actions/archive.yml) is a ready-to-install GitHub Actions workflow that can build one season or every season from 2014 onward and publish a verified `tar.gz` plus checksum as a GitHub Release. It restores an existing season asset before running, so updates are resumable. The daily scheduled run updates the current season and refreshes its trailing seven days to capture completed games and official corrections.

After copying that template to `.github/workflows/archive.yml` with a GitHub credential allowed to update workflows, launch all season jobs:

1. Open **Actions → Build verified season archives → Run workflow**.
2. Enter `all` for the season.
3. Each completed year is published under the `archive-YYYY` release tag.

Keeping multi-gigabyte data out of Git history makes clones small while release assets remain versioned and independently checksummed.

## Development and tests

```bash
python -m unittest discover -s tests -v
python -m compileall -q mlb_pbp
node --check docs/js/api.js
node --check docs/js/format.js
node --check docs/js/app.js
```

Test fixtures are conspicuously labeled synthetic and are never published as baseball data. Continuous integration runs Python tests, compiles the package, checks browser JavaScript syntax, and exercises CLI help.

## Repository map

- [`docs/`](docs/) — original static interface and methodology documentation.
- [`mlb_pbp/client.py`](mlb_pbp/client.py) — official-host allowlist, retries, throttling, and response validation.
- [`mlb_pbp/formatter.py`](mlb_pbp/formatter.py) — deterministic text and NDJSON transformations.
- [`mlb_pbp/archive.py`](mlb_pbp/archive.py) — discovery, resume, storage, manifests, and verification.
- [`automation/github-actions/pages.yml`](automation/github-actions/pages.yml) — optional Actions-based Pages deployment template.
- [`automation/github-actions/archive.yml`](automation/github-actions/archive.yml) — scheduled/manual season-release workflow template.

## Rights

The repository's software is licensed under the MIT License. That license applies to the code, not to MLB responses or other MLB content. MLB data remains subject to the notice and terms returned by MLB Advanced Media, L.P.

This independent project is not affiliated with or endorsed by Major League Baseball. MLB and club names are shown only as official record identifiers returned by MLB's source.
