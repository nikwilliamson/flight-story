"""Sharper lights for the close-ups (the jump and the joyrides): central Florida cut from the NASA Black Marble 2016
grayscale 500 m tile B1 (lon -90..0, lat 0..90, as downsampled to 8000 px in flight-globe/source-data).

The tile is graded differently from the 3 km map, so its levels are matched to lights_viirs.png over the same box
(mean of the lit pixels), so the patch blends in with no visible edge.
Usage: python3 scripts/build_lights_detail.py <BlackMarble_2016_B1_gray.jpg> <lights_viirs.png> <out.png>
"""
import sys
from PIL import Image, ImageStat

# lon0, lat0, lon1, lat1. Keep in step with DETAIL_BOX in src/scene/Surface.tsx.
BOX = (-88.0, 23.0, -76.0, 33.0)
TILE = (-90.0, 0.0, 0.0, 90.0)
FLOOR = 3

Image.MAX_IMAGE_PIXELS = None
tile = Image.open(sys.argv[1]).convert("L")
glob = Image.open(sys.argv[2]).convert("L")


def crop(img, box, extent):
    w, h = img.size
    x = lambda lon: (lon - extent[0]) / (extent[2] - extent[0]) * w
    y = lambda lat: (extent[3] - lat) / (extent[3] - extent[1]) * h
    return img.crop((round(x(box[0])), round(y(box[3])), round(x(box[2])), round(y(box[1]))))


detail = crop(tile, BOX, TILE).point(lambda v: max(0, round((v - FLOOR) * 255 / (255 - FLOOR))))
ref = crop(glob, BOX, (-180.0, -90.0, 180.0, 90.0))
small = detail.resize(ref.size, Image.BOX)
lit = lambda img: ImageStat.Stat(img, img.point(lambda v: 255 if v > 12 else 0)).mean[0]
gain = lit(ref) / max(lit(small), 1)
detail = detail.point(lambda v: min(255, round(v * gain)))
detail.save(sys.argv[3], optimize=True)
print(sys.argv[3], detail.size, f"gain {gain:.2f}")
