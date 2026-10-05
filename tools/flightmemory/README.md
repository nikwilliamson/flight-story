# FlightMemory exporter

Command-line port of [TobiasUr/FlightMemoryExporter](https://github.com/TobiasUr/FlightMemoryExporter): logs in to flightmemory.com with headless Chrome, pages through FLIGHTDATA, writes every flight to `.xlsx` or `.csv`.

```bash
cd tools/flightmemory
pip install -r requirements.txt          # needs Google Chrome installed
FM_USERNAME=you python fm_export.py --save-html raw/ \
  --compare "/path/to/Flight Log.xlsx"
```

- Password: `FM_PASSWORD` env var or a hidden prompt. Never written anywhere.
- Columns use Flight Log names (Date, From, From Code, To, To Code, Airline, Flight #, Aircraft, Tail #, Logged Miles) then FlightMemory extras (times, duration, seat, class, reason, `FM Raw` = all cell text). km are converted to miles. Rows are chronological.
- `--compare` adds three sheets matched on date + from + to: **Matched** (field diffs per leg), **Only on FlightMemory**, **Only in Log** (log legs inside the FM date range with no FM twin).
- `--save-html DIR` keeps the raw pages; `--from-html DIR` re-parses them without logging in. If the site layout changed and the parse comes back wrong, send the `raw/` folder.
- `--headed` shows the browser (useful if a captcha or cookie banner blocks login).
- `-o flights.csv` for CSV.

Selectors come from the original repo (login fields `username` / `passwort`, `SignIn` button, `FLIGHTDATA` link, `next.gif` pager, 3rd `tbody` in `.container`). The parser is tested on synthetic pages in that shape; the live site was unreachable from the build container.
