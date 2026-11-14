"""
Writes Delon's Android launcher icons straight into the Capacitor project
(android/app/src/main/res) so the DELON wordmark is as large as Android allows.

Adaptive icons: the launcher shows only the inner 72dp of a 108dp layer and
may mask it to a circle, so the wordmark spans 60% of the layer (about 90% of
the visible icon) and still clears a circular mask.

Usage (after `npx cap add android`):  python3 scripts/android-icons.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
LOGO = os.path.join(ROOT, "src", "images", "logo.png")

BG = (255, 255, 255, 255)   # white
INK = (20, 20, 20, 255)     # near-black wordmark


def wordmark():
    logo = Image.open(LOGO).convert("RGBA")
    word = logo.crop((0, 90, logo.width, 212))          # "DELON" without the small "3.0"
    word = word.crop(word.split()[3].getbbox())
    ink = Image.new("RGBA", word.size, INK)
    ink.putalpha(word.split()[3])
    return ink


WORD = wordmark()


def draw_word(canvas, width_frac):
    s = canvas.width
    w = int(s * width_frac)
    h = round(WORD.height * w / WORD.width)
    img = WORD.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(img, ((s - w) // 2, (s - h) // 2))
    return canvas


def save(img, folder, name):
    path = os.path.join(RES, folder)
    os.makedirs(path, exist_ok=True)
    img.save(os.path.join(path, name))


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

for name, k in DENSITIES.items():
    fg_size = round(108 * k)
    fg = draw_word(Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0)), 0.60)
    save(fg, f"mipmap-{name}", "ic_launcher_foreground.png")

    size = round(48 * k)
    big = 4  # supersample for smooth edges
    sq = Image.new("RGBA", (size * big, size * big), BG)
    sq = draw_word(sq, 0.86).resize((size, size), Image.LANCZOS)
    save(sq, f"mipmap-{name}", "ic_launcher.png")

    rd = Image.new("RGBA", (size * big, size * big), (0, 0, 0, 0))
    ImageDraw.Draw(rd).ellipse((0, 0, size * big - 1, size * big - 1), fill=BG)
    rd = draw_word(rd, 0.78).resize((size, size), Image.LANCZOS)
    save(rd, f"mipmap-{name}", "ic_launcher_round.png")

adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
for f in ("ic_launcher.xml", "ic_launcher_round.xml"):
    os.makedirs(os.path.join(RES, "mipmap-anydpi-v26"), exist_ok=True)
    with open(os.path.join(RES, "mipmap-anydpi-v26", f), "w") as fh:
        fh.write(adaptive)
os.makedirs(os.path.join(RES, "values"), exist_ok=True)
with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w") as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
             '    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
print("Android launcher icons written to", RES)
