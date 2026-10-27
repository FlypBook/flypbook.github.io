"""Draw FlypBook's app icons (a book with a page mid-flip on a violet gradient) into web/icons/."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "icons"


def icon(size, maskable=False):
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # violet diagonal gradient
    grad = Image.new("RGBA", (s, s))
    px = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            px[x, y] = (int(192 + (139 - 192) * t), int(132 + (92 - 132) * t), int(252 + (246 - 252) * t), 255)
    mask = Image.new("L", (s, s), 0)
    radius = 0 if maskable else int(s * 0.22)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    k = 0.62 if maskable else 0.78        # maskable icons keep art inside the safe zone
    c = s / 2
    def P(x, y):  # design space is 32x32, centered
        return (c + (x - 16) / 32 * s * k, c + (y - 16) / 32 * s * k)
    d.polygon([P(16, 9), P(10, 7.6), P(4.5, 8.2), P(4.5, 24.5), P(10, 23.8), P(16, 25)], fill=(255, 255, 255, 235))   # left page
    d.polygon([P(16, 9), P(19, 5.8), P(26, 4.4), P(26, 20.4), P(19, 21.8), P(16, 25)], fill=(255, 212, 59, 255))     # flipping page
    d.line([P(16, 9), P(16, 25)], fill=(255, 255, 255, 140), width=max(1, s // 64))
    return img


OUT.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    icon(size).save(OUT / f"icon-{size}.png")
icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
icon(180).save(OUT / "apple-touch-icon.png")
icon(32).save(OUT / "favicon-32.png")
print("Icons saved to", OUT)
