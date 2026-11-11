// JavaScript port of the backend's keyword logic (main.py): place/keyword
// filter, EnhancedClassifier, title de-duplication and category balancing.
import classifier from "../../data/classifier.json";
import placesData from "../../data/places.json";
import keywordsData from "../../data/keywords.json";
import rehamnaData from "../../data/rehamna.json";

export const CATEGORIES = ["شؤون جهوية", "شؤون أمنية", "شؤون سياسية", "مجالس منتخبة", "مختلفات"];

export const DEFAULT_PLACES = placesData.keywords || [];
export const DEFAULT_KEYWORDS = keywordsData.keywords || [];
export const DEFAULT_REHAMNA = rehamnaData.terms || [];

// ---------- text helpers ----------
export function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/The post .*? appeared first on .*$/i, "")
    .replace(/ظهرت المقالة .*? أولاً على .*$/, "")
    .replace(/[ \t\r\f\v]+/g, " ")
    .trim();
}

export function normalizeArabic(text) {
  return (text || "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ً-ْـ]/g, "")
    .toLowerCase();
}

// ---------- place + keyword filter (contains_keywords) ----------
export function matchPlacesKeywords(text, places, keywords) {
  const t = text.toLowerCase();
  const mp = places.filter((p) => p && t.includes(p.toLowerCase()));
  const mk = keywords.filter((k) => k && t.includes(k.toLowerCase()));
  return mp.length && mk.length ? { places: mp, keywords: mk } : { places: [], keywords: [] };
}

export function rehamnaMatches(text, terms) {
  const n = normalizeArabic(text);
  return terms.filter((t) => n.includes(normalizeArabic(t)));
}

// ---------- EnhancedClassifier ----------
const compiled = Object.fromEntries(
  Object.entries(classifier.patterns).map(([cat, pats]) => [cat, pats.map((p) => new RegExp(p, "gi"))])
);
const compiledWeights = Object.fromEntries(
  Object.entries(classifier.weights).map(([cat, kw]) => [
    cat,
    Object.entries(kw).map(([k, w]) => [new RegExp(k, "i"), w]),
  ])
);
const cityRe = new RegExp(classifier.city, "i");

function cleanForClassify(text) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/http\S+|www\S+/g, "")
    .replace(/[^\w\s؀-ۿ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classify(text) {
  if (!text || !text.trim()) return "مختلفات";
  const cleaned = cleanForClassify(text);
  if (!cleaned) return "مختلفات";
  const scores = {};
  for (const cat of Object.keys(compiled)) {
    let score = 0;
    for (const re of compiled[cat]) {
      re.lastIndex = 0;
      score += (cleaned.match(re) || []).length;
    }
    for (const [re, w] of compiledWeights[cat] || []) if (re.test(cleaned)) score += w;
    if (cat === "شؤون جهوية" && cityRe.test(cleaned)) score += 5;
    scores[cat] = score;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] >= 4 && !(sorted.length > 1 && sorted[0][1] - sorted[1][1] < 2)) return sorted[0][0];
  return "مختلفات";
}

// ---------- similarity de-duplication (TF-IDF cosine on titles) ----------
function tokens(t) {
  const words = normalizeArabic(t).replace(/[^\w\s؀-ۿ]/g, " ").split(/\s+/).filter(Boolean);
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}

export function removeSimilar(articles, threshold = 0.25) {
  if (articles.length < 2) return articles;
  const docs = articles.map((a) => tokens(a.title.slice(0, 900)));
  const df = new Map();
  docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length;
  const vecs = docs.map((d) => {
    const tf = new Map();
    d.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    const v = new Map();
    let norm = 0;
    tf.forEach((c, w) => {
      const x = c * (Math.log((1 + N) / (1 + df.get(w))) + 1);
      v.set(w, x);
      norm += x * x;
    });
    norm = Math.sqrt(norm) || 1;
    v.forEach((x, w) => v.set(w, x / norm));
    return v;
  });
  const cos = (a, b) => {
    let s = 0;
    const [small, big] = a.size < b.size ? [a, b] : [b, a];
    small.forEach((x, w) => {
      const y = big.get(w);
      if (y) s += x * y;
    });
    return s;
  };
  const used = new Set();
  const out = [];
  for (let i = 0; i < articles.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < articles.length; j++) {
      if (!used.has(j) && cos(vecs[i], vecs[j]) > threshold) {
        group.push(j);
        used.add(j);
      }
    }
    used.add(i);
    out.push(group.map((k) => articles[k]).reduce((best, a) => ((a.content || "").length > (best.content || "").length ? a : best)));
  }
  return out;
}

// ---------- balance_categories ----------
export function balanceCategories(unique, pool, min = 5) {
  const counts = {};
  unique.forEach((a) => (counts[a.category] = (counts[a.category] || 0) + 1));
  const out = [...unique];
  const seen = new Set(out.map((a) => a.id));
  for (const cat of CATEGORIES) {
    let need = min - (counts[cat] || 0);
    for (const a of pool) {
      if (need <= 0) break;
      if (a.category === cat && !seen.has(a.id)) {
        out.push(a);
        seen.add(a.id);
        need--;
      }
    }
  }
  return out;
}
