"""Light-pollution layer from NASA Black Marble 2016 grayscale (VIIRS day/night band, 3 km, geo-referenced).

The GeoTIFF is global equirectangular (origin -180, 90; 1/37.5 degree pixels), lights only, so this just
drops the faint background floor, area-resamples to 8192x4096 (the largest texture most GPUs take) and
writes a single-channel PNG (0 = dark, 255 = brightest city core).
Usage: python3 scripts/build_lights.py <BlackMarble_2016_3km_gray_geo.tif> <out.png> [width]
"""
import sys
import numpy as np
from PIL import Image

FLOOR = 3  # background noise over unlit land and ocean

Image.MAX_IMAGE_PIXELS = None
W = int(sys.argv[3]) if len(sys.argv) > 3 else 8192
a = np.asarray(Image.open(sys.argv[1]).convert("L").resize((W, W // 2), Image.BOX), np.float32)
light = np.clip((a - FLOOR) / (255 - FLOOR), 0, 1)
Image.fromarray((light * 255).round().astype(np.uint8), "L").save(sys.argv[2], optimize=True)
print(sys.argv[2], light.shape, "lit px", int((light > 0.05).sum()))
