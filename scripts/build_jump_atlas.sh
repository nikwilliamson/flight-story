#!/bin/sh
# The jump footage as a grayscale frame atlas (public/jump-atlas.jpg): 128 frames sampled evenly over the 16.5 s clip,
# 256x144 each, 8 across. Scrubbing a <video> by scroll is unreliable (iOS especially); an atlas seeks instantly.
# Keep the numbers in step with JUMP in src/story/jump.ts.
# Grayscale already: format=gray leaves the JPEG's chroma planes flat (r = g = b, the shader reads .r) and they cost
# almost nothing. ffmpeg's mjpeg cannot write a one-component JPEG, and re-encoding to one (Pillow) came out larger
# at the same error, so this stays as is.
# Usage: scripts/build_jump_atlas.sh <jump.mp4>
set -e
ffmpeg -v error -y -i "$1" -vf "fps=128/16.5,scale=256:144:flags=area,format=gray,tile=8x16" -frames:v 1 -q:v 5 public/jump-atlas.jpg
