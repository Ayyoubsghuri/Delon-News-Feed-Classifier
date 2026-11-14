// RSS/Atom fetching + parsing and the full "fetch-rss" pipeline, on the phone.
import linksData from "../../data/links.json";
import { fetchText } from "./http";
import {
  stripHtml, normalizeArabic, matchPlacesKeywords, classify, removeSimilar, balanceCategories,
  rehamnaMatches, DEFAULT_PLACES, DEFAULT_KEYWORDS, DEFAULT_REHAMNA,
} from "./classify";
import { getAllArticles, putArticles, kvGet, kvSet, pruneOlderThan } from "./store";

// ---------- settings ----------
export async function getFeeds() {
  const custom = await kvGet("feeds.custom", {});
  const removed = new Set(await kvGet("feeds.removed", []));
  const merged = { ...linksData, ...custom };
  return Object.fromEntries(Object.entries(merged).filter(([d]) => !removed.has(d)));
}

export async function removeFeed(domain) {
  const removed = new Set(await kvGet("feeds.removed", []));
  removed.add(domain);
  await kvSet("feeds.removed", [...removed]);
  const custom = await kvGet("feeds.custom", {});
  delete custom[domain];
  await kvSet("feeds.custom", custom);
}

export async function addFeed(input) {
  let url = input.trim();
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  const u = new URL(url);
  const domain = u.hostname.replace(/^www\./, "");
  const base = `${u.protocol}//${u.host}`;
  const candidates = [url, `${base}/feed`, `${base}/rss`, `${base}/rss.xml`, `${base}/feed.xml`, `${base}/atom.xml`, `${base}/index.xml`];
  for (const c of candidates) {
    try {
      const items = parseFeed(await fetchText(c, 12000));
      if (items.length) {
        const custom = await kvGet("feeds.custom", {});
        custom[domain] = [c];
        await kvSet("feeds.custom", custom);
        const removed = (await kvGet("feeds.removed", [])).filter((d) => d !== domain);
        await kvSet("feeds.removed", removed);
        return { ok: true, domain, feed: c, items: items.length };
      }
    } catch (_) {}
  }
  return { ok: false, domain };
}

// Rehamna words: the user's edited list, plus any new words added to the
// app's default list since they last saved it.
async function rehamnaTerms() {
  const saved = await kvGet("terms.rehamna", null);
  if (!saved) return DEFAULT_REHAMNA;
  const seen = await kvGet("terms.rehamna.defaults", []);
  const fresh = DEFAULT_REHAMNA.filter((t) => !seen.includes(t) && !saved.includes(t));
  if (fresh.length || seen.length !== DEFAULT_REHAMNA.length) {
    const merged = [...saved, ...fresh];
    await kvSet("terms.rehamna", merged);
    await kvSet("terms.rehamna.defaults", DEFAULT_REHAMNA);
    return merged;
  }
  return saved;
}

export async function saveRehamnaTerms(list) {
  await kvSet("terms.rehamna", list);
  await kvSet("terms.rehamna.defaults", DEFAULT_REHAMNA);
}

export const getTerms = async () => ({
  places: await kvGet("terms.places", DEFAULT_PLACES),
  keywords: await kvGet("terms.keywords", DEFAULT_KEYWORDS),
  rehamna: await rehamnaTerms(),
});

// ---------- parsing ----------
function sanitizeXml(text) {
  return text
    .replace(/^﻿/, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .trim();
}

const kids = (el, name) => Array.from(el.getElementsByTagName(name));

// Returns the parsed document and how much repair it needed:
// "clean" | "sanitized" (invalid characters / & fixed) | "html" (XML broken, read leniently)
function parseXmlDiag(text) {
  const p = new DOMParser();
  let doc = p.parseFromString(text, "text/xml");
  if (!doc.getElementsByTagName("parsererror").length) return { doc, mode: "clean" };
  doc = p.parseFromString(sanitizeXml(text), "text/xml");
  if (!doc.getElementsByTagName("parsererror").length) return { doc, mode: "sanitized" };
  // Very broken feeds: the HTML parser still finds <item>/<entry> tags.
  return { doc: p.parseFromString(text, "text/html"), mode: "html" };
}
const parseXml = (text) => parseXmlDiag(text).doc;

const looksLikeFeed = (text) => /<(rss|feed|rdf:RDF|channel)[\s>]/i.test((text || "").slice(0, 5000));

/** Explain why a feed URL works or not (same wording as the server). */
export function diagnoseFeedText(text) {
  if (!text || !text.trim()) return { level: "error", reason: "Empty response", items: 0 };
  if (!looksLikeFeed(text)) {
    return { level: "error", reason: /<html|<!doctype html/i.test(text.slice(0, 3000)) ? "Not an RSS feed (HTML page)" : "Not an RSS feed", items: 0 };
  }
  const { doc, mode } = parseXmlDiag(text);
  const items = (kids(doc, "item").length || kids(doc, "entry").length);
  if (mode === "html" && !items) return { level: "error", reason: "Broken XML", items: 0 };
  if (!items) return { level: "error", reason: "Feed is empty", items: 0 };
  if (mode === "sanitized") return { level: "warning", reason: "XML errors (repaired automatically)", items };
  if (mode === "html") return { level: "warning", reason: "Broken XML (partly recovered)", items };
  return { level: "ok", reason: "OK", items };
}

export function classifyFetchError(err) {
  const m = String((err && (err.message || err.code || err)) || "").toLowerCase();
  if (/ssl|certificat|certpath|trust anchor|handshake|tls/.test(m)) return "SSL certificate error";
  if (/timeout|timed out/.test(m)) return "Timeout (site too slow)";
  if (/unknownhost|unable to resolve|name not resolved|enotfound|no address associated/.test(m)) return "Site not found (DNS)";
  const h = m.match(/http (\d{3})/);
  if (h) return `HTTP ${h[1]} error`;
  if (/refused|reset|closed|eof/.test(m)) return "Connection refused";
  if (/failed to fetch|networkerror|cors/.test(m)) return "Blocked by the browser (CORS)";
  return "Network error";
}

async function checkUrl(src, url) {
  const started = Date.now();
  try {
    const text = await fetchText(url);
    return { source: src, url, ...diagnoseFeedText(text), ms: Date.now() - started, text };
  } catch (e) {
    return { source: src, url, level: "error", reason: classifyFetchError(e), detail: String((e && e.message) || e).slice(0, 200), items: 0, ms: Date.now() - started };
  }
}

async function saveHealth(results) {
  await kvSet("feeds.health", {
    checkedAt: new Date().toISOString(),
    results: results.map(({ text, ...r }) => r),
  });
}

export async function feedHealthSummary() {
  const h = await kvGet("feeds.health", null);
  if (!h || !h.results.length) return null;
  const res = h.results;
  const problems = res.filter((r) => r.level !== "ok").sort((a, b) => (a.level === b.level ? (a.source || "").localeCompare(b.source || "") : a.level === "error" ? -1 : 1));
  return {
    checkedAt: h.checkedAt,
    total: res.length,
    ok: res.filter((r) => r.level === "ok").length,
    warnings: res.filter((r) => r.level === "warning").length,
    errors: res.filter((r) => r.level === "error").length,
    problems,
  };
}

/** Check every feed URL now (no articles are saved). */
export async function checkAllFeeds(onProgress) {
  const feeds = await getFeeds();
  const jobs = Object.entries(feeds).flatMap(([src, urls]) => urls.map((url) => ({ src, url })));
  let done = 0;
  const results = [];
  await pool(jobs, 8, async ({ src, url }) => {
    results.push(await checkUrl(src, url));
    onProgress && onProgress(++done / jobs.length);
  });
  await saveHealth(results);
  return feedHealthSummary();
}

function first(el, ...names) {
  for (const n of names) {
    const found = el.getElementsByTagName(n)[0];
    if (found && (found.textContent || found.getAttribute("href") || found.getAttribute("url"))) return found;
  }
  return null;
}

export function parseFeed(text) {
  if (!text || !looksLikeFeed(text)) return [];
  const doc = parseXml(text);
  const items = kids(doc, "item").length ? kids(doc, "item") : kids(doc, "entry");
  return items.map((it) => {
    const linkEl = first(it, "link");
    let link = linkEl ? (linkEl.textContent || "").trim() : "";
    if (!link && linkEl) link = linkEl.getAttribute("href") || "";
    if (!link) {
      const alt = kids(it, "link").find((l) => l.getAttribute("href"));
      link = alt ? alt.getAttribute("href") : "";
    }
    const content = first(it, "content:encoded", "encoded", "content");
    const desc = first(it, "description", "summary");
    let image = "";
    for (const tag of ["media:content", "media:thumbnail", "enclosure"]) {
      const m = kids(it, tag).find((e) => e.getAttribute("url") && !/video|audio/.test(e.getAttribute("type") || ""));
      if (m) {
        image = m.getAttribute("url");
        break;
      }
    }
    return {
      title: stripHtml((first(it, "title") || {}).textContent || "No Title"),
      link: link.trim(),
      pubDate: ((first(it, "pubDate", "published", "updated", "dc:date") || {}).textContent || "").trim(),
      description: (desc && desc.textContent) || "",
      content: (content && content.textContent) || (desc && desc.textContent) || "",
      image_url: image,
    };
  });
}

// Same window as the backend's is_same_day(): since yesterday 21:00.
function inWindow(pubDate, hoursBack) {
  const d = new Date(pubDate);
  if (isNaN(d)) return false;
  const now = new Date();
  if (hoursBack) return d >= new Date(now.getTime() - hoursBack * 3600000) && d <= new Date(now.getTime() + 3600000);
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(21, 0, 0, 0);
  return d >= start && d <= new Date(now.getTime() + 3600000);
}

const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `a${(h >>> 0).toString(36)}`;
};

async function pool(items, limit, fn) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

/**
 * The whole fetch-rss pipeline. Returns { added, total, feeds, broken }.
 * onProgress({ done, total, source })
 */
export async function syncAll({ onProgress, firstRun } = {}) {
  const feeds = await getFeeds();
  const { places, keywords, rehamna } = await getTerms();
  const deleted = new Set(await kvGet("deleted.titles", []));
  const existing = await getAllArticles();
  const byLink = new Map(existing.map((a) => [a.link, a]));
  const seenTitles = new Set(existing.map((a) => normalizeArabic(a.title)));

  // Every feed URL is fetched so the health check covers all of them;
  // duplicate stories are removed by title below.
  const jobs = Object.entries(feeds).flatMap(([src, urls]) => urls.map((url) => ({ src, url })));
  const health = [];

  let done = 0;
  let broken = 0;
  const unique = [];
  const others = [];
  const batchTitles = new Set();

  await pool(jobs, 6, async ({ src, url }) => {
    try {
      const check = await checkUrl(src, url);
      health.push(check);
      if (check.level === "error") {
        broken++;
        return;
      }
      const entries = parseFeed(check.text);
      for (const e of entries) {
        if (!e.pubDate || !inWindow(e.pubDate, firstRun ? 48 : 0)) continue;
        if (deleted.has(e.title) || byLink.has(e.link)) continue;
        const norm = normalizeArabic(e.title);
        if (seenTitles.has(norm) || batchTitles.has(norm)) continue;
        batchTitles.add(norm);
        const text = `${e.title} ${e.description} ${e.content}`;
        const m = matchPlacesKeywords(text, places, keywords);
        const article = {
          id: hash(e.link || e.title),
          title: e.title,
          pubDate: e.pubDate,
          image_url: e.image_url || "No Image",
          link: e.link,
          description: e.description,
          content: stripHtml(e.content).slice(0, 20000),
          source: src,
          author: src,
          matched_places: m.places.join(", "),
          savedAt: Date.now(),
        };
        // Rehamna stories are always kept, even without a watch-list keyword.
        const isRehamna = rehamnaMatches(text, rehamna).length > 0;
        (m.places.length || isRehamna ? unique : others).push(article);
      }
    } catch (_) {
      broken++;
    } finally {
      done++;
      onProgress && onProgress({ done, total: jobs.length, source: src });
    }
  });

  const final = removeSimilar(unique);
  final.forEach((a) => (a.category = classify(`${a.title} ${stripHtml(a.description)}`)));
  others.forEach((a) => (a.category = classify(`${a.title} ${stripHtml(a.description)}`)));
  const balanced = balanceCategories(final, others);

  await putArticles(balanced);
  await saveHealth(health);
  await kvSet("sync.last", Date.now());
  await pruneOlderThan(await kvGet("settings.retention", 30));
  return { added: balanced.length, feeds: jobs.length, broken };
}

// ---------- queries ----------
export async function loadArticles() {
  const all = await getAllArticles();
  const { rehamna } = await getTerms();
  all.forEach((a) => {
    a.rehamna = rehamnaMatches(`${a.title} ${stripHtml(a.description)} ${a.content || ""} ${a.matched_places || ""}`, rehamna).length > 0;
  });
  return all.sort((a, b) => (new Date(b.pubDate) || 0) - (new Date(a.pubDate) || 0));
}

export async function rememberDeleted(article) {
  const list = await kvGet("deleted.titles", []);
  list.push(article.title);
  await kvSet("deleted.titles", list.slice(-3000));
}
