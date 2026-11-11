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
FONT_REGULAR = "Amiri"
FONT_BOLD = "Amiri-Bold"
_fonts_ready = False


def _register_fonts():
    global _fonts_ready
    if _fonts_ready:
        return
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, os.path.join(FONT_DIR, "Amiri-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, os.path.join(FONT_DIR, "Amiri-Bold.ttf")))
    _fonts_ready = True


# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#5b5b5b")
RULE = colors.HexColor("#1a1a1a")
ACCENT = colors.HexColor("#9b1c1c")
PAPER_TINT = colors.HexColor("#f4efe6")

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
    "الرحامنة", "رحامنة", "ابن جرير", "إبن جرير", "بن جرير", "بنجرير",
    "سيدي بوعثمان", "سيدي بوعتمان", "صخور الرحامنة", "صخورالرحامنة",
    "راس عين الرحامنة", "رأس العين الرحامنة", "عامل إقليم الرحامنة",
    "الجبيلات", "لبريكيين", "الجعافرة", "سكورة الحدرة", "انزالت لعظم",
    "أولاد املول", "سيدي علي لبراحلة", "أولاد حسون حمري", "بوشان",
    "rehamna", "rhamna", "benguerir", "ben guerir", "sidi bouothmane",
    "um6p",
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
        return pdfmetrics.stringWidth(arabic_reshaper.reshape(s), self.font, self.size)

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
            visual = get_display(arabic_reshaper.reshape(logical))
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
        c.setStrokeColor(colors.HexColor("#999999"))
        c.setLineWidth(0.3)
        c.rect(0, top - ih, self.width, ih, stroke=1, fill=0)
        if self.caption:
            c.setFillColor(MUTED)
            c.setFont(FONT_REGULAR, 7.5)
            c.drawRightString(self.width, top - ih - 10,
                              get_display(arabic_reshaper.reshape(clip(self.caption, 90))))


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
MARGIN = 12 * mm
GUTTER = 5 * mm
MASTHEAD_H = 50 * mm
LEAD_H = 118 * mm
INNER_HEAD_H = 14 * mm
N_COLS = 3


def _columns(top: float, bottom: float, prefix: str):
    width = (PAGE_W - 2 * MARGIN - (N_COLS - 1) * GUTTER) / N_COLS
    frames = []
    # RTL newspaper: the first column is the right-most one.
    for i in range(N_COLS):
        x = PAGE_W - MARGIN - (i + 1) * width - i * GUTTER
        frames.append(Frame(x, bottom, width, top - bottom, id=f"{prefix}{i}",
                            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0))
    return frames, width


def _shape(s):
    return get_display(arabic_reshaper.reshape(s))


def build_pdf(articles: list[dict], *, title: str = "أخبار الرحامنة",
              days: int = 1, editorial: str | None = None,
              issue_date: datetime | None = None) -> bytes:
    _register_fonts()
    issue_date = issue_date or datetime.now()

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

    content_top = PAGE_H - MARGIN - MASTHEAD_H
    lead_bottom = content_top - LEAD_H
    footer = MARGIN + 6 * mm
    lead_frame = Frame(MARGIN, lead_bottom, PAGE_W - 2 * MARGIN, LEAD_H, id="lead",
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    front_cols, col_w = _columns(lead_bottom - 4 * mm, footer, "f")
    inner_cols, _ = _columns(PAGE_H - MARGIN - INNER_HEAD_H, footer, "i")

    period = "عدد يومي" if days <= 1 else f"حصيلة آخر {days} أيام"
    sources = len({a.get("source") for a in articles if a.get("source")})

    def draw_masthead(c, d):
        c.saveState()
        c.setFillColor(colors.white)
        top = PAGE_H - MARGIN
        # Top info strip
        c.setFont(FONT_REGULAR, 8.5)
        c.setFillColor(MUTED)
        c.drawRightString(PAGE_W - MARGIN, top - 8, _shape(arabic_date(issue_date)))
        c.drawString(MARGIN, top - 8, _shape(f"{len(articles)} خبرا • {sources} مصدرا"))
        c.drawCentredString(PAGE_W / 2, top - 8, _shape(period))
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.line(MARGIN, top - 12, PAGE_W - MARGIN, top - 12)
        # Title
        c.setFillColor(INK)
        c.setFont(FONT_BOLD, 50)
        c.drawCentredString(PAGE_W / 2, top - 56, _shape(title))
        c.setFont(FONT_REGULAR, 10)
        c.setFillColor(MUTED)
        c.drawCentredString(PAGE_W / 2, top - 98,
                            _shape("نشرة إخبارية تجمع كل ما نشرته المواقع عن إقليم الرحامنة"))
        # Double rule
        y = top - MASTHEAD_H + 8
        c.setStrokeColor(RULE)
        c.setLineWidth(2.2)
        c.line(MARGIN, y + 3, PAGE_W - MARGIN, y + 3)
        c.setLineWidth(0.6)
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        _footer(c, d)
        c.restoreState()

    def draw_inner(c, d):
        c.saveState()
        top = PAGE_H - MARGIN
        c.setFillColor(INK)
        c.setFont(FONT_BOLD, 15)
        c.drawRightString(PAGE_W - MARGIN, top - 14, _shape(title))
        c.setFont(FONT_REGULAR, 8.5)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, top - 12, _shape(arabic_date(issue_date)))
        c.setStrokeColor(RULE)
        c.setLineWidth(1.4)
        c.line(MARGIN, top - 20, PAGE_W - MARGIN, top - 20)
        _footer(c, d)
        c.restoreState()

    def _footer(c, d):
        c.setFont(FONT_REGULAR, 8)
        c.setFillColor(MUTED)
        c.setStrokeColor(colors.HexColor("#bbbbbb"))
        c.setLineWidth(0.4)
        c.line(MARGIN, MARGIN + 3 * mm, PAGE_W - MARGIN, MARGIN + 3 * mm)
        c.drawCentredString(PAGE_W / 2, MARGIN, _shape(f"صفحة {d.page}"))
        c.drawString(MARGIN, MARGIN, "Delon")

    doc.addPageTemplates([
        PageTemplate(id="front", frames=[lead_frame] + front_cols, onPage=draw_masthead),
        PageTemplate(id="inner", frames=inner_cols, onPage=draw_inner),
    ])

    story = [NextPageTemplate("inner")]

    if not articles:
        story.append(RTLParagraph("لا توجد أخبار عن الرحامنة في الفترة المحددة.",
                                  font=FONT_BOLD, size=22, align="center"))
        story.append(Spacer(1, 6 * mm))
        story.append(RTLParagraph(
            "قم بتحديث الأخبار من التطبيق ثم أعد إنشاء النشرة، أو وسّع الفترة الزمنية.",
            size=12, align="center", color=MUTED))
        doc.build(story)
        return buf.getvalue()

    # ---------------- Lead story ----------------
    lead = articles[0]
    lead_w = PAGE_W - 2 * MARGIN
    lead_flow = [
        RTLParagraph(lead.get("category") or "", font=FONT_BOLD, size=10,
                     color=ACCENT, align="right"),
        RTLParagraph(strip_html(lead["title"]), font=FONT_BOLD,
                     size=25 if len(lead["title"]) < 60 else 21,
                     leading=32 if len(lead["title"]) < 60 else 27, align="right"),
        Spacer(1, 2 * mm),
    ]
    text_w = lead_w * 0.40
    img_w = lead_w - text_w - GUTTER
    lead_text = [
        RTLParagraph(_meta(lead), size=8.5, color=MUTED, align="right"),
        Spacer(1, 1.5 * mm),
        RTLParagraph(clip(article_body(lead), 900), size=11.5, leading=17),
    ]
    if lead.get("_photo"):
        tbl = Table(
            [[KeepInFrame(text_w, 80 * mm, lead_text, mode="truncate"),
              Photo(lead["_photo"], 74 * mm, caption=lead.get("source"))]],
            colWidths=[text_w, img_w + GUTTER],
        )
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (1, 0), (1, 0), GUTTER),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        lead_flow.append(tbl)
    else:
        lead_flow += lead_text
    story.append(KeepInFrame(lead_w, LEAD_H - 2, lead_flow, mode="truncate"))
    story.append(FrameBreak())

    # ---------------- Editorial ("generated article") ----------------
    editorial = editorial or default_editorial(articles, days)
    story += [
        _box_heading("افتتاحية العدد", col_w),
        Spacer(1, 1.5 * mm),
        RTLParagraph(editorial, size=10.5, leading=15.5),
        Spacer(1, 2 * mm),
        Rule(thickness=0.8),
    ]

    # ---------------- Index box ----------------
    index_lines = [f"• {clip(strip_html(a['title']), 60)}" for a in articles[1:9]]
    if index_lines:
        story += [
            _box_heading("في هذا العدد", col_w),
            Spacer(1, 1 * mm),
            RTLParagraph("\n".join(index_lines), size=9, leading=13, align="right"),
            Rule(thickness=0.8),
        ]

    # ---------------- Other stories ----------------
    for i, a in enumerate(articles[1:], start=1):
        head = [
            RTLParagraph(a.get("category") or "", font=FONT_BOLD, size=8.5,
                         color=ACCENT, align="right"),
            RTLParagraph(strip_html(a["title"]), font=FONT_BOLD,
                         size=15 if i <= 3 else 13, leading=20 if i <= 3 else 17,
                         align="right"),
            RTLParagraph(_meta(a), size=8, color=MUTED, align="right"),
            Spacer(1, 1.5 * mm),
        ]
        if a.get("_photo"):
            head.append(Photo(a["_photo"], col_w * (0.66 if i <= 6 else 0.56)))
        story.append(CondFrameBreak(42 * mm))
        story.append(KeepTogether(head))
        story.append(RTLParagraph(clip(article_body(a), 1100 if i <= 3 else 700),
                                  size=10, leading=14.5))
        if a.get("link"):
            story.append(RTLParagraph(f"المصدر: {a.get('source') or ''}", size=7.5,
                                      color=MUTED, align="right"))
        story.append(Rule(thickness=0.4, color=colors.HexColor("#888888"), space=5))

    doc.build(story)
    return buf.getvalue()


def _meta(a: dict) -> str:
    when = parse_pub_date(a.get("pubDate"))
    when_txt = when.strftime("%H:%M  %d/%m/%Y") if when else ""
    src = a.get("source") or ""
    return " • ".join(x for x in (src, when_txt) if x)


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


class _BoxHeading(Flowable):
    def __init__(self, text, width):
        super().__init__()
        self.text = text
        self.w = width

    def wrap(self, aw, ah):
        self.width = aw
        self.height = 18
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(INK)
        c.rect(0, 0, self.width, self.height, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(FONT_BOLD, 11)
        c.drawRightString(self.width - 5, 5, _shape(self.text))


def _box_heading(text, width):
    return _BoxHeading(text, width)


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
