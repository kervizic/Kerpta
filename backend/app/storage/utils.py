# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Utilitaires de stockage — compression PDF et conversion photo→PDF.

Tous les fichiers sont compressés/optimisés avant stockage S3 :
- PDF : linearisé et compressé via pikepdf (réduction 30-50 %)
- Images (JPEG, PNG, HEIC) : converties en PDF A4 via Pillow
"""

import logging
import re
import unicodedata
from io import BytesIO

import pikepdf
from PIL import Image

_log = logging.getLogger(__name__)

# A4 en points (72 dpi)
_A4_WIDTH_PT = 595
_A4_HEIGHT_PT = 842

# Marge intérieure (en points) pour la conversion photo→PDF
_MARGIN_PT = 36  # ~12,7 mm

# Types MIME image acceptés
IMAGE_MIME_TYPES = frozenset({
    "image/jpeg", "image/png", "image/webp",
    "image/heic", "image/heif", "image/tiff",
})


def compress_pdf(pdf_bytes: bytes) -> bytes:
    """Compresse et linéarise un PDF pour réduire sa taille.

    Args:
        pdf_bytes: contenu PDF brut

    Returns:
        PDF compressé (bytes)
    """
    try:
        src = BytesIO(pdf_bytes)
        pdf = pikepdf.open(src)
        out = BytesIO()
        pdf.save(
            out,
            linearize=True,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )
        pdf.close()
        compressed = out.getvalue()
        ratio = len(compressed) / len(pdf_bytes) * 100 if pdf_bytes else 100
        _log.info(
            "PDF compressé : %d → %d octets (%.0f %%)",
            len(pdf_bytes), len(compressed), ratio,
        )
        return compressed
    except Exception as e:
        _log.warning("Compression PDF échouée, fichier original conservé : %s", e)
        return pdf_bytes


def image_to_pdf(image_bytes: bytes) -> bytes:
    """Convertit une image en PDF A4 centré.

    L'image est redimensionnée pour tenir dans la zone utile A4
    (avec marges) en conservant les proportions.

    Args:
        image_bytes: contenu image brut (JPEG, PNG, HEIC, etc.)

    Returns:
        PDF A4 contenant l'image (bytes)
    """
    img = Image.open(BytesIO(image_bytes))

    # Convertir en RGB si nécessaire (HEIC, palette, RGBA…)
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Respecter l'orientation EXIF
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # Zone utile A4 en pixels à 72 dpi
    usable_w = _A4_WIDTH_PT - 2 * _MARGIN_PT
    usable_h = _A4_HEIGHT_PT - 2 * _MARGIN_PT

    # Redimensionner en conservant les proportions
    img_w, img_h = img.size
    scale = min(usable_w / img_w, usable_h / img_h, 1.0)
    if scale < 1.0:
        new_w = int(img_w * scale)
        new_h = int(img_h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    # Créer une page A4 blanche et coller l'image centrée
    page = Image.new("RGB", (_A4_WIDTH_PT, _A4_HEIGHT_PT), (255, 255, 255))
    paste_x = (_A4_WIDTH_PT - img.width) // 2
    paste_y = (_A4_HEIGHT_PT - img.height) // 2
    page.paste(img, (paste_x, paste_y))

    # Convertir en PDF
    out = BytesIO()
    page.save(out, format="PDF", resolution=72.0)
    pdf_bytes = out.getvalue()

    # Compresser le PDF résultant
    return compress_pdf(pdf_bytes)


def is_image_mime(mime_type: str) -> bool:
    """Vérifie si un type MIME est une image convertible."""
    return mime_type in IMAGE_MIME_TYPES


def sanitize_filename(name: str) -> str:
    """Nettoie un nom de fichier pour le stockage S3.

    - Supprime les accents
    - Remplace espaces et caractères spéciaux par des tirets
    - Conserve les lettres, chiffres, tirets et underscores
    """
    # Supprimer l'extension si présente
    base = name.rsplit(".", 1)[0] if "." in name else name
    # Normaliser unicode (NFD) et supprimer les diacritiques
    nfkd = unicodedata.normalize("NFKD", base)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Remplacer tout ce qui n'est pas alphanumérique par un tiret
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_str)
    # Supprimer les tirets en début/fin et les doublons
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "fichier"


def sanitize_folder_name(name: str) -> str:
    """Nettoie un nom pour un dossier S3 (nom client/fournisseur).

    Conserve les majuscules et les tirets, supprime les accents,
    remplace les espaces par des tirets.
    """
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_str)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "inconnu"
