# FlightMemory exporter

Command-line port of [TobiasUr/FlightMemoryExporter](https://github.com/TobiasUr/FlightMemoryExporter): logs in to flightmemory.com with headless Chrome, pages through FLIGHTDATA, writes every flight to `.xlsx` or `.csv`.

```bash
cd tools/flightmemory
pip install -r requirements.txt          # needs Google Chrome installed
FM_USERNAME=you python fm_export.py --save-html raw/ \
  --compare "/path/to/Flight Log.xlsx"
```

- Password: `FM_PASSWORD` env var or a hidden prompt. Never written anywhere.
- Columns use Flight Log names (Date, From, From Code, To, To Code, Airline, Flight #, Aircraft, Tail #, Logged Miles) then FlightMemory extras (countries, times, duration, seat, class, role, reason, Future, FM ID, `FM Raw` = all cell text). `FM #` is FlightMemory's running leg number and sets the row order, so rows are chronological like the log. km are converted to miles; mm-dd-yyyy vs dd.mm.yyyy dates are detected from the data.
- `--compare` adds three sheets. Legs pair on date + from + to, then on the same date + flight number (an airport code differs), then on the same route within 3 days (the date differs). **Matched** lists per-leg differences in Date, From/To Code, Flight # and Tail #; **Only on FlightMemory** and **Only in Log** (inside FM's date range) list the unpaired legs.
- `--save-html DIR` keeps the raw pages; `--from-html DIR` re-parses them without logging in. If the site layout changed and the parse comes back wrong, send the `raw/` folder.
- `--headed` shows the browser (useful if a captcha or cookie banner blocks login).
- `-o flights.csv` for CSV.

Login uses the original repo's selectors (`username` / `passwort`, `SignIn`). The flight list is walked with `/signin/?go=flugdaten&dbpos=0,50,100…` (50 legs per page). The parser is fitted to a saved FLIGHTDATA page from October 2026: rows of 10 `td` plus one `th` for distance/duration, with the seat cell's `<small>` holding class, role and reason.
