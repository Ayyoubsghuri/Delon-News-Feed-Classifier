// Same shape as the server's /analytics/overview, computed on the phone.
import linksData from "../../data/links.json";

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function overview(articles, days, feedsCount) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = new Date(today.getTime() - (days - 1) * 86400000);
  const inRange = articles.filter((a) => new Date(a.savedAt || a.pubDate) >= since);
  const per = {}, reh = {}, cats = {}, srcs = {}, hours = {}, places = {};
  for (const a of inRange) {
    const d = dayKey(new Date(a.savedAt || a.pubDate));
    per[d] = (per[d] || 0) + 1;
    if (a.rehamna) reh[d] = (reh[d] || 0) + 1;
    cats[a.category || "مختلفات"] = (cats[a.category || "مختلفات"] || 0) + 1;
    srcs[a.source || "unknown"] = (srcs[a.source || "unknown"] || 0) + 1;
    const p = new Date(a.pubDate);
    if (!isNaN(p)) hours[p.getHours()] = (hours[p.getHours()] || 0) + 1;
    (a.matched_places || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((pl) => (places[pl] = (places[pl] || 0) + 1));
  }
  const timeline = [];
  for (let i = 0; i < days; i++) {
    const d = dayKey(new Date(since.getTime() + i * 86400000));
    timeline.push({ date: d, articles: per[d] || 0, rehamna: reh[d] || 0 });
  }
  const sorted = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));
  const t = dayKey(today);
  const y = dayKey(new Date(today.getTime() - 86400000));
  return {
    days,
    kpis: {
      total: articles.length,
      period: inRange.length,
      today: per[t] || 0,
      yesterday: per[y] || 0,
      rehamna: Object.values(reh).reduce((a, b) => a + b, 0),
      sources: Object.keys(srcs).length,
      feeds: feedsCount || Object.values(linksData).reduce((a, v) => a + v.length, 0),
      uptime: "on device",
    },
    timeline,
    categories: sorted(cats, 10),
    sources: sorted(srcs, 10),
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, value: hours[h] || 0 })),
    places: sorted(places, 14),
  };
}
