"""
Rehamna front-page newspaper generator.

Builds an Arabic, right-to-left, newspaper-style PDF (masthead, lead story
with a large photo, multi-column stories with photos) from articles stored in
the Delon SQLite database.

Pure-Python stack (ReportLab + arabic-reshaper + python-bidi) so it works the
same inside the Windows .exe, on a server, or in development.
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import requests
from PIL import Image as PILImage

import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    FrameBreak,
    KeepInFrame,
    KeepTogether,
    NextPageTemplate,
    PageTemplate,
    Spacer,
    Table,
    TableStyle,
)

# --------------------------------------------------------------------------
# Paths / fonts
# --------------------------------------------------------------------------

def _resource_dir() -> str:
    """Folder that holds bundled read-only resources (fonts)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS  # PyInstaller
    return os.path.dirname(os.path.abspath(__file__))


FONT_DIR = os.path.join(_resource_dir(), "fonts")

# Typography (all OFL fonts, see fonts/OFL.txt)
MAST = "Lalezar"                 # masthead
HEAD = "Cairo-ExtraBold"         # lead headline
HEAD2 = "Cairo-Bold"             # story headlines
BODY = "NotoNaskh"               # body text
BODY_B = "NotoNaskh-SemiBold"    # standfirst / emphasis
UI = "Tajawal-Medium"            # meta, captions
UI_B = "Tajawal-Bold"            # labels, kickers

# Backwards-compatible names
FONT_REGULAR = BODY
FONT_BOLD = HEAD2

_FONT_FILES = {
    MAST: "Lalezar-Regular.ttf",
    HEAD: "Cairo-ExtraBold.ttf",
    HEAD2: "Cairo-Bold.ttf",
    BODY: "NotoNaskhArabic-Regular.ttf",
    BODY_B: "NotoNaskhArabic-SemiBold.ttf",
    UI: "Tajawal-Medium.ttf",
    UI_B: "Tajawal-Bold.ttf",
}
_fonts_ready = False


def _register_fonts():
    global _fonts_ready
    if _fonts_ready:
        return
    for name, filename in _FONT_FILES.items():
        pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, filename)))
    _fonts_ready = True


_CMAPS: dict = {}


def _fit(text: str, font: str) -> str:
    """Replace presentation-form glyphs the font lacks by their base letter.

    Many modern Arabic fonts omit the *isolated* presentation forms
    (e.g. U+FE8D ALEF ISOLATED) because shaping engines never need them;
    the base letter has the same shape, so we fall back to it.
    """
    cmap = _CMAPS.get(font)
    if cmap is None:
        cmap = _CMAPS[font] = set(pdfmetrics.getFont(font).face.charToGlyph.keys())
    out = []
    for ch in text:
        o = ord(ch)
        if o >= 0xFB50 and o not in cmap:
            d = unicodedata.decomposition(ch).split()
            if d and d[0].startswith("<"):
                ch = "".join(chr(int(x, 16)) for x in d[1:])
        out.append(ch)
    return "".join(out)


def shape(text: str, font: str) -> str:
    """Arabic shaping + bidi reordering, adapted to the font's glyph set."""
    return get_display(_fit(arabic_reshaper.reshape(text), font), base_dir="R")


# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------

INK = colors.HexColor("#141414")
BODY_INK = colors.HexColor("#262626")
MUTED = colors.HexColor("#6b6b6b")
RULE = colors.HexColor("#141414")
HAIR = colors.HexColor("#c9c4ba")
ACCENT = colors.HexColor("#b4161b")      # newspaper red
PAPER_TINT = colors.HexColor("#f3eee4")  # boxes

ARABIC_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو",
    "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر",
]
ARABIC_DAYS = ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]


def arabic_date(d: datetime) -> str:
    return f"{ARABIC_DAYS[d.weekday()]} {d.day} {ARABIC_MONTHS[d.month - 1]} {d.year}"


# --------------------------------------------------------------------------
# Rehamna matching
# --------------------------------------------------------------------------

DEFAULT_TERMS = [
    "الرحامنة",
    "إقليم الرحامنة",
    "رحامنة",
    "Rehamna",
    "Rhamna",
    "Rehamna Province",
    "Province de Rehamna",
    "Benguerir",
    "Ben Guerir",
    "ابن جرير",
    "Sidi Bou Othmane",
    "سيدي بوعثمان",
    "Ait Hammou",
    "آيت حمو",
    "Ait Taleb",
    "آيت الطالب",
    "Akarma",
    "عكرمة",
    "Bouchane",
    "بوشان",
    "Bourrous",
    "بوروس",
    "Jaafra",
    "الجعافرة",
    "Jaidate",
    "الجعيدات",
    "Jbilate",
    "الجبيلات",
    "Labrikiyne",
    "لبريكيين",
    "Lamharra",
    "المحرة",
    "Nzalat Laadam",
    "نزلة لعظم",
    "Oulad Aamer Tizmarine",
    "أولاد عامر تزمارين",
    "Oulad Hassoune Hamri",
    "أولاد حسون الحمري",
    "Oulad Imloul",
    "أولاد إملول",
    "Ras Ain Rhamna",
    "رأس العين الرحامنة",
    "Sidi Abdallah",
    "سيدي عبد الله",
    "Sidi Ali Labrahla",
    "سيدي علي البراحلة",
    "Sidi Boubker",
    "سيدي بوبكر",
    "Sidi Ghanem",
    "سيدي غانم",
    "Sidi Mansour",
    "سيدي منصور",
    "Skhour Rhamna",
    "صخور الرحامنة",
    "Skoura Lhadra",
    "سكورة الحضراء",
    "Tlauh",
    "الطلوح",
    "بنجرير",
    "بن جرير",
    "سيدي بوعتمان",
    "صخورالرحامنة",
    "راس عين الرحامنة",
]


def _normalize(text: str) -> str:
    text = text or ""
    text = re.sub(r"[إأآا]", "ا", text)
    text = re.sub(r"[ً-ْـ]", "", text)  # diacritics + tatweel
    return text.lower()


def load_terms(json_dir: str = "json") -> list[str]:
    path = os.path.join(json_dir, "rehamna.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        terms = data.get("terms") if isinstance(data, dict) else data
        if terms:
            return list(terms)
    except Exception:
        pass
    return DEFAULT_TERMS


def matches_terms(text: str, terms: list[str]) -> list[str]:
    norm = _normalize(text)
    return [t for t in terms if _normalize(t) in norm]


# --------------------------------------------------------------------------
# Text helpers
# --------------------------------------------------------------------------

def strip_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>|</p>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&quot;", '"').replace("&#8230;", "…")
                .replace("&laquo;", "«").replace("&raquo;", "»"))
    text = re.sub(r"&#?\w+;", " ", text)
    text = re.sub(r"The post .*? appeared first on .*?\.?$", "", text.strip())
    text = re.sub(r"ظهرت المقالة .*? أولاً على .*$", "", text.strip())
    return re.sub(r"[ \t\r\f\v]+", " ", text).strip()


def clip(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    sp = cut.rfind(" ")
    if sp > limit * 0.6:
        cut = cut[:sp]
    return cut.rstrip("،,.؛: ") + "…"


def first_img_src(html: str) -> str | None:
    if not html:
        return None
    m = re.search(r"<img[^>]+src=[\"']([^\"']+)[\"']", html, re.I)
    return m.group(1) if m else None


def parse_pub_date(value: str):
    if not value:
        return None
    try:
        from dateutil import parser as dparser
        return dparser.parse(value)
    except Exception:
        return None


# --------------------------------------------------------------------------
# RTL paragraph flowable
# --------------------------------------------------------------------------

class RTLParagraph(Flowable):
    """
    A right-to-left paragraph with correct Arabic shaping.

    Lines are wrapped in *logical* order, then each line is shaped and
    re-ordered for display, so multi-line Arabic text reads correctly.
    Supports splitting across frames/columns/pages.
    """

    def __init__(self, text, font=FONT_REGULAR, size=11, leading=None,
                 color=INK, align="justify", space_before=0, space_after=0,
                 _lines=None):
        super().__init__()
        self.text = text or ""
        self.font = font
        self.size = size
        self.leading = leading or size * 1.45
        self.color = color
        self.align = align
        self.spaceBefore = space_before
        self.spaceAfter = space_after
        self._lines = _lines  # list[(words, is_paragraph_end)]
        self._width = None

    # -- measuring ------------------------------------------------------
    def _w(self, s):
        return pdfmetrics.stringWidth(shape(s, self.font), self.font, self.size)

    def _layout(self, width):
        lines = []
        space = pdfmetrics.stringWidth(" ", self.font, self.size)
        for para in self.text.split("\n"):
            words = para.split()
            if not words:
                continue
            cur, cur_w = [], 0.0
            for word in words:
                ww = self._w(word)
                add = ww if not cur else space + ww
                if cur and cur_w + add > width:
                    lines.append((cur, False))
                    cur, cur_w = [word], ww
                else:
                    cur.append(word)
                    cur_w += add
            if cur:
                lines.append((cur, True))
        return lines

    def wrap(self, availWidth, availHeight):
        if self._lines is None or self._width != availWidth:
            self._lines = self._layout(availWidth)
            self._width = availWidth
        self.width = availWidth
        self.height = len(self._lines) * self.leading
        return availWidth, self.height

    def split(self, availWidth, availHeight):
        self.wrap(availWidth, availHeight)
        n = int(availHeight // self.leading)
        if n <= 0 or n >= len(self._lines):
            return [] if n <= 0 else [self]
        kw = dict(font=self.font, size=self.size, leading=self.leading,
                  color=self.color, align=self.align)
        head, tail = self._lines[:n], self._lines[n:]
        a = RTLParagraph(_lines_text(head), space_before=self.spaceBefore, _lines=head, **kw)
        b = RTLParagraph(_lines_text(tail), space_after=self.spaceAfter, _lines=tail, **kw)
        a._width = b._width = availWidth
        return [a, b]

    # -- drawing --------------------------------------------------------
    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.setFont(self.font, self.size)
        y = self.height - self.size  # baseline of first line
        for words, is_end in self._lines:
            logical = " ".join(words)
            visual = shape(logical, self.font)
            if self.align == "center":
                c.drawCentredString(self.width / 2, y, visual)
            elif self.align == "justify" and not is_end and len(words) > 1:
                parts = visual.split(" ")
                widths = [pdfmetrics.stringWidth(p, self.font, self.size) for p in parts]
                gap = (self.width - sum(widths)) / (len(parts) - 1)
                x = 0.0
                for p, w in zip(parts, widths):
                    c.drawString(x, y, p)
                    x += w + gap
            else:
                c.drawRightString(self.width, y, visual)
            y -= self.leading


def _lines_text(lines):
    out = []
    for words, is_end in lines:
        out.append(" ".join(words) + ("\n" if is_end else " "))
    return "".join(out).strip()


class Rule(Flowable):
    def __init__(self, thickness=0.6, color=RULE, space=4, double=False):
        super().__init__()
        self.thickness, self.color, self.space, self.double = thickness, color, space, double

    def wrap(self, aw, ah):
        self.width = aw
        self.height = self.space * 2 + (3 if self.double else 0)
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        y = self.space
        c.line(0, y, self.width, y)
        if self.double:
            c.setLineWidth(self.thickness / 2)
            c.line(0, y + 3, self.width, y + 3)


class Photo(Flowable):
    """Cropped photo with a hairline border and optional caption."""

    def __init__(self, data: bytes, height: float, caption: str | None = None):
        super().__init__()
        self.data = data
        self.img_h = height
        self.caption = caption

    def wrap(self, aw, ah):
        self.width = aw
        self.height = self.img_h + (12 if self.caption else 0) + 4
        return aw, self.height

    def draw(self):
        c = self.canv
        top = self.height
        ih = self.img_h
        try:
            img = PILImage.open(io.BytesIO(self.data))
            img = _crop_to_ratio(img, self.width / ih)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=82)
            buf.seek(0)
            c.drawImage(ImageReader(buf), 0, top - ih, self.width, ih)
        except Exception:
            c.setFillColor(PAPER_TINT)
            c.rect(0, top - ih, self.width, ih, stroke=0, fill=1)
        c.setStrokeColor(HAIR)
        c.setLineWidth(0.4)
        c.rect(0, top - ih, self.width, ih, stroke=1, fill=0)
        if self.caption:
            c.setFillColor(MUTED)
            c.setFont(UI, 7.5)
            c.drawRightString(self.width, top - ih - 10,
                              shape(clip(self.caption, 90), UI))


def _crop_to_ratio(img: PILImage.Image, ratio: float) -> PILImage.Image:
    img = img.convert("RGB")
    w, h = img.size
    if w / h > ratio:
        nw = int(h * ratio)
        x = (w - nw) // 2
        img = img.crop((x, 0, x + nw, h))
    else:
        nh = int(w / ratio)
        y = max(0, (h - nh) // 3)  # keep faces: bias toward the top
        img = img.crop((0, y, w, y + nh))
    if img.size[0] > 1400:
        img = img.resize((1400, int(1400 / ratio)))
    return img


# --------------------------------------------------------------------------
# Images
# --------------------------------------------------------------------------

_UA = {"User-Agent": "Mozilla/5.0 (Delon newspaper builder)"}


def _download_image(url: str) -> bytes | None:
    if not url or not url.startswith("http"):
        return None
    try:
        r = requests.get(url, headers=_UA, timeout=10)
        if r.status_code != 200 or len(r.content) < 2000:
            return None
        img = PILImage.open(io.BytesIO(r.content))
        if min(img.size) < 120:
            return None
        return r.content
    except Exception:
        return None


def _og_image(page_url: str) -> str | None:
    if not page_url or not page_url.startswith("http"):
        return None
    try:
        r = requests.get(page_url, headers=_UA, timeout=10)
        html = r.text[:300000]
        for pat in (
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        ):
            m = re.search(pat, html, re.I)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None


def fetch_photo(article: dict) -> bytes | None:
    candidates = [
        article.get("image_url"),
        first_img_src(article.get("description", "")),
        first_img_src(article.get("content", "")),
    ]
    for url in candidates:
        if url and url != "No Image":
            data = _download_image(url)
            if data:
                return data
    return _download_image(_og_image(article.get("link")))


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------

def collect_articles(db_path: str, days: int = 1, terms: list[str] | None = None,
                     limit: int = 40) -> list[dict]:
    import sqlite3

    terms = terms or DEFAULT_TERMS
    since = (datetime.now() - timedelta(days=max(1, days) - 1)).strftime("%Y-%m-%d")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT * FROM articles WHERE DATE(timestamp) >= ? ORDER BY timestamp DESC",
            (since,),
        ).fetchall()
    finally:
        conn.close()

    out, seen = [], set()
    for row in rows:
        a = dict(row)
        blob = " ".join(str(a.get(k) or "") for k in
                        ("title", "description", "content", "matched_places"))
        hits = matches_terms(blob, terms)
        if not hits:
            continue
        key = _normalize(a.get("title", ""))[:80]
        if key in seen:
            continue
        seen.add(key)
        a["matched_terms"] = hits
        # Relevance: title hits weigh more than body hits.
        title_hits = len(matches_terms(a.get("title", ""), terms))
        a["_score"] = title_hits * 3 + len(hits)
        out.append(a)

    out.sort(key=lambda a: a["_score"], reverse=True)
    return out[:limit]


def article_body(a: dict) -> str:
    for key in ("summary", "content", "description"):
        txt = strip_html(a.get(key) or "")
        if len(txt) > 60:
            return txt
    return strip_html(a.get("description") or a.get("content") or "")


def default_editorial(articles: list[dict], days: int) -> str:
    sources = sorted({a.get("source") or "" for a in articles if a.get("source")})
    cats = {}
    for a in articles:
        cats[a.get("category") or "مختلفات"] = cats.get(a.get("category") or "مختلفات", 0) + 1
    period = "اليوم" if days <= 1 else f"خلال آخر {days} أيام"
    cat_txt = "، ".join(f"{n} في {c}" for c, n in sorted(cats.items(), key=lambda x: -x[1]))
    heads = "؛ ".join(clip(strip_html(a["title"]), 70) for a in articles[1:4])
    text = (
        f"رصدت هذه النشرة {len(articles)} خبرا يتعلق بإقليم الرحامنة {period}، "
        f"نشرتها {len(sources)} من المنابر الإعلامية، وتتوزع على النحو التالي: {cat_txt}. "
    )
    if articles:
        text += f"ويتصدر العدد خبر «{clip(strip_html(articles[0]['title']), 90)}»"
        text += f"، إلى جانب مواضيع أخرى من بينها: {heads}." if heads else "."
    return text


# --------------------------------------------------------------------------
# PDF building
# --------------------------------------------------------------------------

PAGE_W, PAGE_H = A4
MARGIN = 11 * mm
GUTTER = 6 * mm
MASTHEAD_H = 42 * mm
LEAD_H = 122 * mm
INNER_HEAD_H = 15 * mm
FOOTER_H = 8 * mm
N_COLS = 3
COL_W = (PAGE_W - 2 * MARGIN - (N_COLS - 1) * GUTTER) / N_COLS

ISSUE_EPOCH = datetime(2024, 1, 1)


def _columns(top: float, bottom: float, prefix: str):
    frames = []
    # RTL newspaper: the first column is the right-most one.
    for i in range(N_COLS):
        x = PAGE_W - MARGIN - (i + 1) * COL_W - i * GUTTER
        frames.append(Frame(x, bottom, COL_W, top - bottom, id=f"{prefix}{i}",
                            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0))
    return frames


def _column_rules(c, top, bottom):
    """Classic hairlines between columns."""
    c.setStrokeColor(HAIR)
    c.setLineWidth(0.5)
    for i in range(1, N_COLS):
        x = PAGE_W - MARGIN - i * COL_W - (i - 0.5) * GUTTER
        c.line(x, bottom, x, top)


def _text_w(s, font, size):
    return pdfmetrics.stringWidth(shape(s, font), font, size)


class Kicker(Flowable):
    """Category label: red tag (filled) or red text with a short bar."""

    def __init__(self, text, filled=False, size=8.5):
        super().__init__()
        self.text, self.filled, self.size = text or "", filled, size

    def wrap(self, aw, ah):
        self.width = aw
        self.height = (self.size + 8) if self.text else 0
        return aw, self.height

    def draw(self):
        if not self.text:
            return
        c = self.canv
        w = _text_w(self.text, UI_B, self.size)
        if self.filled:
            c.setFillColor(ACCENT)
            c.rect(self.width - w - 10, 2, w + 10, self.size + 5, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont(UI_B, self.size)
            c.drawRightString(self.width - 5, 5, shape(self.text, UI_B))
        else:
            c.setFillColor(ACCENT)
            c.rect(self.width - 3, 3, 3, self.size + 1, stroke=0, fill=1)
            c.setFont(UI_B, self.size)
            c.drawRightString(self.width - 7, 4, shape(self.text, UI_B))


class SectionBar(Flowable):
    """Black bar with a white title — used for 'افتتاحية' / 'في هذا العدد'."""

    def __init__(self, text, color=INK):
        super().__init__()
        self.text, self.color = text, color

    def wrap(self, aw, ah):
        self.width, self.height = aw, 20
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.rect(0, 0, self.width, self.height, stroke=0, fill=1)
        c.setFillColor(ACCENT)
        c.rect(self.width - 5, 0, 5, self.height, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(HEAD2, 10.5)
        c.drawRightString(self.width - 11, 5.5, shape(self.text, HEAD2))


class EndMark(Flowable):
    """Small red square closing a story, followed by a hairline."""

    def wrap(self, aw, ah):
        self.width, self.height = aw, 14
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(HAIR)
        c.setLineWidth(0.6)
        c.line(0, 4, self.width, 4)
        c.setFillColor(ACCENT)
        c.rect(self.width / 2 - 2.5, 1.5, 5, 5, stroke=0, fill=1)


def _boxed(flowables, width, pad=7):
    tbl = Table([[f] for f in flowables], colWidths=[width])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER_TINT),
        ("LEFTPADDING", (0, 0), (-1, -1), pad),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, 0), pad),
        ("BOTTOMPADDING", (0, -1), (-1, -1), pad),
    ]))
    return tbl


def _fit_height(para: "RTLParagraph", width: float, height: float) -> "RTLParagraph":
    """Keep only the whole lines that fit, ending with an ellipsis."""
    para.wrap(width, height)
    n = max(1, int(height // para.leading))
    if len(para._lines) > n:
        lines = para._lines[:n]
        words, _ = lines[-1]
        lines[-1] = (words[:-1] + [words[-1].rstrip("،,.") + "…"] if words else words, True)
        para._lines = lines
    return para


def _deck(text: str, limit=190) -> str:
    """First sentence(s) of the story, used as the standfirst."""
    m = re.split(r"(?<=[.!؟?])\s+", text.strip())
    out = ""
    for s in m:
        if len(out) + len(s) > limit and out:
            break
        out = f"{out} {s}".strip()
    return clip(out, limit)


def build_pdf(articles: list[dict], *, title: str = "أخبار الرحامنة",
              days: int = 1, editorial: str | None = None,
              issue_date: datetime | None = None) -> bytes:
    _register_fonts()
    issue_date = issue_date or datetime.now()
    issue_no = max(1, (issue_date - ISSUE_EPOCH).days)

    # Fetch photos in parallel.
    with ThreadPoolExecutor(max_workers=8) as pool:
        photos = list(pool.map(fetch_photo, articles))
    for a, p in zip(articles, photos):
        a["_photo"] = p

    # Prefer a lead story that has a photo.
    if articles and not articles[0]["_photo"]:
        for i, a in enumerate(articles):
            if a["_photo"]:
                articles.insert(0, articles.pop(i))
                break

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=MARGIN,
                          title=title, author="Delon", subject="Rehamna news digest")

    top = PAGE_H - MARGIN
    content_top = top - MASTHEAD_H
    lead_bottom = content_top - LEAD_H
    bottom = MARGIN + FOOTER_H
    front_cols_top = lead_bottom - 5 * mm
    inner_top = top - INNER_HEAD_H

    lead_frame = Frame(MARGIN, lead_bottom, PAGE_W - 2 * MARGIN, LEAD_H, id="lead",
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    front_cols = _columns(front_cols_top, bottom, "f")
    inner_cols = _columns(inner_top, bottom, "i")

    period = "العدد اليومي" if days <= 1 else f"حصيلة آخر {days} أيام"
    sources = len({a.get("source") for a in articles if a.get("source")})
    ticker = [clip(strip_html(a["title"]), 55) for a in articles[1:4]]

    def footer(c, d):
        c.setStrokeColor(RULE)
        c.setLineWidth(0.8)
        c.line(MARGIN, MARGIN + 5 * mm, PAGE_W - MARGIN, MARGIN + 5 * mm)
        c.setFont(UI, 7.5)
        c.setFillColor(MUTED)
        c.drawRightString(PAGE_W - MARGIN, MARGIN + 1.2 * mm, shape(f"{title} • {arabic_date(issue_date)}", UI))
        c.drawString(MARGIN, MARGIN + 1.2 * mm, "Delon")
        c.setFont(UI_B, 9)
        c.setFillColor(INK)
        c.drawCentredString(PAGE_W / 2, MARGIN + 1.2 * mm, str(d.page))

    def draw_front(c, d):
        c.saveState()
        w = PAGE_W - 2 * MARGIN
        # --- top strip
        c.setFont(UI, 8)
        c.setFillColor(MUTED)
        c.drawRightString(PAGE_W - MARGIN, top - 7, shape("جريدة إلكترونية تجمع كل ما يُنشر عن إقليم الرحامنة", UI))
        c.drawString(MARGIN, top - 7, shape(f"{period}", UI))
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.line(MARGIN, top - 11, PAGE_W - MARGIN, top - 11)

        # --- ears (date on the right, issue on the left)
        ear_w, ear_h, ear_y = 36 * mm, 21 * mm, top - 13 - 25 * mm
        c.setFillColor(ACCENT)
        c.rect(PAGE_W - MARGIN - ear_w, ear_y, ear_w, ear_h, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(HEAD2, 12)
        c.drawCentredString(PAGE_W - MARGIN - ear_w / 2, ear_y + ear_h - 17, shape(ARABIC_DAYS[issue_date.weekday()], HEAD2))
        c.setFont(UI_B, 9)
        c.drawCentredString(PAGE_W - MARGIN - ear_w / 2, ear_y + 15,
                            shape(f"{issue_date.day} {ARABIC_MONTHS[issue_date.month - 1]} {issue_date.year}", UI_B))

        c.setStrokeColor(INK)
        c.setLineWidth(1)
        c.rect(MARGIN, ear_y, ear_w, ear_h, stroke=1, fill=0)
        c.setFillColor(INK)
        c.setFont(HEAD2, 12)
        c.drawCentredString(MARGIN + ear_w / 2, ear_y + ear_h - 17, shape(f"العدد {issue_no}", HEAD2))
        c.setFont(UI, 8.5)
        c.setFillColor(MUTED)
        c.drawCentredString(MARGIN + ear_w / 2, ear_y + 15, shape(f"{len(articles)} خبرا من {sources} مصادر", UI))

        # --- title
        c.setFillColor(INK)
        size = 64
        while _text_w(title, MAST, size) > w - 2 * ear_w - 16 and size > 30:
            size -= 2
        c.setFont(MAST, size)
        c.drawCentredString(PAGE_W / 2, ear_y + 9, shape(title, MAST))

        # --- double rule
        y = ear_y - 5
        c.setLineWidth(2.6)
        c.setStrokeColor(RULE)
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        c.setLineWidth(0.6)
        c.line(MARGIN, y - 3.5, PAGE_W - MARGIN, y - 3.5)

        # --- headlines ticker
        band_top = y - 7
        band_h = 15
        c.setFillColor(INK)
        c.rect(MARGIN, band_top - band_h, w, band_h, stroke=0, fill=1)
        label = "عناوين العدد"
        lw = _text_w(label, UI_B, 8.5) + 14
        c.setFillColor(ACCENT)
        c.rect(PAGE_W - MARGIN - lw, band_top - band_h, lw, band_h, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(UI_B, 8.5)
        c.drawRightString(PAGE_W - MARGIN - 7, band_top - band_h + 4.5, shape(label, UI_B))
        if ticker:
            c.setFont(UI, 8.3)
            avail = w - lw - 12
            text = "   •   ".join(ticker)
            while ticker and _text_w(text, UI, 8.3) > avail:
                ticker.pop()
                text = "   •   ".join(ticker)
            c.drawRightString(PAGE_W - MARGIN - lw - 8, band_top - band_h + 4.5, shape(text, UI))

        _column_rules(c, front_cols_top, bottom)
        footer(c, d)
        c.restoreState()

    def draw_inner(c, d):
        c.saveState()
        c.setFillColor(INK)
        c.setFont(MAST, 22)
        c.drawRightString(PAGE_W - MARGIN, top - 22, shape(title, MAST))
        c.setFont(UI, 8.5)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, top - 18, shape(arabic_date(issue_date), UI))
        c.setFillColor(ACCENT)
        c.setFont(UI_B, 8.5)
        c.drawCentredString(PAGE_W / 2, top - 18, shape(f"العدد {issue_no}", UI_B))
        c.setStrokeColor(RULE)
        c.setLineWidth(2.2)
        c.line(MARGIN, top - 29, PAGE_W - MARGIN, top - 29)
        c.setLineWidth(0.5)
        c.line(MARGIN, top - 32, PAGE_W - MARGIN, top - 32)
        _column_rules(c, inner_top - 4, bottom)
        footer(c, d)
        c.restoreState()

    doc.addPageTemplates([
        PageTemplate(id="front", frames=[lead_frame] + front_cols, onPage=draw_front),
        PageTemplate(id="inner", frames=inner_cols, onPage=draw_inner),
    ])

    story = [NextPageTemplate("inner")]

    if not articles:
        story += [
            Spacer(1, 25 * mm),
            RTLParagraph("لا توجد أخبار عن الرحامنة في الفترة المحددة", font=HEAD, size=24,
                         leading=36, align="center"),
            Spacer(1, 4 * mm),
            RTLParagraph("قم بتحديث الأخبار من التطبيق ثم أعد إنشاء الجريدة، أو وسّع الفترة الزمنية.",
                         font=BODY, size=12, align="center", color=MUTED),
        ]
        doc.build(story)
        return buf.getvalue()

    # ---------------- Lead story ----------------
    lead = articles[0]
    lead_w = PAGE_W - 2 * MARGIN
    lead_body = article_body(lead)
    long_title = len(strip_html(lead["title"])) > 62
    lead_flow = [
        Spacer(1, 2 * mm),
        Kicker(lead.get("category") or "الحدث", filled=True, size=9),
        Spacer(1, 1 * mm),
        RTLParagraph(strip_html(lead["title"]), font=HEAD, size=24 if long_title else 29,
                     leading=36 if long_title else 43, align="right", color=INK),
        RTLParagraph(_deck(lead_body), font=BODY_B, size=12, leading=20,
                     align="right", color=MUTED),
        Spacer(1, 2.5 * mm),
    ]
    text_w = COL_W
    img_w = lead_w - text_w - GUTTER
    deck = _deck(lead_body)
    rest = lead_body
    if rest.startswith(deck.rstrip("…")):
        rest = rest[len(deck.rstrip("…")):].strip() or lead_body
    lead_text = [
        RTLParagraph(_meta(lead), font=UI, size=8, color=ACCENT, align="right"),
        Spacer(1, 1.5 * mm),
        _fit_height(RTLParagraph(rest, font=BODY, size=10, leading=16.5, color=BODY_INK),
                    COL_W, 66 * mm - 14),
    ]
    if lead.get("_photo"):
        tbl = Table(
            [[KeepInFrame(text_w, 70 * mm, lead_text, mode="truncate"),
              Photo(lead["_photo"], 66 * mm, caption=f"المصدر: {lead.get('source') or ''}")]],
            colWidths=[text_w + GUTTER, img_w],
        )
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), GUTTER),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LINEAFTER", (0, 0), (0, 0), 0.5, HAIR),
        ]))
        lead_flow.append(tbl)
    else:
        lead_flow += lead_text
    story.append(KeepInFrame(lead_w, LEAD_H - 2, lead_flow, mode="shrink"))
    story.append(FrameBreak())

    # ---------------- Editorial ("generated article") ----------------
    editorial = editorial or default_editorial(articles, days)
    story += [
        SectionBar("افتتاحية العدد"),
        Spacer(1, 2 * mm),
        RTLParagraph(editorial, font=BODY, size=9.8, leading=16, color=BODY_INK),
        Spacer(1, 1 * mm),
        EndMark(),
    ]

    # ---------------- Index box ----------------
    others = articles[1:8]
    if others:
        items = [SectionBar("في هذا العدد", color=ACCENT), Spacer(1, 2 * mm)]
        for n, a in enumerate(others, start=1):
            items.append(RTLParagraph(f"{n}. {clip(strip_html(a['title']), 70)}",
                                      font=UI_B, size=8.6, leading=13, align="right", color=INK))
            items.append(Spacer(1, 1.2 * mm))
        story += [KeepTogether([_boxed(items, COL_W, pad=0)]), Spacer(1, 4 * mm)]

    # ---------------- Other stories ----------------
    for i, a in enumerate(articles[1:], start=1):
        body = article_body(a)
        big = i <= 3
        head = [
            Kicker(a.get("category") or ""),
            RTLParagraph(strip_html(a["title"]), font=HEAD2,
                         size=14.5 if big else 12.5, leading=22 if big else 19,
                         align="right", color=INK),
            Spacer(1, 0.8 * mm),
            RTLParagraph(_meta(a), font=UI, size=7.6, color=MUTED, align="right"),
            Spacer(1, 1.8 * mm),
        ]
        if a.get("_photo"):
            head.append(Photo(a["_photo"], COL_W * (0.68 if i <= 6 else 0.58)))
            head.append(Spacer(1, 1 * mm))
        story.append(CondFrameBreak(48 * mm))
        story.append(KeepTogether(head))
        story.append(RTLParagraph(clip(body, 1200 if big else 750), font=BODY,
                                  size=9.6, leading=15.6, color=BODY_INK))
        story.append(Spacer(1, 1 * mm))
        story.append(EndMark())
        story.append(Spacer(1, 1.5 * mm))

    doc.build(story)
    return buf.getvalue()


def _meta(a: dict) -> str:
    when = parse_pub_date(a.get("pubDate"))
    when_txt = f"{when.day} {ARABIC_MONTHS[when.month - 1]} • {when:%H:%M}" if when else ""
    src = a.get("source") or ""
    # Date first: keeps numbers in Arabic context so bidi ordering stays natural.
    return " | ".join(x for x in (when_txt, src) if x)


class CondFrameBreak(Flowable):
    """Jump to the next column if less than `need` points are left."""

    def __init__(self, need):
        super().__init__()
        self.need = need

    def wrap(self, aw, ah):
        self.width = aw
        self.height = 0 if ah >= self.need else ah + 1
        return aw, self.height

    def split(self, aw, ah):
        return []

    def draw(self):
        pass


# --------------------------------------------------------------------------
# AI editorial (optional)
# --------------------------------------------------------------------------

def ai_editorial(articles: list[dict], summarize_fn) -> str | None:
    """Ask the configured LLM to write one article from all the stories."""
    if not summarize_fn or not articles:
        return None
    digest = "\n\n".join(
        f"- {strip_html(a['title'])}: {clip(article_body(a), 350)}" for a in articles[:15]
    )
    try:
        return summarize_fn(digest)
    except Exception:
        return None
