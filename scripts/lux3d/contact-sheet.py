"""把预览截图拼成接触印像（contact sheet）方便一次审片。
用法：python scripts/lux3d/contact-sheet.py <目录> <输出png> [每行张数]
"""
import os
import sys
from PIL import Image, ImageDraw

src = sys.argv[1] if len(sys.argv) > 1 else "docs/evidence/lux3d-preview"
out = sys.argv[2] if len(sys.argv) > 2 else "docs/evidence/lux3d-preview/_contact.png"
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6

files = sorted(f for f in os.listdir(src) if f.endswith(".png") and not f.startswith("_"))
if not files:
    print("no images in", src)
    sys.exit(1)

thumb = 300
label_h = 26
cols = min(cols, len(files))
rows = (len(files) + cols - 1) // cols
first = Image.open(os.path.join(src, files[0]))
ar = first.height / first.width
th = int(thumb * ar)
sheet = Image.new("RGB", (cols * thumb, rows * (th + label_h)), (18, 20, 26))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(os.path.join(src, f)).convert("RGB").resize((thumb, th))
    x = (i % cols) * thumb
    y = (i // cols) * (th + label_h)
    sheet.paste(im, (x, y))
    name = os.path.splitext(f)[0]
    d.text((x + 4, y + th + 6), name[:46], fill=(190, 200, 220))
sheet.save(out)
print("contact sheet:", out, sheet.size, "images:", len(files))
