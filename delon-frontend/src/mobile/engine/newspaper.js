// On-device Rehamna front-page newspaper (jsPDF port of newspaper_pdf.py).
import { jsPDF } from "jspdf";
import bidiFactory from "bidi-js";
import { Capacitor } from "@capacitor/core";
import { fetchImageDataUrl, fetchText } from "./http";
import { stripHtml, normalizeArabic, rehamnaMatches } from "./classify";

import fKufiBlack from "../fonts/NotoKufiArabic-Black.ttf";
import fKufiBold from "../fonts/NotoKufiArabic-Bold.ttf";
import fKufiMed from "../fonts/NotoKufiArabic-Medium.ttf";
import fNaskh from "../fonts/NotoNaskhArabic-Regular.ttf";
import fNaskhSemi from "../fonts/NotoNaskhArabic-SemiBold.ttf";

// We shape + reorder Arabic ourselves; disable jsPDF's own (incomplete) passes.
jsPDF.API.events = jsPDF.API.events.filter(
  ([, fn]) => fn !== jsPDF.API.processArabic && !String(fn).includes("doBidiReorder")
);

const bidi = bidiFactory();
const FONTS = {
  MAST: ["KufiBlack", fKufiBlack, "NotoKufiArabic-Black.ttf"],
  HEAD: ["KufiBold", fKufiBold, "NotoKufiArabic-Bold.ttf"],
  UI: ["KufiMed", fKufiMed, "NotoKufiArabic-Medium.ttf"],
  BODY: ["Naskh", fNaskh, "NotoNaskhArabic-Regular.ttf"],
  BODY_B: ["NaskhSemi", fNaskhSemi, "NotoNaskhArabic-SemiBold.ttf"],
};
const MAST = "KufiBlack", HEAD = "KufiBlack", HEAD2 = "KufiBold", UI = "KufiMed", UI_B = "KufiBold";
const BODY = "Naskh", BODY_B = "NaskhSemi";

const INK = [20, 20, 20], BODY_INK = [38, 38, 38], MUTED = [107, 107, 107];
const HAIR = [201, 196, 186], ACCENT = [180, 22, 27], TINT = [243, 238, 228], WHITE = [255, 255, 255];

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"];
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const arabicDate = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

// ---------- fonts ----------
let fontCache = null;
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function loadFonts() {
  if (fontCache) return fontCache;
  const entries = await Promise.all(
    Object.values(FONTS).map(async ([name, url, file]) => [name, file, toBase64(await (await fetch(url)).arrayBuffer())])
  );
  fontCache = entries;
  return entries;
}

// ---------- Arabic text ----------
export function visual(text) {
  const clean = String(text || "").replace(/[ً-ْـ]/g, "");
  const shaped = jsPDF.API.processArabic(clean);
  const levels = bidi.getEmbeddingLevels(shaped, "rtl");
  const chars = shaped.split("");
  bidi.getMirroredCharactersMap(shaped, levels).forEach((rep, i) => (chars[i] = rep));
  bidi.getReorderSegments(shaped, levels).forEach(([s, e]) => {
    const seg = chars.slice(s, e + 1).reverse();
    chars.splice(s, e - s + 1, ...seg);
  });
  return chars.join("");
}

function clip(text, limit) {
  text = (text || "").trim();
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit);
  const sp = cut.lastIndexOf(" ");
  if (sp > limit * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[،,.؛:\s]+$/, "") + "…";
}

// ---------- page geometry (pt) ----------
const PW = 595.28, PH = 841.89, M = 31, G = 17, NC = 3;
const CW = (PW - 2 * M - (NC - 1) * G) / NC;
const colX = (i) => PW - M - (i + 1) * CW - i * G;
const BOTTOM = PH - M - 23;

// ---------- blocks ----------
class Text {
  constructor(text, { font = BODY, size = 9.6, leading, color = BODY_INK, align = "justify" } = {}, lines) {
    Object.assign(this, { text: text || "", font, size, leading: leading || size * 1.62, color, align });
    this._lines = lines || null;
    this._w = null;
  }
  layout(doc, w) {
    if (this._lines && this._w === w) return this._lines;
    doc.setFont(this.font, "normal");
    doc.setFontSize(this.size);
    const space = doc.getTextWidth(" ");
    const lines = [];
    for (const para of this.text.split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = [], cw = 0;
      for (const word of words) {
        const ww = doc.getTextWidth(visual(word));
        const add = cur.length ? space + ww : ww;
        if (cur.length && cw + add > w) {
          lines.push([cur, false]);
          cur = [word];
          cw = ww;
        } else {
          cur.push(word);
          cw += add;
        }
      }
      if (cur.length) lines.push([cur, true]);
    }
    this._lines = lines;
    this._w = w;
    return lines;
  }
  measure(doc, w) {
    return this.layout(doc, w).length * this.leading;
  }
  split(doc, w, avail) {
    const lines = this.layout(doc, w);
    const n = Math.floor(avail / this.leading);
    if (n < 1 || n >= lines.length) return null;
    const opts = { font: this.font, size: this.size, leading: this.leading, color: this.color, align: this.align };
    const a = new Text(this.text, opts, lines.slice(0, n));
    const b = new Text(this.text, opts, lines.slice(n));
    a._w = b._w = w;
    return [a, b];
  }
  draw(doc, x, y, w) {
    const lines = this.layout(doc, w);
    doc.setFont(this.font, "normal");
    doc.setFontSize(this.size);
    doc.setTextColor(...this.color);
    lines.forEach(([words, end], i) => {
      const base = y + i * this.leading + this.leading / 2 + this.size * 0.33;
      const vis = visual(words.join(" "));
      if (this.align === "center") doc.text(vis, x + w / 2, base, { align: "center" });
      else if (this.align === "justify" && !end && words.length > 1) {
        const parts = vis.split(" ");
        const widths = parts.map((p) => doc.getTextWidth(p));
        const gap = (w - widths.reduce((s, v) => s + v, 0)) / (parts.length - 1);
        let cx = x;
        parts.forEach((p, k) => {
          doc.text(p, cx, base);
          cx += widths[k] + gap;
        });
      } else doc.text(vis, x + w, base, { align: "right" });
    });
  }
}

class Space {
  constructor(h) { this.h = h; }
  measure() { return this.h; }
  draw() {}
}

class Kicker {
  constructor(text, filled = false, size = 8) { Object.assign(this, { text, filled, size }); }
  measure() { return this.text ? this.size + 9 : 0; }
  draw(doc, x, y, w) {
    if (!this.text) return;
    doc.setFont(UI_B, "normal");
    doc.setFontSize(this.size);
    const vis = visual(this.text);
    const tw = doc.getTextWidth(vis);
    if (this.filled) {
      doc.setFillColor(...ACCENT);
      doc.rect(x + w - tw - 12, y + 1, tw + 12, this.size + 6, "F");
      doc.setTextColor(...WHITE);
      doc.text(vis, x + w - 6, y + this.size + 2.6, { align: "right" });
    } else {
      doc.setFillColor(...ACCENT);
      doc.rect(x + w - 3, y + 3, 3, this.size + 1, "F");
      doc.setTextColor(...ACCENT);
      doc.text(vis, x + w - 7, y + this.size + 2.6, { align: "right" });
    }
  }
}

class Photo {
  constructor(data, h) { Object.assign(this, { data, h }); }
  measure() { return this.h + 4; }
  draw(doc, x, y, w) {
    try {
      doc.addImage(this.data, "JPEG", x, y, w, this.h, undefined, "FAST");
    } catch (_) {
      doc.setFillColor(...TINT);
      doc.rect(x, y, w, this.h, "F");
    }
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.4);
    doc.rect(x, y, w, this.h, "S");
  }
}

class EndMark {
  measure() { return 14; }
  draw(doc, x, y, w) {
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.6);
    doc.line(x, y + 9, x + w, y + 9);
    doc.setFillColor(...ACCENT);
    doc.rect(x + w / 2 - 2.5, y + 6.5, 5, 5, "F");
  }
}

class SectionBar {
  constructor(text, color = INK) { Object.assign(this, { text, color }); }
  measure() { return 21; }
  draw(doc, x, y, w) {
    doc.setFillColor(...this.color);
    doc.rect(x, y, w, 20, "F");
    doc.setFillColor(...(this.color === ACCENT ? INK : ACCENT));
    doc.rect(x + w - 5, y, 5, 20, "F");
    doc.setFont(HEAD2, "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...WHITE);
    doc.text(visual(this.text), x + w - 11, y + 13.5, { align: "right" });
  }
}

class Box {
  constructor(children, pad = 7) { Object.assign(this, { children, pad }); }
  measure(doc, w) {
    return this.children.reduce((s, c) => s + c.measure(doc, w - 2 * this.pad), 0) + this.pad + 4;
  }
  draw(doc, x, y, w) {
    doc.setFillColor(...TINT);
    doc.rect(x, y, w, this.measure(doc, w) - 4, "F");
    let cy = y;
    this.children.forEach((c, i) => {
      const full = c instanceof SectionBar;
      const cx = full ? x : x + this.pad;
      const cw = full ? w : w - 2 * this.pad;
      c.draw(doc, cx, cy, cw);
      cy += c.measure(doc, cw);
    });
  }
}

class Group {
  constructor(children) { this.children = children; }
  measure(doc, w) { return this.children.reduce((s, c) => s + c.measure(doc, w), 0); }
  draw(doc, x, y, w) {
    let cy = y;
    for (const c of this.children) {
      c.draw(doc, x, cy, w);
      cy += c.measure(doc, w);
    }
  }
}

class CondBreak {
  constructor(need) { this.need = need; }
}

// ---------- photos ----------
const firstImg = (html) => {
  const m = (html || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
};

async function ogImage(link) {
  try {
    const html = (await fetchText(link, 10000)).slice(0, 300000);
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

async function cropJpeg(dataUrl, ratio) {
  try {
    const img = await loadImage(dataUrl);
    if (Math.min(img.naturalWidth, img.naturalHeight) < 120) return null;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (sw / sh > ratio) {
      const nw = sh * ratio;
      sx = (sw - nw) / 2;
      sw = nw;
    } else {
      const nh = sw / ratio;
      sy = Math.max(0, (sh - nh) / 3);
      sh = nh;
    }
    const outW = Math.min(1100, sw);
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = Math.round(outW / ratio);
    c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } catch (_) {
    return null;
  }
}

async function fetchPhoto(a) {
  for (const u of [a.image_url, firstImg(a.description)]) {
    if (u && u !== "No Image") {
      const d = await fetchImageDataUrl(u);
      if (d) return d;
    }
  }
  const og = a.link ? await ogImage(a.link) : null;
  return og ? fetchImageDataUrl(og) : null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

// ---------- data ----------
export function collect(articles, terms, days = 1, limit = 40) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  const seen = new Set();
  return articles
    .filter((a) => new Date(a.savedAt || a.pubDate) >= since)
    .map((a) => {
      const hits = rehamnaMatches(`${a.title} ${stripHtml(a.description)} ${a.content || ""} ${a.matched_places || ""}`, terms);
      return { a, hits, score: rehamnaMatches(a.title, terms).length * 3 + hits.length };
    })
    .filter(({ a, hits }) => {
      const k = normalizeArabic(a.title).slice(0, 80);
      if (!hits.length || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

const bodyOf = (a) => {
  for (const k of ["summary", "content", "description"]) {
    const t = stripHtml(a[k] || "");
    if (t.length > 60) return t;
  }
  return stripHtml(a.description || a.content || "");
};

function deck(text, limit = 190) {
  let out = "";
  for (const s of text.trim().split(/(?<=[.!؟?])\s+/)) {
    if (out && out.length + s.length > limit) break;
    out = `${out} ${s}`.trim();
  }
  return clip(out, limit);
}

export function defaultEditorial(arts, days) {
  const sources = new Set(arts.map((a) => a.source).filter(Boolean));
  const cats = {};
  arts.forEach((a) => (cats[a.category || "مختلفات"] = (cats[a.category || "مختلفات"] || 0) + 1));
  const period = days <= 1 ? "اليوم" : `خلال آخر ${days} أيام`;
  const catTxt = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} في ${c}`).join("، ");
  const heads = arts.slice(1, 4).map((a) => clip(stripHtml(a.title), 70)).join("؛ ");
  let t = `رصدت هذه النشرة ${arts.length} خبرا يتعلق بإقليم الرحامنة ${period}، نشرتها ${sources.size} من المنابر الإعلامية، وتتوزع على النحو التالي: ${catTxt}. `;
  if (arts.length) {
    t += `ويتصدر العدد خبر «${clip(stripHtml(arts[0].title), 90)}»`;
    t += heads ? `، إلى جانب مواضيع أخرى من بينها: ${heads}.` : ".";
  }
  return t;
}

const meta = (a) => {
  const d = new Date(a.pubDate);
  const when = isNaN(d) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} • ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return [when, a.source].filter(Boolean).join(" | ");
};

// ---------- build ----------
export async function buildNewspaper(articles, { days = 1, editorial, title = "أخبار الرحامنة", onProgress } = {}) {
  const fonts = await loadFonts();
  const step = (msg, p) => onProgress && onProgress(msg, p);

  step("Downloading photos…", 0.1);
  let done = 0;
  const photos = await mapLimit(articles, 6, async (a) => {
    const p = await fetchPhoto(a);
    step("Downloading photos…", 0.1 + (0.6 * ++done) / Math.max(1, articles.length));
    return p;
  });
  articles = articles.map((a, i) => ({ ...a, _photo: photos[i] }));
  const li = articles.findIndex((a) => a._photo);
  if (li > 0) articles.unshift(articles.splice(li, 1)[0]);

  step("Laying out pages…", 0.75);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  fonts.forEach(([name, file, b64]) => {
    doc.addFileToVFS(file, b64);
    doc.addFont(file, name, "normal");
  });
  doc.setProperties({ title, author: "Delon", subject: "Rehamna news digest" });

  const now = new Date();
  const issueNo = Math.max(1, Math.floor((now - new Date(2024, 0, 1)) / 86400000));
  const sources = new Set(articles.map((a) => a.source).filter(Boolean)).size;

  const txt = (s, x, y, font, size, color, align = "right") => {
    doc.setFont(font, "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(visual(s), x, y, { align });
  };

  const footer = (page) => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.8);
    doc.line(M, PH - M - 14, PW - M, PH - M - 14);
    txt(`${title} • ${arabicDate(now)}`, PW - M, PH - M - 3, UI, 7, MUTED);
    doc.setFont(UI_B, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(String(page), PW / 2, PH - M - 3, { align: "center" });
    doc.setFont(UI, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("Delon", M, PH - M - 3);
  };
  const columnRules = (top) => {
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.5);
    for (let i = 1; i < NC; i++) {
      const x = PW - M - i * CW - (i - 0.5) * G;
      doc.line(x, top, x, BOTTOM);
    }
  };

  // ----- masthead -----
  const top = M;
  txt("جريدة إلكترونية تجمع كل ما يُنشر عن إقليم الرحامنة", PW - M, top + 7, UI, 7.5, MUTED);
  txt(days <= 1 ? "العدد اليومي" : `حصيلة آخر ${days} أيام`, M, top + 7, UI, 7.5, MUTED, "left");
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(M, top + 12, PW - M, top + 12);

  const earW = 102, earH = 60, earY = top + 18;
  doc.setFillColor(...ACCENT);
  doc.rect(PW - M - earW, earY, earW, earH, "F");
  txt(DAYS[now.getDay()], PW - M - earW / 2, earY + 23, HEAD2, 12, WHITE, "center");
  txt(`${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`, PW - M - earW / 2, earY + 44, UI_B, 9, WHITE, "center");
  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  doc.rect(M, earY, earW, earH, "S");
  txt(`العدد ${issueNo}`, M + earW / 2, earY + 23, HEAD2, 12, INK, "center");
  txt(`${articles.length} خبرا من ${sources} مصادر`, M + earW / 2, earY + 44, UI, 8, MUTED, "center");

  let size = 46;
  doc.setFont(MAST, "normal");
  doc.setFontSize(size);
  while (doc.getTextWidth(visual(title)) > PW - 2 * M - 2 * earW - 24 && size > 26) doc.setFontSize(--size);
  txt(title, PW / 2, earY + earH - 12, MAST, size, INK, "center");

  let y = earY + earH + 6;
  doc.setLineWidth(2.6);
  doc.line(M, y, PW - M, y);
  doc.setLineWidth(0.6);
  doc.line(M, y + 3.5, PW - M, y + 3.5);

  // ticker
  y += 9;
  doc.setFillColor(...INK);
  doc.rect(M, y, PW - 2 * M, 16, "F");
  doc.setFont(UI_B, "normal");
  doc.setFontSize(8);
  const label = "عناوين العدد";
  const lw = doc.getTextWidth(visual(label)) + 14;
  doc.setFillColor(...ACCENT);
  doc.rect(PW - M - lw, y, lw, 16, "F");
  txt(label, PW - M - 7, y + 11, UI_B, 8, WHITE);
  let ticker = articles.slice(1, 4).map((a) => clip(stripHtml(a.title), 55));
  doc.setFont(UI, "normal");
  doc.setFontSize(7.8);
  while (ticker.length && doc.getTextWidth(visual(ticker.join("   •   "))) > PW - 2 * M - lw - 14) ticker.pop();
  if (ticker.length) txt(ticker.join("   •   "), PW - M - lw - 8, y + 11, UI, 7.8, WHITE);
  y += 22;

  if (!articles.length) {
    txt("لا توجد أخبار عن الرحامنة في الفترة المحددة", PW / 2, y + 120, HEAD, 20, INK, "center");
    txt("قم بتحديث الأخبار ثم أعد إنشاء الجريدة، أو وسّع الفترة الزمنية.", PW / 2, y + 150, BODY, 12, MUTED, "center");
    footer(1);
    return doc;
  }

  // ----- lead story -----
  const lead = articles[0];
  const LW = PW - 2 * M;
  new Kicker(lead.category || "الحدث", true, 8.5).draw(doc, M, y, LW);
  y += 20;
  const leadTitle = stripHtml(lead.title);
  const ht = new Text(leadTitle, { font: HEAD, size: leadTitle.length > 62 ? 19 : 23, leading: leadTitle.length > 62 ? 31 : 37, color: INK, align: "right" });
  ht.layout(doc, LW);
  if (ht._lines.length > 2) ht._lines = ht._lines.slice(0, 2);
  ht.draw(doc, M, y, LW);
  y += ht.measure(doc, LW) + 2;
  const body0 = bodyOf(lead);
  const dk = deck(body0);
  const dt = new Text(dk, { font: BODY_B, size: 11, leading: 18, color: MUTED, align: "right" });
  dt.layout(doc, LW);
  dt._lines = dt._lines.slice(0, 2);
  dt.draw(doc, M, y, LW);
  y += dt.measure(doc, LW) + 8;

  const imgH = 178;
  const imgW = LW - CW - G;
  let rest = body0;
  if (rest.startsWith(dk.replace(/…$/, ""))) rest = rest.slice(dk.replace(/…$/, "").length).trim() || body0;
  if (lead._photo) {
    const cropped = await cropJpeg(lead._photo, imgW / imgH);
    if (cropped) new Photo(cropped, imgH).draw(doc, M + CW + G, y, imgW);
    txt(`المصدر: ${lead.source || ""}`, PW - M, y + imgH + 10, UI, 7, MUTED);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.5);
    doc.line(M + CW + G / 2, y, M + CW + G / 2, y + imgH);
  }
  const textW = lead._photo ? CW : LW;
  txt(meta(lead), M + textW, y + 8, UI, 7.5, ACCENT);
  const lt = new Text(rest, { font: BODY, size: 9.8, leading: 16 });
  lt.layout(doc, textW);
  const maxLines = Math.floor((imgH - 14) / 16);
  if (lt._lines.length > maxLines) {
    lt._lines = lt._lines.slice(0, maxLines);
    const last = lt._lines[maxLines - 1][0];
    last[last.length - 1] = last[last.length - 1].replace(/[،,.]+$/, "") + "…";
    lt._lines[maxLines - 1][1] = true;
  }
  lt.draw(doc, M, y + 14, textW);
  y += imgH + 18;

  // ----- columns flow -----
  let page = 1, col = 0, colTop = y, cy = y;
  columnRules(colTop);
  footer(1);

  const nextCol = () => {
    col++;
    if (col >= NC) {
      doc.addPage();
      page++;
      col = 0;
      // inner page header
      txt(title, PW - M, M + 18, MAST, 18, INK);
      txt(arabicDate(now), M, M + 14, UI, 8, MUTED, "left");
      txt(`العدد ${issueNo}`, PW / 2, M + 14, UI_B, 8, ACCENT, "center");
      doc.setDrawColor(...INK);
      doc.setLineWidth(2.2);
      doc.line(M, M + 28, PW - M, M + 28);
      doc.setLineWidth(0.5);
      doc.line(M, M + 31, PW - M, M + 31);
      colTop = M + 40;
      columnRules(colTop);
      footer(page);
    }
    cy = colTop;
  };

  const place = (b) => {
    if (b instanceof CondBreak) {
      if (BOTTOM - cy < b.need && cy > colTop + 1) nextCol();
      return;
    }
    const h = b.measure(doc, CW);
    if (cy + h <= BOTTOM) {
      b.draw(doc, colX(col), cy, CW);
      cy += h;
      return;
    }
    if (b.split) {
      const parts = b.split(doc, CW, BOTTOM - cy);
      if (parts) {
        parts[0].draw(doc, colX(col), cy, CW);
        nextCol();
        place(parts[1]);
        return;
      }
    }
    if (cy > colTop + 1) {
      nextCol();
      place(b);
    } else {
      b.draw(doc, colX(col), cy, CW);
      cy += h;
    }
  };

  // editorial
  place(new SectionBar("افتتاحية العدد"));
  place(new Space(5));
  place(new Text(editorial || defaultEditorial(articles, days), { font: BODY, size: 9.4, leading: 15.5 }));
  place(new EndMark());

  // index
  const others = articles.slice(1, 8);
  if (others.length) {
    const items = [new SectionBar("في هذا العدد", ACCENT), new Space(5)];
    others.forEach((a, i) => {
      items.push(new Text(`${i + 1}. ${clip(stripHtml(a.title), 70)}`, { font: UI_B, size: 7.8, leading: 13, color: INK, align: "right" }));
      items.push(new Space(3));
    });
    place(new Box(items, 7));
    place(new Space(10));
  }

  // stories
  for (let i = 1; i < articles.length; i++) {
    const a = articles[i];
    const big = i <= 3;
    const head = [
      new Kicker(a.category || ""),
      new Text(stripHtml(a.title), { font: HEAD2, size: big ? 12.5 : 11, leading: big ? 21 : 18.5, color: INK, align: "right" }),
      new Space(2),
      new Text(meta(a), { font: UI, size: 6.8, leading: 11, color: MUTED, align: "right" }),
      new Space(5),
    ];
    if (a._photo) {
      const h = CW * (i <= 6 ? 0.66 : 0.56);
      const cropped = await cropJpeg(a._photo, CW / h);
      if (cropped) head.push(new Photo(cropped, h), new Space(3));
    }
    place(new CondBreak(130));
    place(new Group(head));
    place(new Text(clip(bodyOf(a), big ? 1200 : 750), { font: BODY, size: 9.2, leading: 15 }));
    place(new Space(3));
    place(new EndMark());
    place(new Space(4));
    step("Laying out pages…", 0.75 + (0.2 * i) / articles.length);
  }
  step("Done", 1);
  return doc;
}

/** Save the PDF: share sheet on the phone, download in the browser. */
export async function savePdf(doc, filename) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const b64 = doc.output("datauristring").split(",")[1];
    const res = await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache });
    try {
      await Filesystem.writeFile({ path: `Delon/${filename}`, data: b64, directory: Directory.Documents, recursive: true });
    } catch (_) {}
    await Share.share({ title: filename, url: res.uri, dialogTitle: "Open or save the newspaper" });
    return res.uri;
  }
  doc.save(filename);
  return filename;
}
