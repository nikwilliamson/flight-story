"""Packs Natural Earth coastlines and country borders into line segments for the outline layer.

Output: int16 little-endian pairs (lat*180, lon*90) per vertex, two vertices per segment.
Coastline segments first, then borders; the header holds both segment counts (uint32 x2).
Usage: python3 scripts/build_outlines.py <coastline.geojson> <borders.geojson> <out.bin>
"""
import json, struct, sys

def segments(path):
    segs = []
    for f in json.load(open(path))["features"]:
        g = f["geometry"]
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for line in lines:
            for (x1, y1), (x2, y2) in zip(line, line[1:]):
                if abs(x2 - x1) > 180:  # antimeridian wrap
                    continue
                segs.append((y1, x1, y2, x2))
    return segs

coast, borders = segments(sys.argv[1]), segments(sys.argv[2])
with open(sys.argv[3], "wb") as out:
    out.write(struct.pack("<II", len(coast), len(borders)))
    for lat1, lon1, lat2, lon2 in coast + borders:
        out.write(struct.pack("<hhhh", round(lat1 * 180), round(lon1 * 90), round(lat2 * 180), round(lon2 * 90)))
print(len(coast), "coast segments,", len(borders), "border segments")
