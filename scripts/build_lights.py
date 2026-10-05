"""Light-pollution layer from NASA Black Marble 2016 grayscale (VIIRS day/night band, 3 km, geo-referenced).

The GeoTIFF is global equirectangular (origin -180, 90; 1/37.5 degree pixels), lights only, so this just
drops the faint background floor, area-resamples to each size and writes single-channel PNGs (0 = dark,
255 = brightest city core): lights_4096.png for desktop, lights_2048.png for phones. Both load straight into a
texture with no canvas pass (iOS Safari caps canvases at ~16.7 MP, which an 8192 map overran).
Usage: python3 scripts/build_lights.py <BlackMarble_2016_3km_gray_geo.tif> <out dir, e.g. src/assets>
"""
import os
import sys
import numpy as np
from PIL import Image

FLOOR = 3  # background noise over unlit land and ocean
SIZES = (4096, 2048)

Image.MAX_IMAGE_PIXELS = None
src = Image.open(sys.argv[1]).convert("L")
for w in SIZES:
    a = np.asarray(src.resize((w, w // 2), Image.BOX), np.float32)
    light = np.clip((a - FLOOR) / (255 - FLOOR), 0, 1)
    out = os.path.join(sys.argv[2], f"lights_{w}.png")
    Image.fromarray((light * 255).round().astype(np.uint8), "L").save(out, optimize=True)
    print(out, light.shape, "lit px", int((light > 0.05).sum()))
