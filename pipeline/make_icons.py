"""Draw FlypBook's app icons (an open book, centered, with one violet page mid-flip and a gold ribbon,
on a black tile with a violet edge) into web/icons/.
Same shapes as the logo mark in web/index.html. Drawn at 4x and scaled down for smooth edges."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "icons"
TILE, EDGE = (18, 16, 22), (96, 66, 180)
COVER, PAGE_L, PAGE_R = (76, 47, 153), (243, 236, 223), (230, 220, 203)
FLIP, SHINE = (139, 92, 246), (154, 118, 248)
GOLD, RULE = (255, 212, 59), (185, 173, 152)
DY = -0.4                                  # the whole book sits 0.4 units up, like the SVG


def curve(p0, c1, c2, p3, steps=24):
    """Points along a cubic Bezier curve (without the start point)."""
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        pts.append((a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]))
    return pts


def mirror(pts):
    return [(32 - x, y) for x, y in pts]


COVER_PTS = [(4.6, 10.4), (4.6, 24)] + curve((4.6, 24), (9, 23.1), (13, 23.6), (16, 25.6)) \
    + curve((16, 25.6), (19, 23.6), (23, 23.1), (27.4, 24)) + [(27.4, 10.4)]
LEFT_PTS = [(16, 11.2)] + curve((16, 11.2), (13.1, 9.3), (9.4, 8.8), (5.8, 9.5)) + [(5.8, 22.8)] \
    + curve((5.8, 22.8), (9.4, 22.1), (13.1, 22.6), (16, 24.5))
FLIP_TOP = [(16, 11.2)] + curve((16, 11.2), (17.7, 8.2), (20.2, 6.3), (23.6, 5.7))
FLIP_PTS = FLIP_TOP + [(23, 19.2)] + curve((23, 19.2), (20.1, 19.6), (17.7, 21.3), (16, 24.5))
SHINE_PTS = FLIP_TOP + [(23.4, 10.1)] + curve((23.4, 10.1), (20.4, 10.7), (18, 12.7), (16, 15.7))
RULES = [[(8.2, y)] + curve((8.2, y), (10.2, y - .3), (12.1, y), (13.8, y + .8)) for y in (13.4, 16.4)] \
    + [[(8.2, 19.4)] + curve((8.2, 19.4), (9.6, 19.2), (10.9, 19.3), (12.1, 19.7))]
RIBBON = [(15, 24.4), (15, 28.6), (16, 27.6), (17, 28.6), (17, 24.4)]


def icon(size, maskable=False):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=TILE)
        k, off = 0.62, S * 0.19          # keep the art inside the safe zone, still centered
    else:
        d.rounded_rectangle([S * 1 / 32, S * 1 / 32, S * 31 / 32, S * 31 / 32], radius=int(S * 8 / 32), fill=TILE)
        d.rounded_rectangle([S * 1.5 / 32, S * 1.5 / 32, S * 30.5 / 32, S * 30.5 / 32], radius=int(S * 7.5 / 32),
                            outline=EDGE, width=max(2, int(S * 0.8 / 32)))
        k, off = 1, 0
    u = S / 32 * k                       # one design unit
    P = lambda pts: [(off + x * u, off + (y + DY) * u) for x, y in pts]
    d.polygon(P(COVER_PTS), fill=COVER)
    d.polygon(P(LEFT_PTS), fill=PAGE_L)
    d.polygon(P(mirror(LEFT_PTS)), fill=PAGE_R)
    for line in RULES:
        d.line(P(line), fill=RULE, width=max(1, round(u * 0.9)), joint="curve")
    d.polygon(P(FLIP_PTS), fill=FLIP)
    d.polygon(P(SHINE_PTS), fill=SHINE)
    d.polygon(P(RIBBON), fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    icon(size).save(OUT / f"icon-{size}.png")
icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
icon(180).save(OUT / "apple-touch-icon.png")
icon(32).save(OUT / "favicon-32.png")
print("Icons saved to", OUT)
