# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html
#
# Génère favicon.svg et icon-512.svg à partir de la police Sarpanch-Black.ttf
# Exécuté dans le Docker build — jamais en local

import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

FONT_PATH = "public/fonts/Sarpanch-Black.ttf"
GLYPH_CHAR = "K"
BG_COLOR = "#f97316"     # orange Kerpta
FG_COLOR = "#888888"     # gris KER du logo KERPTA

def get_k_path(font_path: str) -> tuple[str, float, float, float, float]:
    """Extrait le path SVG du glyphe K et ses bounds."""
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    glyph_name = cmap[ord(GLYPH_CHAR)]
    glyph_set = font.getGlyphSet()
    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    path = pen.getCommands()

    # Bounds du glyphe
    from fontTools.pens.boundsPen import BoundsPen
    bpen = BoundsPen(glyph_set)
    glyph_set[glyph_name].draw(bpen)
    bounds = bpen.bounds  # (xMin, yMin, xMax, yMax)

    font.close()
    return path, *bounds


def generate_svg(path: str, bounds: tuple, size: int, radius: int) -> str:
    """Génère un SVG carré avec le K centré sur fond orange."""
    xMin, yMin, xMax, yMax = bounds
    glyph_w = xMax - xMin
    glyph_h = yMax - yMin

    # Padding : 20% de chaque côté
    padding = 0.20
    available = size * (1 - 2 * padding)
    scale = available / max(glyph_w, glyph_h)

    # Centrage
    cx = (size - glyph_w * scale) / 2 - xMin * scale
    cy = (size - glyph_h * scale) / 2 - yMin * scale

    # TrueType : Y inversé (glyphe a Y vers le haut, SVG vers le bas)
    # On flip verticalement autour du centre
    transform = f"translate({cx:.2f},{size - cy:.2f}) scale({scale:.4f},{-scale:.4f})"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" rx="{radius}" fill="{BG_COLOR}"/>
  <path d="{path}" transform="{transform}" fill="{FG_COLOR}"/>
</svg>"""


def main():
    print(f"Extraction du glyphe K depuis {FONT_PATH}...")
    path, xMin, yMin, xMax, yMax = get_k_path(FONT_PATH)
    bounds = (xMin, yMin, xMax, yMax)
    print(f"  Bounds: {bounds}")
    print(f"  Path length: {len(path)} chars")

    # Favicon 32x32
    favicon = generate_svg(path, bounds, 32, 7)
    with open("dist/favicon.svg", "w") as f:
        f.write(favicon)
    print("  → dist/favicon.svg")

    # PWA icon 512x512
    icon = generate_svg(path, bounds, 512, 112)
    with open("dist/icon-512.svg", "w") as f:
        f.write(icon)
    print("  → dist/icon-512.svg")

    # Apple touch icon PNG 180x180 (via sharp ou pillow)
    try:
        import subprocess
        subprocess.run([
            "node", "-e",
            "const s=require('sharp');"
            "s('dist/icon-512.svg').resize(180,180).png()"
            ".toFile('dist/apple-touch-icon.png')"
            ".then(()=>console.log('  → dist/apple-touch-icon.png'));"
        ], check=True)
    except Exception as e:
        print(f"  ⚠ PNG generation skipped: {e}")


if __name__ == "__main__":
    main()
