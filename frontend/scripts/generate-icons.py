# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html
#
# Génère toutes les icônes (favicon, PWA, iOS, Android, Windows) depuis Sarpanch-Black.ttf
# Exécuté dans le Docker build sur le VPS — jamais en local

import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

FONT_PATH = "public/fonts/Sarpanch-Black.ttf"
GLYPH_CHAR = "K"
BG_COLOR = "#888888"     # gris KER du logo KERPTA
FG_COLOR = "#ff9900"     # orange Kerpta


def get_k_path(font_path: str) -> tuple[str, float, float, float, float]:
    """Extrait le path SVG du glyphe K et ses bounds."""
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    glyph_name = cmap[ord(GLYPH_CHAR)]
    glyph_set = font.getGlyphSet()

    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    path = pen.getCommands()

    bpen = BoundsPen(glyph_set)
    glyph_set[glyph_name].draw(bpen)
    bounds = bpen.bounds  # (xMin, yMin, xMax, yMax)

    font.close()
    return path, *bounds


def generate_svg(path: str, bounds: tuple, size: int, radius: int,
                 padding: float = 0.20) -> str:
    """Génère un SVG carré avec le K centré sur fond orange.

    Args:
        padding: fraction de chaque côté (0.20 = normal, 0.30 = maskable safe zone)
    """
    xMin, yMin, xMax, yMax = bounds
    glyph_w = xMax - xMin
    glyph_h = yMax - yMin

    available = size * (1 - 2 * padding)
    scale = available / max(glyph_w, glyph_h)

    # Centrage
    cx = (size - glyph_w * scale) / 2 - xMin * scale
    cy = (size - glyph_h * scale) / 2 - yMin * scale

    # TrueType Y inversé → flip vertical
    transform = f"translate({cx:.2f},{size - cy:.2f}) scale({scale:.4f},{-scale:.4f})"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" rx="{radius}" fill="{BG_COLOR}"/>
  <path d="{path}" transform="{transform}" fill="{FG_COLOR}"/>
</svg>"""


def svg_to_png(svg_path: str, png_path: str, size: int):
    """Convertit un SVG en PNG via sharp (Node.js)."""
    js = (
        f"const s=require('sharp');"
        f"s('{svg_path}').resize({size},{size}).png()"
        f".toFile('{png_path}')"
        f".then(()=>console.log('  → {png_path} ({size}x{size})'));"
    )
    subprocess.run(["node", "-e", js], check=True)


def main():
    print("=== Kerpta — Génération des icônes ===")
    print(f"Police : {FONT_PATH}")
    print(f"K color : {FG_COLOR} | Background : {BG_COLOR}\n")

    path, xMin, yMin, xMax, yMax = get_k_path(FONT_PATH)
    bounds = (xMin, yMin, xMax, yMax)
    print(f"Glyphe K extrait (bounds: {bounds})\n")

    # ─── SVG sources (haute résolution pour conversion PNG) ───

    # SVG standard (padding 20%) — favicon + affichage
    svg_standard = generate_svg(path, bounds, 512, 112, padding=0.20)
    with open("dist/icon-512.svg", "w") as f:
        f.write(svg_standard)
    print("  → dist/icon-512.svg (standard)")

    # SVG maskable (padding 30%) — Android safe zone (10% masqué de chaque côté)
    svg_maskable = generate_svg(path, bounds, 512, 0, padding=0.30)
    with open("dist/icon-maskable.svg", "w") as f:
        f.write(svg_maskable)
    print("  → dist/icon-maskable.svg (maskable, padding élargi)")

    # Favicon SVG 32x32
    favicon_svg = generate_svg(path, bounds, 32, 7, padding=0.20)
    with open("dist/favicon.svg", "w") as f:
        f.write(favicon_svg)
    print("  → dist/favicon.svg")

    # ─── PNG — toutes les tailles nécessaires ───
    print("\nGénération des PNG via sharp...")

    # Favicon PNG 32x32 (fallback navigateurs anciens)
    svg_to_png("dist/icon-512.svg", "dist/favicon-32x32.png", 32)

    # Favicon PNG 16x16 (onglets)
    svg_to_png("dist/icon-512.svg", "dist/favicon-16x16.png", 16)

    # Apple touch icon 180x180 (iOS)
    svg_to_png("dist/icon-512.svg", "dist/apple-touch-icon.png", 180)

    # Android Chrome 192x192 (obligatoire manifest)
    svg_to_png("dist/icon-512.svg", "dist/icon-192.png", 192)

    # Android Chrome 512x512 (splash screen)
    svg_to_png("dist/icon-512.svg", "dist/icon-512.png", 512)

    # Android maskable 192x192 (icône adaptive)
    svg_to_png("dist/icon-maskable.svg", "dist/icon-maskable-192.png", 192)

    # Android maskable 512x512
    svg_to_png("dist/icon-maskable.svg", "dist/icon-maskable-512.png", 512)

    # Windows tile 144x144 (msapplication-TileImage)
    svg_to_png("dist/icon-512.svg", "dist/icon-144.png", 144)

    print("\n✅ Toutes les icônes générées avec succès !")


if __name__ == "__main__":
    main()
