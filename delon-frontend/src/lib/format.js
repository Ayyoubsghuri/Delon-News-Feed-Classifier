export function parseDate(value) {
  if (!value) return null;
  // SQLite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS" in UTC
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

export function timeAgo(value) {
  const d = parseDate(value);
  if (!d) return "";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const units = [
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let n = s / 60;
  for (const [step, name] of units) {
    if (n < step) {
      const v = Math.floor(n);
      return `${v} ${name}${v === 1 ? "" : "s"} ago`;
    }
    n /= step;
  }
  return "";
}

export function isToday(value) {
  const d = parseDate(value);
  if (!d) return false;
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function stripHtml(html) {
  if (!html) return "";
  if (typeof DOMParser !== "undefined" && /<[a-z][\s\S]*>/i.test(html)) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }
  return String(html).replace(/\s+/g, " ").trim();
}

export function firstImage(article) {
  if (!article) return null;
  if (article.image_url && /^https?:/.test(article.image_url)) return article.image_url;
  for (const field of [article.description, article.content]) {
    const m = field && String(field).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return null;
}

// Split a long plain-text body into readable paragraphs.
export function toParagraphs(text) {
  const clean = stripHtml(text)
    .replace(/The post .*? appeared first on .*$/i, "")
    .replace(/ظهرت المقالة .*? أولاً على .*$/, "")
    .trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!؟?])\s+/);
  const out = [];
  let cur = "";
  for (const s of sentences) {
    cur = cur ? `${cur} ${s}` : s;
    if (cur.length > 320) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
};

export function faviconFor(source, link) {
  const host = (source && source.includes(".") ? source : hostOf(link)) || "";
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null;
}
