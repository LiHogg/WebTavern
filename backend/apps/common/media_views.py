from __future__ import annotations

import hashlib
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.utils.http import http_date
from django.utils.text import slugify


DEMO_MEDIA_PREFIX = "venues/demo/"


def _safe_media_path(path: str) -> Path:
    clean_path = str(path or "").replace("\\", "/").lstrip("/")
    root = Path(settings.MEDIA_ROOT).resolve()
    candidate = (root / clean_path).resolve()
    if root not in candidate.parents and candidate != root:
        raise Http404("Media path is outside MEDIA_ROOT.")
    return candidate


def _demo_media_svg(path: str) -> str:
    clean_name = Path(path).name
    slug = clean_name.rsplit(".", 1)[0]
    base_slug = slug.rsplit("-", 1)[0] if slug.rsplit("-", 1)[-1].isdigit() else slug
    title = base_slug.replace("-", " ").replace("_", " ").title() or "WebTavern"
    digest = hashlib.sha256(slug.encode("utf-8")).hexdigest()
    primary = f"#{digest[0:6]}"
    secondary = f"#{digest[6:12]}"
    accent = f"#{digest[12:18]}"
    text_color = "#ffffff"
    escaped_title = (
        title.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="760" viewBox="0 0 1280 760" role="img" aria-label="{escaped_title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{primary}"/>
      <stop offset="0.54" stop-color="{secondary}"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="18%" r="70%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#020617" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#020617" stop-opacity="0.38"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="760" fill="url(#bg)"/>
  <rect width="1280" height="760" fill="url(#glow)"/>
  <rect y="488" width="1280" height="272" fill="url(#floor)"/>
  <g opacity="0.24" fill="#ffffff">
    <circle cx="174" cy="168" r="96"/>
    <circle cx="1120" cy="580" r="148"/>
    <rect x="770" y="112" width="356" height="214" rx="44"/>
    <rect x="118" y="514" width="420" height="118" rx="36"/>
  </g>
  <g opacity="0.72">
    <rect x="154" y="452" width="176" height="78" rx="30" fill="#ffffff" opacity="0.34"/>
    <rect x="380" y="448" width="196" height="86" rx="34" fill="#ffffff" opacity="0.28"/>
    <rect x="636" y="438" width="226" height="96" rx="38" fill="#ffffff" opacity="0.22"/>
    <circle cx="245" cy="576" r="42" fill="{accent}" opacity="0.72"/>
    <circle cx="472" cy="576" r="42" fill="{accent}" opacity="0.56"/>
    <circle cx="750" cy="582" r="46" fill="{accent}" opacity="0.44"/>
  </g>
  <rect x="82" y="82" width="1116" height="596" rx="52" fill="#020617" opacity="0.38"/>
  <text x="132" y="318" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" fill="{text_color}">{escaped_title}</text>
  <text x="136" y="398" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="500" fill="{text_color}" opacity="0.88">Демонстрационное фото заведения</text>
  <text x="136" y="492" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="{text_color}" opacity="0.70">WebTavern · каталог · бронирование столов</text>
</svg>'''


def media_file(request, path: str):
    """Serve demo media files on the Render demo stand.

    Uploaded files should normally be served by external object storage.
    For the diploma/demo deployment we keep deterministic local SVG fallbacks
    so that database media URLs do not break after a fresh Render build.
    """
    clean_path = str(path or "").replace("\\", "/").lstrip("/")
    file_path = _safe_media_path(clean_path)
    if file_path.is_file():
        return FileResponse(file_path.open("rb"))

    if clean_path.startswith(DEMO_MEDIA_PREFIX) and clean_path.lower().endswith(".svg"):
        response = HttpResponse(_demo_media_svg(clean_path), content_type="image/svg+xml; charset=utf-8")
        response["Cache-Control"] = "public, max-age=86400"
        response["Last-Modified"] = http_date(0)
        return response

    raise Http404("Media file not found.")
