"""Flight Log.xlsx -> src/data/flights.json plus a validation report.

Reads cached values (openpyxl data_only). Fare, Hotel and Notes never leave this script, and a trip purpose leaves it
only when it is on the shown list (src/content/trip-names.json): the repo and the site are public.
"""
import json, math, sys, datetime as dt
from collections import Counter
import pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project-files/flight-log/Flight Log.xlsx"
OUT = "src/data/flights.json"
SHOWN_PURPOSES = set(json.load(open("src/content/trip-names.json")))
REPORT = sys.argv[2] if len(sys.argv) > 2 else "validation-report.md"

f = pd.read_excel(SRC, "Flights")
ap = pd.read_excel(SRC, "Airports")
al = pd.read_excel(SRC, "Airlines")
assert f["ID"].is_monotonic_increasing, "IDs must be sorted (they are the chronology)"

airline_name = {str(c): n for c, n in zip(al["Code"], al["Airline"]) if isinstance(n, str)}
ap_by_key = {r["Airport Key"]: r for _, r in ap.iterrows()}
current_by_code = {r["Code"]: r["Airport Key"] for _, r in ap.iterrows() if pd.isna(r["Closed"])}

# Airports the workbook doesn't have yet, from OurAirports (public domain). Reported so they can be added to the Airports tab.
FALLBACK = {
    "FA08": {"Airport Key": "FA08", "Code": "FA08", "Airport": "Fantasy of Flight (Orlampa)", "City": "Polk City", "Country": "United States", "Lat": 28.166763, "Lon": -81.809603, "Closed": None},
    "TLH": {"Airport Key": "TLH", "Code": "TLH", "Airport": "Tallahassee International", "City": "Tallahassee", "Country": "United States", "Lat": 30.396499, "Lon": -84.354330, "Closed": None},
    "MCI": {"Airport Key": "MCI", "Code": "MCI", "Airport": "Kansas City International", "City": "Kansas City", "Country": "United States", "Lat": 39.297600, "Lon": -94.713893, "Closed": None},
    "SRQ": {"Airport Key": "SRQ", "Code": "SRQ", "Airport": "Sarasota Bradenton International", "City": "Sarasota/Bradenton", "Country": "United States", "Lat": 27.395399, "Lon": -82.554359, "Closed": None},
}
NAME_FALLBACK = {"Polk City": "FA08"}
used_fallback: set[str] = set()
for k, v in FALLBACK.items():
    if k not in ap_by_key:
        ap_by_key[k] = pd.Series(v)
        current_by_code.setdefault(v["Code"], k)

airports: list[dict] = []
index: dict[str, int] = {}
issues: list[str] = []

def airport_idx(key) -> int:
    if pd.isna(key):
        return -1
    if key in index:
        return index[key]
    r = ap_by_key.get(key)
    if r is None or pd.isna(r["Lat"]):
        issues.append(f"Airport key {key!r} has no coordinates")
        return -1
    index[key] = len(airports)
    airports.append({
        "key": key, "code": r["Code"], "name": r["Airport"], "city": r["City"], "country": r["Country"],
        "lat": round(float(r["Lat"]), 4), "lon": round(float(r["Lon"]), 4),
        "closed": None if pd.isna(r["Closed"]) else pd.Timestamp(r["Closed"]).date().isoformat(),
    })
    return index[key]

def clean(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s or None

# Home airport per leg, from Nik (2026-10-05): London, then Connecticut, then Boston, then Fort Lauderdale, then
# Orlando, then Osaka (Universal Studios Japan), then Orlando again. Each stretch starts with the leg that moved him
# (the move-out flight counts as the new home), dated from the log:
#   London 1965-; Connecticut from ID 21 (LHR -> JFK, 1973; he flew from JFK); Boston from ID 27 (Dec 1976, the first
#   leg from BOS); Fort Lauderdale from ID 45 (Jul 1981); Orlando from ID 124 (Sep 1988); Osaka from ID 408
#   (SFO -> KIX, 2000-04-07; SFO was only the connection); Orlando again from ID 602 (2002-07-01).
# The two middle boundaries (Boston, Fort Lauderdale) are read off the log, not given by Nik.
HOMES = [(1, "LHR"), (21, "JFK"), (27, "BOS"), (45, "FLL"), (124, "MCO"), (408, "KIX"), (602, "MCO")]


def home_of(leg_id):
    return next(code for first, code in reversed(HOMES) if leg_id >= first)


legs = []
prev_sort, prev_exact = None, False
for i, r in f.iterrows():
    fk = r["From Key"] if not pd.isna(r["From Key"]) else NAME_FALLBACK.get(r["From"])
    tk = r["To Key"] if not pd.isna(r["To Key"]) else NAME_FALLBACK.get(r["To"])
    used_fallback.update(k for k in (fk, tk) if k in FALLBACK)
    fi, ti = airport_idx(fk), airport_idx(tk)
    for side, name, idx in (("From", r["From"], fi), ("To", r["To"], ti)):
        if idx < 0 and name != "?":
            issues.append(f"ID {r.ID}: {side} '{name}' has no airport code/coordinates; leg can't be drawn")
    cands = []
    for code in str(r["Candidate Airports"]).split("|") if clean(r["Candidate Airports"]) else []:
        k = current_by_code.get(code.strip())
        if k in FALLBACK:
            used_fallback.add(k)
        if k is None:
            issues.append(f"ID {r.ID}: candidate {code.strip()} not in Airports tab")
            continue
        cands.append(airport_idx(k))
    fc = airports[fi]["country"] if fi >= 0 else None
    tc = airports[ti]["country"] if ti >= 0 else None
    sort = r["Sort Date"]
    if prev_sort is not None and sort < prev_sort and r["Date Precision"] == "Exact" and prev_exact:
        issues.append(f"ID {r.ID}: date {sort.date()} is earlier than the leg before it (ID order wins)")
    prev_sort, prev_exact = sort, r["Date Precision"] == "Exact"
    home_key = home_of(int(r.ID))
    legs.append({
        "id": int(r.ID),
        "date": None if pd.isna(r["Date"]) else pd.Timestamp(r["Date"]).date().isoformat(),
        "sort": sort.date().isoformat(),
        "detail": clean(r["Date Detail"]),
        "precision": r["Date Precision"],
        "from": fi, "to": ti,
        # Names only for airports the log can't place (the check needs them); known ones are in airports.
        "fromName": clean(r["From"]) if fi < 0 else None, "toName": clean(r["To"]) if ti < 0 else None,
        "airline": clean(r["Airline"]),
        "airlineName": airline_name.get(str(r["Airline"]), clean(r["Airline"])),
        "flight": clean(r["Flight #"]),
        "aircraft": clean(r["Aircraft"]), "family": clean(r["Family"]),
        "tail": clean(r["Tail #"]),
        "built": None if pd.isna(r["Built"]) or not r["Built"] else int(r["Built"]),
        "miles": None if pd.isna(r["Miles"]) else int(round(r["Miles"])),
        "milesPlaceholder": "placeholder" in str(r["Notes"]),
        "intl": None if fc is None or tc is None else fc != tc,
        "type": r["Flight Type"],
        "ground": r["Ground Transfer"] == "Yes",
        "candidates": cands,
        "trip": int(r["Trip ID"]),
        "home": airport_idx(home_key) if home_key else -1,
        "purpose": purpose if (purpose := clean(r["Trip / Purpose"])) in SHOWN_PURPOSES else None,
    })

json.dump({"generated": dt.date.today().isoformat(), "airports": airports, "legs": legs},
          open(OUT, "w"), separators=(",", ":"), ensure_ascii=False, allow_nan=False)

c = Counter(l["precision"] for l in legs)
lines = [
    "# Flight data validation report", "",
    f"Source: `{SRC}`  ", f"Legs: {len(legs)}  ", f"Airports drawn: {len(airports)}  ",
    f"Date precision: " + ", ".join(f"{k} {v}" for k, v in c.most_common()) + "  ",
    f"Unknown-airport legs with candidates: {sum(1 for l in legs if l['candidates'])}  ",
    f"International legs: {sum(1 for l in legs if l['intl'])}", "",
    "## Airports taken from OurAirports (not yet in the Airports tab)", "",
    *[f"- {k}: {FALLBACK[k]['Airport']}, {FALLBACK[k]['City']}" for k in sorted(used_fallback)], "",
    f"## Issues ({len(issues)})", "",
    *[f"- {s}" for s in dict.fromkeys(issues)],
]
open(REPORT, "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
