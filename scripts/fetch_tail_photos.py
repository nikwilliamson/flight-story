"""src/data/flights.json tails -> public/planes/<TAIL>.webp plus public/planes/manifest.json.

Photos come only from Wikimedia Commons and only under open licences (CC BY, CC BY-SA, CC0,
public domain); author, licence and source page are recorded per photo so the site can credit them.
Registrations get reused, so a photo is kept only when its title, description or categories name
the aircraft type Steve flew on that tail. Tails without such a photo are listed under "missing".

    pip install pillow
    python scripts/fetch_tail_photos.py            # fetch tails not in the manifest yet
    python scripts/fetch_tail_photos.py --all      # re-check every tail
"""
import html, io, json, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path
from PIL import Image

FLIGHTS = Path("src/data/flights.json")
OUT = Path("public/planes")
MANIFEST = OUT / "manifest.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = "flight-story/1.0 (https://github.com/nikwilliamson/flight-story)"
WIDTH = 800
FETCH_WIDTH = 960  # a standard Commons thumbnail step, downscaled locally
QUALITY = 74
OPEN_LICENSE = re.compile(r"^(cc-by(-sa)?-[\d.]+|cc0|pd)", re.I)
REG = re.compile(r"\b[A-Z0-9]{1,2}-?[A-Z0-9]{2,6}\b")

# Words that identify each family in Commons titles, descriptions and categories.
TYPE_WORDS = {
    "B737": ["737"], "B737 MAX": ["737 MAX", "737-8", "737-9", "737 8", "737 9"],
    "B757": ["757"], "B767": ["767"], "B777": ["777"], "B747": ["747"], "B787": ["787"],
    "B717": ["717"], "B727": ["727"], "MD-80": ["MD-8", "MD8", "DC-9-8"], "MD-11": ["MD-11"],
    "DC-9": ["DC-9"], "DC-3 (C-47A)": ["DC-3", "C-47", "Dakota"], "L-1011": ["L-1011", "TriStar"],
    "A319": ["A319"], "A320": ["A320"], "A321": ["A321"], "A320neo": ["A320neo", "A320-2", "A320 neo"],
    "A321neo": ["A321neo", "A321-2", "A321 neo"], "A330": ["A330"], "A340": ["A340"], "A310": ["A310"],
    "A380": ["A380"], "CRJ": ["CRJ", "Regional Jet", "CL-600"],
    "E-Jet": ["E170", "E175", "E190", "E195", "ERJ-170", "ERJ-175", "ERJ-190", "ERJ 170", "ERJ 175",
              "ERJ 190", "Embraer 170", "Embraer 175", "Embraer 190", "Embraer 195", "E-Jet"],
    "ERJ-135/145": ["ERJ-135", "ERJ-140", "ERJ-145", "ERJ 135", "ERJ 140", "ERJ 145", "EMB-135", "EMB-145"],
    "EMB-120": ["EMB-120", "EMB 120", "Brasilia"], "Dash 8": ["Dash 8", "DHC-8", "Q400", "Q300", "Q200"],
    "Saab 340B": ["Saab 340", "SF340"], "Beech 1900": ["1900"], "Beech 65-A90": ["King Air", "A90"],
    "Bell 206L-1": ["206"], "Pitts S-2A": ["Pitts"], "BAe-3201 Jetstream": ["Jetstream"],
    "Boeing Stearman PT-17": ["Stearman", "PT-17"], "Fokker F28-0100": ["Fokker 100", "F28"],
    "Ford 5-AT-B": ["Trimotor", "5-AT"], "New Standard D-25": ["New Standard", "D-25"],
    "Avro RJ85": ["RJ85", "Avro RJ", "BAe 146"],
}


def api(**params) -> dict:
    params |= {"action": "query", "format": "json", "formatversion": "2"}
    for attempt in range(5):
        try:
            req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            return json.loads(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            print(f"  api retry {attempt + 1}: HTTP {e.code} {body[:300]!r}", file=sys.stderr)
            time.sleep(2 ** attempt * 3)
        except Exception as e:  # noqa: BLE001 — Commons rate-limits; back off and retry
            print(f"  api retry {attempt + 1}: {e} {locals().get('body', b'')[:300]!r}", file=sys.stderr)
            time.sleep(2 ** attempt * 3)
    raise RuntimeError(f"Commons API failed for {params}")


def download(url: str) -> bytes:
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print(f"  download retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt * 3)
    raise RuntimeError(f"download failed: {url}")


IMAGE_PROPS = {
    "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": FETCH_WIDTH,
    "iiextmetadatafilter": "LicenseShortName|License|LicenseUrl|Artist|Categories|DateTimeOriginal|ImageDescription|ObjectName",
}


def candidates(reg: str) -> list[dict]:
    """Files in Commons' per-registration category, else files whose title carries the registration."""
    pages = api(generator="categorymembers", gcmtitle=f"Category:{reg} (aircraft)", gcmtype="file",
                gcmlimit=50, **IMAGE_PROPS).get("query", {}).get("pages", [])
    if pages:
        return pages
    pages = api(generator="search", gsrsearch=f'intitle:"{reg}"', gsrnamespace=6, gsrlimit=30,
                **IMAGE_PROPS).get("query", {}).get("pages", [])
    token = re.compile(rf"(?<![A-Z0-9]){re.escape(reg)}(?![A-Z0-9])", re.I)
    return [p for p in pages if token.search(p["title"])]


def text(html_str: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", html_str or ""))).strip()


def meta(page: dict, key: str) -> str:
    return page["imageinfo"][0].get("extmetadata", {}).get(key, {}).get("value", "") or ""


def pick(reg: str, families: set[str], airlines: set[str], year: int | None) -> tuple[dict | None, str]:
    pages = [p for p in candidates(reg) if p.get("imageinfo") and p["imageinfo"][0].get("mime") in ("image/jpeg", "image/png")]
    if not pages:
        return None, "no photo on Commons"
    licensed = [p for p in pages if OPEN_LICENSE.match(meta(p, "License")) or "public domain" in meta(p, "LicenseShortName").lower()]
    if not licensed:
        return None, "no openly licensed photo"
    words = [w.lower() for f in families for w in TYPE_WORDS.get(f, [f])]
    typed = []
    for p in licensed:
        haystack = " ".join([p["title"], text(meta(p, "ImageDescription")), text(meta(p, "ObjectName")), meta(p, "Categories")]).lower()
        if any(w in haystack for w in words):
            typed.append((p, haystack))
    if not typed:
        return None, "no photo of the right aircraft type"

    def score(item):
        p, haystack = item
        info = p["imageinfo"][0]
        aspect = info["width"] / max(info["height"], 1)
        shot = re.search(r"(19|20)\d\d", meta(p, "DateTimeOriginal"))
        drift = abs(int(shot.group()) - year) if shot and year else 15
        return (any(a.lower() in haystack for a in airlines),  # Steve's airline's livery
                1.3 <= aspect <= 2.2,                         # card-friendly landscape
                info["width"] >= 1200,
                -drift)                                       # close to when he flew it
    return max(typed, key=score)[0], ""


def save(reg: str, page: dict) -> dict:
    info = page["imageinfo"][0]
    img = Image.open(io.BytesIO(download(info.get("thumburl") or info["url"]))).convert("RGB")
    if img.width > WIDTH:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    name = f"{reg}.webp"
    img.save(OUT / name, "WEBP", quality=QUALITY, method=6)
    return {
        "file": name, "width": img.width, "height": img.height,
        "title": page["title"].removeprefix("File:"),
        "source": info["descriptionurl"],
        "author": text(meta(page, "Artist")) or "Unknown",
        "license": meta(page, "LicenseShortName"),
        "licenseUrl": meta(page, "LicenseUrl") or None,
    }


def main() -> None:
    legs = json.loads(FLIGHTS.read_text())["legs"]
    tails: dict[str, dict] = defaultdict(lambda: {"families": set(), "airlines": set(), "years": [], "legs": 0})
    for leg in legs:
        raw = (leg.get("tail") or "").strip()
        # "YL-BBM (ex N943UA)": photograph it under either registration, keyed by the logged one.
        regs = [r for r in REG.findall(raw) if re.search(r"\d", r) or "-" in r]
        if not regs:
            continue
        t = tails[raw]
        t["regs"] = regs
        t["legs"] += 1
        if leg.get("family") or leg.get("aircraft"):
            t["families"].add(leg.get("family") or leg["aircraft"])
        t["airlines"] |= {n for n in (leg.get("airlineName"), leg.get("airline")) if n}
        if leg.get("sort"):
            t["years"].append(int(leg["sort"][:4]))

    OUT.mkdir(parents=True, exist_ok=True)
    old = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"photos": {}, "missing": {}}
    redo = "--all" in sys.argv
    photos = {} if redo else {k: v for k, v in old["photos"].items() if k in tails and (OUT / v["file"]).exists()}
    missing: dict[str, str] = {}
    todo = [k for k in sorted(tails) if k not in photos]
    print(f"{len(tails)} tails, {len(photos)} already have photos, checking {len(todo)}")

    for i, key in enumerate(todo, 1):
        t = tails[key]
        year = round(sum(t["years"]) / len(t["years"])) if t["years"] else None
        reason = "no aircraft type in the flight log" if not t["families"] else ""
        if not reason:
            for reg in t["regs"]:
                try:
                    page, reason = pick(reg, t["families"], t["airlines"], year)
                except RuntimeError as e:
                    page, reason = None, str(e)
                if page:
                    try:
                        photos[key] = save(t["regs"][0], page) | {"registration": reg}
                    except Exception as e:  # noqa: BLE001 — one bad file shouldn't sink the run
                        reason = f"download failed: {e}"
                        continue
                    break
        if key not in photos:
            missing[key] = reason
        print(f"[{i}/{len(todo)}] {key}: {'ok' if key in photos else reason}", flush=True)
        time.sleep(0.3)

    kept = {p["file"] for p in photos.values()}
    for stale in OUT.glob("*.webp"):
        if stale.name not in kept:
            stale.unlink()
    MANIFEST.write_text(json.dumps({
        "source": "Wikimedia Commons, openly licensed photos only (CC BY, CC BY-SA, CC0, public domain)",
        "photos": dict(sorted(photos.items())),
        "missing": dict(sorted(missing.items())),
    }, indent=1, ensure_ascii=False) + "\n")
    print(f"done: {len(photos)} photos, {len(missing)} missing")


if __name__ == "__main__":
    main()
