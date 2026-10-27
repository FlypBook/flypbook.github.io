"""Draw FlypBook's app icons (pages fanning out mid-flip on a black tile with a violet edge) into web/icons/.
Matches the logo mark in web/index.html. Drawn at 4x and scaled down for smooth edges."""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "icons"
TILE = (18, 16, 22)
PAGES = [(-16, (76, 47, 153)), (3, (139, 92, 246)), (23, (243, 236, 223))]   # (angle, color), back to front
GOLD, RULE = (255, 212, 59), (185, 173, 152)


def rotate(points, angle, pivot):
    a = math.radians(angle)
    px, py = pivot
    return [(px + (x - px) * math.cos(a) - (y - py) * math.sin(a), py + (x - px) * math.sin(a) + (y - py) * math.cos(a)) for x, y in points]


def icon(size, maskable=False):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=TILE)
        k, off = 0.62, S * 0.19          # keep the art inside the safe zone
    else:
        r = int(S * 8 / 32)
        d.rounded_rectangle([S * 1 / 32, S * 1 / 32, S * 31 / 32, S * 31 / 32], radius=r, fill=TILE)
        d.rounded_rectangle([S * 1.6 / 32, S * 1.6 / 32, S * 30.4 / 32, S * 30.4 / 32], radius=int(r * 0.92),
                            outline=(96, 66, 180), width=max(2, int(S * 0.6 / 32)))
        k, off = 1, 0
    u = S / 32 * k                       # one design unit
    P = lambda x, y: (off + x * u, off + y * u)
    pivot = P(9.5, 25)
    for angle, color in PAGES:
        corners = [P(9.5, 8), P(22.5, 8), P(22.5, 25), P(9.5, 25)]
        d.polygon(rotate(corners, angle, pivot), fill=color)
        if color == PAGES[-1][1]:
            d.polygon(rotate([P(18.5, 8), P(22.5, 8), P(22.5, 12)], angle, pivot), fill=GOLD)
            for y, x2 in ((13, 19.5), (16, 19.5), (19, 17)):
                d.line(rotate([P(12.5, y), P(x2, y)], angle, pivot), fill=RULE, width=max(1, int(u * 1.1)))
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    icon(size).save(OUT / f"icon-{size}.png")
icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
icon(180).save(OUT / "apple-touch-icon.png")
icon(32).save(OUT / "favicon-32.png")
print("Icons saved to", OUT)
