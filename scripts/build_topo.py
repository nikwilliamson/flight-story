"""Global elevation texture for the globe, from AWS Terrain Tiles (Mapzen terrarium, zoom 4).

Writes an equirectangular RGB PNG:
  R = land elevation, sqrt-mapped (0 m -> 8, 6,000 m -> 255; R < 8 means water)
  G = ocean depth, sqrt-mapped (0 -> 0, 8,000 m -> 255)
  B = multidirectional hillshade (128 = flat)
Usage: python3 scripts/build_topo.py <tile-dir> <land-mask.png> <out.png> [width]
"""
import sys
import numpy as np
from PIL import Image

tiles, mask_path, out = sys.argv[1:4]
W = int(sys.argv[4]) if len(sys.argv) > 4 else 2048
H = W // 2
Z, T = 4, 256
N = 2**Z

merc = np.zeros((N * T, N * T), np.float32)
for x in range(N):
    for y in range(N):
        a = np.asarray(Image.open(f"{tiles}/{Z}_{x}_{y}.png").convert("RGB"), np.float32)
        merc[y * T:(y + 1) * T, x * T:(x + 1) * T] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

lat = 90 - (np.arange(H) + 0.5) * 180 / H
lon = -180 + (np.arange(W) + 0.5) * 360 / W
latc = np.clip(lat, -85.05, 85.05)
my = (1 - np.log(np.tan(np.radians(latc)) + 1 / np.cos(np.radians(latc))) / np.pi) / 2 * N * T
mx = (lon + 180) / 360 * N * T
# Area-average onto the coarser equirect grid: box-filter the source first, then sample.
k = max(1, (N * T) // W)
if k > 1:
    m = merc[: (N * T) // k * k, : (N * T) // k * k]
    merc_s = m.reshape(m.shape[0] // k, k, m.shape[1] // k, k).mean(axis=(1, 3))
    my, mx = my / k, mx / k
else:
    merc_s = merc
yi = np.clip(my.astype(int), 0, merc_s.shape[0] - 1)
xi = np.clip(mx.astype(int), 0, merc_s.shape[1] - 1)
elev = merc_s[yi[:, None], xi[None, :]]

land = np.asarray(Image.open(mask_path).convert("L").resize((W, H), Image.BILINEAR), np.float32) > 127
elev_land = np.where(land, np.maximum(elev, 0), 0)
depth = np.where(land, 0, np.maximum(-elev, 0))

# Hillshade from real slopes: cell size in metres, x shrinking with latitude.
cell = 2 * np.pi * 6_371_000 / W
dzdy, dzdx = np.gradient(np.where(land, elev, 0) * 1.0)
dzdx = dzdx / (cell * np.maximum(np.cos(np.radians(lat))[:, None], 0.05))
dzdy = -dzdy / cell
exag = 12.0
shade = np.zeros_like(elev)
for az in (225, 270, 315, 360):
    a = np.radians(az)
    lx, ly, lz = np.sin(a) * np.cos(np.radians(40)), np.cos(a) * np.cos(np.radians(40)), np.sin(np.radians(40))
    nx, ny, nz = -dzdx * exag, -dzdy * exag, np.ones_like(elev)
    shade += (nx * lx + ny * ly + nz * lz) / np.sqrt(nx**2 + ny**2 + nz**2)
shade /= 4
flat = np.sin(np.radians(40))
B = np.clip(128 + (shade - flat) * 255, 0, 255)
# The terrarium tiles stop at 85.05°; fade relief out toward the poles instead of smearing the edge row.
B = 128 + (B - 128) * np.clip((85 - np.abs(lat)) / 4, 0, 1)[:, None]

R = np.where(land, 8 + 247 * np.sqrt(np.clip(elev_land / 6000, 0, 1)), 0)
G = 255 * np.sqrt(np.clip(depth / 8000, 0, 1))
img = np.stack([R, G, B], -1).round().astype(np.uint8)
Image.fromarray(img).save(out, optimize=True)
print(out, img.shape, "land px", int(land.sum()), "max elev", float(elev.max()))
