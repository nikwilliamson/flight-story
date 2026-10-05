#!/usr/bin/env python3
"""Export a FlightMemory (flightmemory.com) flight history to .xlsx / .csv.

Same job as github.com/TobiasUr/FlightMemoryExporter, minus the Tk GUI:
headless Chrome logs in, pages through FLIGHTDATA, and the rows land in a
sheet whose columns line up with Flight Log.xlsx (Date, From Code, To Code,
Airline, Flight #, Aircraft, Tail #, Logged Miles, ...).

    export FM_USERNAME=...            # or you'll be prompted
    python fm_export.py                         # -> flightmemory.xlsx
    python fm_export.py --compare "/path/to/Flight Log.xlsx"
    python fm_export.py --from-html raw/        # re-parse saved pages, no login

Credentials come from FM_USERNAME / FM_PASSWORD or an interactive prompt and
are only typed into FlightMemory's own login form. Nothing is written to disk
except the export and (with --save-html) the raw result pages.
"""
from __future__ import annotations

import argparse
import csv
import getpass
import os
import re
import sys
from dataclasses import dataclass, fields
from datetime import date, datetime
from pathlib import Path

from bs4 import BeautifulSoup, Tag

LOGIN_URL = "https://www.flightmemory.com/"
KM_PER_MILE = 1.609344


@dataclass
class Flight:
    date: date | None
    dep_time: str
    arr_time: str
    from_code: str
    from_name: str
    to_code: str
    to_name: str
    airline: str
    flight_no: str
    aircraft: str
    tail: str
    miles: int | None
    duration: str
    seat: str
    seat_type: str
    cabin: str
    reason: str
    raw: str  # pipe-joined cell text, so nothing the parser misses is lost


# Flight Log.xlsx column names first, FlightMemory-only extras after.
COLUMNS = {
    "date": "Date",
    "from_name": "From",
    "from_code": "From Code",
    "to_name": "To",
    "to_code": "To Code",
    "airline": "Airline",
    "flight_no": "Flight #",
    "aircraft": "Aircraft",
    "tail": "Tail #",
    "miles": "Logged Miles",
    "dep_time": "Dep Time",
    "arr_time": "Arr Time",
    "duration": "Duration",
    "seat": "Seat",
    "seat_type": "Seat Type",
    "cabin": "Class",
    "reason": "Reason",
    "raw": "FM Raw",
}
assert set(COLUMNS) == {f.name for f in fields(Flight)}


def values(f: Flight) -> list:
    return [getattr(f, k) for k in COLUMNS]


# ---------------------------------------------------------------- scraping


def fetch_pages(username: str, password: str, headed: bool) -> list[str]:
    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as ec
    from selenium.webdriver.support.wait import WebDriverWait

    opts = webdriver.ChromeOptions()
    if not headed:
        opts.add_argument("--headless=new")
    driver = webdriver.Chrome(options=opts)  # Selenium Manager fetches chromedriver
    wait = WebDriverWait(driver, 15)
    try:
        driver.get(LOGIN_URL)
        wait.until(ec.element_to_be_clickable((By.NAME, "username"))).send_keys(username)
        wait.until(ec.element_to_be_clickable((By.NAME, "passwort"))).send_keys(password)
        wait.until(ec.element_to_be_clickable(
            (By.XPATH, "//input[@type='submit' and @value='SignIn']"))).click()

        try:
            wait.until(ec.element_to_be_clickable(
                (By.XPATH, "//*[contains(text(), 'FLIGHTDATA')]"))).click()
        except TimeoutException:
            sys.exit("Login failed: FLIGHTDATA link never appeared (check username/password).")

        pages = [driver.page_source]
        print(f"page 1: {count_rows(pages[-1])} flights", file=sys.stderr)
        while True:
            try:
                nxt = WebDriverWait(driver, 5).until(ec.element_to_be_clickable(
                    (By.XPATH, "//img[contains(@src, '/images/next.gif')]")))
            except TimeoutException:
                break
            nxt.click()
            wait.until(ec.staleness_of(nxt))
            pages.append(driver.page_source)
            print(f"page {len(pages)}: {count_rows(pages[-1])} flights", file=sys.stderr)
        return pages
    finally:
        driver.quit()


# ---------------------------------------------------------------- parsing


def flight_rows(html: str) -> list[Tag]:
    """Data rows of the flight table: 3rd tbody inside .container, header row dropped."""
    container = BeautifulSoup(html, "html.parser").select_one(".container")
    if container is None:
        return []
    bodies = container.find_all("tbody")
    if len(bodies) < 3:
        return []
    rows = bodies[2].find_all("tr", recursive=False)[1:]
    return [tr for tr in rows if len(tr.find_all("td", recursive=False)) >= 13]


def count_rows(html: str) -> int:
    return len(flight_rows(html))


def parts(td: Tag) -> list[str]:
    """Cell text split on <br>/child boundaries, like the original's getinfo()."""
    return td.get_text(separator="|", strip=True).split("|")


def part(td: Tag, i: int) -> str:
    p = parts(td)
    return p[i] if i < len(p) else ""


IATA = re.compile(r"\b([A-Z0-9]{3})\b")
DATE = re.compile(r"(\d{2})\.(\d{2})\.(\d{4})")
TIME = re.compile(r"\b(\d{1,2}:\d{2})\b")
DIST = re.compile(r"([\d.,]+)\s*(km|mi)", re.I)


def split_airport(td: Tag) -> tuple[str, str]:
    """('LGW', 'London Gatwick') from a cell like 'LGW|London Gatwick|United Kingdom'."""
    p = parts(td)
    code = next((m.group(1) for s in p if (m := IATA.fullmatch(s.strip()))), "")
    if not code and (m := IATA.search(p[0] if p else "")):
        code = m.group(1)
    name = next((s for s in p if s.strip() != code), "")
    return code, name


def parse_miles(text: str) -> int | None:
    m = DIST.search(text)
    if not m:
        return None
    # "1.234" / "1,234" are thousands separators; "1234,5" is a decimal comma.
    number = re.sub(r"[.,](?=\d{3}\b)", "", m.group(1)).replace(",", ".")
    value = float(number)
    return round(value / KM_PER_MILE) if m.group(2).lower() == "km" else round(value)


def pick(text: str, options: list[tuple[str, str]]) -> str:
    return next((label for needle, label in options if needle in text), "")


def parse_row(tr: Tag) -> Flight:
    td = tr.find_all("td", recursive=False)
    when = td[1].get_text(" ", strip=True)
    d = DATE.search(when)
    times = TIME.findall(when)
    from_code, from_name = split_airport(td[2])
    to_code, to_name = split_airport(td[4])
    seat_text = td[12].get_text(" ", strip=True)
    return Flight(
        date=date(int(d[3]), int(d[2]), int(d[1])) if d else None,
        dep_time=times[0] if times else "",
        arr_time=times[1] if len(times) > 1 else "",
        from_code=from_code,
        from_name=from_name,
        to_code=to_code,
        to_name=to_name,
        airline=part(td[10], 0),
        flight_no=part(td[10], 1),
        aircraft=part(td[11], 0),
        tail=part(td[11], 1),
        miles=parse_miles(td[6].get_text(" ", strip=True)),
        duration=td[8].get_text(" ", strip=True),
        seat=seat_text.split("/")[0].strip(),
        seat_type=pick(seat_text, [("Window", "Window"), ("Middle", "Middle"), ("Aisle", "Aisle")]),
        cabin=pick(seat_text, [("EconomyPlus", "Economy Plus"), ("Economy", "Economy"),
                               ("Business", "Business"), ("First", "First")]),
        reason=pick(seat_text, [("Personal", "Personal")]),
        raw=" | ".join(c.get_text(" ", strip=True) for c in td),
    )


def parse_pages(pages: list[str]) -> list[Flight]:
    flights = [parse_row(tr) for html in pages for tr in flight_rows(html)]
    # Flight Log row order is chronological. Flip a newest-first listing before the
    # stable sort so same-day legs without times keep their real order.
    dated = [f.date for f in flights if f.date]
    if dated and dated[0] > dated[-1]:
        flights.reverse()
    return sorted(flights, key=lambda f: (f.date or date.min, f.dep_time))


# ---------------------------------------------------------------- output


def write_xlsx(path: Path, flights: list[Flight], reconcile: dict[str, list[list]] | None) -> None:
    import openpyxl
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "FlightMemory"
    ws.append(list(COLUMNS.values()))
    for f in flights:
        ws.append(values(f))
    for cell in ws["A"][1:]:
        cell.number_format = "yyyy-mm-dd"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    for name, rows in (reconcile or {}).items():
        sheet = wb.create_sheet(name)
        for row in rows:
            sheet.append(row)
        sheet.freeze_panes = "A2"
        if sheet.max_row > 1:
            sheet.auto_filter.ref = sheet.dimensions

    for sheet in wb.worksheets:
        for i, col in enumerate(sheet.iter_cols(max_row=min(sheet.max_row, 200)), start=1):
            width = max((len(str(c.value)) for c in col if c.value is not None), default=8)
            sheet.column_dimensions[get_column_letter(i)].width = min(width + 2, 40)
    wb.save(path)


def write_csv(path: Path, flights: list[Flight]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(COLUMNS.values())
        for f in flights:
            w.writerow(values(f))


# ---------------------------------------------------------------- reconcile


def reconcile(flights: list[Flight], log_path: Path) -> dict[str, list[list]]:
    """Match FlightMemory legs to Flight Log rows on (date, from code, to code)."""
    import openpyxl

    ws = openpyxl.load_workbook(log_path, read_only=True, data_only=True)["Flights"]
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    col = {h: header.index(h) for h in ("ID", "Date", "From Code", "To Code", "Airline",
                                         "Flight #", "Aircraft", "Tail #", "FM Sync")}

    def key(d, a, b):
        d = d.date() if isinstance(d, datetime) else d
        return (d, (a or "").upper(), (b or "").upper())

    log: dict[tuple, list] = {}
    for r in rows:
        if r[col["ID"]] is not None:
            log.setdefault(key(r[col["Date"]], r[col["From Code"]], r[col["To Code"]]), []).append(r)

    matched = [["Log ID", "Date", "From", "To", "Field", "Flight Log", "FlightMemory"]]
    fm_only = [list(COLUMNS.values())]
    seen: set[int] = set()
    for f in flights:
        candidates = [r for r in log.get(key(f.date, f.from_code, f.to_code), [])
                      if r[col["ID"]] not in seen]
        if not candidates:
            fm_only.append(values(f))
            continue
        r = candidates[0]
        seen.add(r[col["ID"]])
        base = [r[col["ID"]], f.date, f.from_code, f.to_code]
        diffs = [(label, r[col[label]], fm) for label, fm in
                 (("Airline", f.airline), ("Flight #", f.flight_no),
                  ("Aircraft", f.aircraft), ("Tail #", f.tail))
                 if fm and str(r[col[label]] or "").strip().upper() != fm.strip().upper()]
        matched += [base + list(d) for d in diffs] or [base + ["(all match)", "", ""]]

    dated = [f.date for f in flights if f.date]
    lo, hi = (min(dated), max(dated)) if dated else (None, None)
    log_only = [["Log ID", "Date", "From Code", "To Code", "Airline", "Flight #", "FM Sync"]]
    for rs in log.values():
        for r in rs:
            d = r[col["Date"]].date() if isinstance(r[col["Date"]], datetime) else r[col["Date"]]
            if r[col["ID"]] in seen or not lo or not isinstance(d, date) or not lo <= d <= hi:
                continue
            log_only.append([r[col[c]] for c in ("ID", "Date", "From Code", "To Code",
                                                 "Airline", "Flight #", "FM Sync")])
    log_only[1:] = sorted(log_only[1:], key=lambda x: x[0])

    print(f"reconcile: {len(seen)} matched, {len(fm_only) - 1} only on FlightMemory, "
          f"{len(log_only) - 1} only in the log ({lo} to {hi})", file=sys.stderr)
    return {"Matched": matched, "Only on FlightMemory": fm_only, "Only in Log": log_only}


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("-o", "--out", type=Path, default=Path("flightmemory.xlsx"),
                    help="output .xlsx or .csv (default: flightmemory.xlsx)")
    ap.add_argument("--compare", type=Path, metavar="FLIGHT_LOG_XLSX",
                    help="add Matched / Only on FlightMemory / Only in Log sheets")
    ap.add_argument("--save-html", type=Path, metavar="DIR", help="keep the raw result pages")
    ap.add_argument("--from-html", type=Path, metavar="DIR", help="parse saved pages, skip login")
    ap.add_argument("--headed", action="store_true", help="show the browser window")
    args = ap.parse_args()

    if args.from_html:
        pages = [p.read_text(encoding="utf-8") for p in sorted(args.from_html.glob("page-*.html"))]
        if not pages:
            sys.exit(f"No page-*.html files in {args.from_html}")
    else:
        username = os.environ.get("FM_USERNAME") or input("FlightMemory username: ")
        password = os.environ.get("FM_PASSWORD") or getpass.getpass("FlightMemory password: ")
        pages = fetch_pages(username, password, args.headed)

    if args.save_html:
        args.save_html.mkdir(parents=True, exist_ok=True)
        for i, html in enumerate(pages, start=1):
            (args.save_html / f"page-{i:03d}.html").write_text(html, encoding="utf-8")

    flights = parse_pages(pages)
    if not flights:
        sys.exit("Parsed 0 flights. Re-run with --save-html raw/ and check the page layout.")

    if args.out.suffix.lower() == ".csv":
        if args.compare:
            sys.exit("--compare needs .xlsx output")
        write_csv(args.out, flights)
    else:
        write_xlsx(args.out, flights, reconcile(flights, args.compare) if args.compare else None)
    print(f"{len(flights)} flights -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
