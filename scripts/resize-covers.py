"""Copy the pixel covers into public/covers, resized to 512x512.

Usage: python scripts/resize-covers.py <source covers dir>
"""
import os
import sys

from PIL import Image

src = sys.argv[1]
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "covers")
os.makedirs(dst, exist_ok=True)
count = 0
for name in sorted(os.listdir(src)):
    if not name.lower().endswith(".jpg"):
        continue
    img = Image.open(os.path.join(src, name)).convert("RGB")
    if img.size != (512, 512):
        img = img.resize((512, 512), Image.LANCZOS)
    img.save(os.path.join(dst, name), "JPEG", quality=84, optimize=True)
    count += 1
print("wrote", count, "covers to", os.path.normpath(dst))
