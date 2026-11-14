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

function parseXml(text) {
  const p = new DOMParser();
  let doc = p.parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    doc = p.parseFromString(sanitizeXml(text), "text/xml");
  }
  if (doc.getElementsByTagName("parsererror").length) {
    // Very broken feeds: the HTML parser still finds <item>/<entry> tags.
    doc = p.parseFromString(text, "text/html");
  }
  return doc;
}

const kids = (el, name) => Array.from(el.getElementsByTagName(name));
function first(el, ...names) {
  for (const n of names) {
    const found = el.getElementsByTagName(n)[0];
    if (found && (found.textContent || found.getAttribute("href") || found.getAttribute("url"))) return found;
  }
  return null;
}

export function parseFeed(text) {
  if (!text || !/<(rss|feed|rdf|channel|item|entry)/i.test(text.slice(0, 5000))) return [];
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

  const jobs = [];
  const seenUrls = new Set();
  Object.entries(feeds).forEach(([src, urls]) =>
    urls.forEach((u) => {
      const key = u.replace(/\/+$/, "").replace(/^http:/, "https:");
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        jobs.push({ src, url: u });
      }
    })
  );

  let done = 0;
  let broken = 0;
  const unique = [];
  const others = [];
  const batchTitles = new Set();

  await pool(jobs, 6, async ({ src, url }) => {
    try {
      const entries = parseFeed(await fetchText(url));
      if (!entries.length) broken++;
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
