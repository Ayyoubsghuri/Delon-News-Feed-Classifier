import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { RefreshCw, Newspaper, FileDown, Search, X, Loader2, Plus, Trash2, ChevronLeft, Check } from "lucide-react";
import { ArticleCard, FeatureCard, Segmented, Sheet, Empty, CAT_COLORS } from "./ui";
import { isToday, timeAgo } from "../lib/format";
import { CATEGORIES } from "./engine/classify";
import { buildNewspaper, collect, savePdf } from "./engine/newspaper";
import { editorial as aiEditorial, aiConfig } from "./engine/ai";
import { getFeeds, addFeed, removeFeed, getTerms } from "./engine/feeds";
import { kvGet, kvSet, clearAll } from "./engine/store";
import { stripHtml } from "./engine/classify";
import Analytics from "../components/reader/Analytics";
import { overview } from "./engine/analytics";

const AR_DATE = new Intl.DateTimeFormat("ar-MA", { weekday: "long", day: "numeric", month: "long" });

// ---------------------------------------------------------------- header
export function LargeHeader({ title, subtitle, right }) {
  return (
    <div className="px-5 pb-3 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          {subtitle && <div className="text-[12.5px] font-semibold uppercase tracking-wide text-[#b4161b]">{subtitle}</div>}
          <h1 className="truncate text-[30px] font-black leading-tight tracking-tight text-zinc-900 dark:text-white">{title}</h1>
        </div>
        {right}
      </div>
    </div>
  );
}

function SyncPill({ syncing, progress, last, onSync }) {
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onSync} disabled={syncing}
      className="relative flex h-10 items-center gap-2 overflow-hidden rounded-full bg-white dark:bg-[#1f2023] px-3.5 text-[12px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
      {syncing && (
        <motion.span className="absolute inset-y-0 left-0 bg-[#b4161b]/10" animate={{ width: `${Math.round(progress * 100)}%` }} />
      )}
      <RefreshCw size={15} className={`relative ${syncing ? "animate-spin text-[#b4161b]" : ""}`} />
      <span className="relative">{syncing ? `${Math.round(progress * 100)}%` : last ? timeAgo(last).replace(" ago", "") : "Update"}</span>
    </motion.button>
  );
}

// ---------------------------------------------------------------- pull to refresh
function PullToRefresh({ onRefresh, children, scrollRef }) {
  const y = useMotionValue(0);
  const rotate = useTransform(y, [0, 80], [0, 270]);
  const opacity = useTransform(y, [10, 60], [0, 1]);
  const start = useRef(null);
  const onTouchStart = (e) => {
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) start.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (start.current == null) return;
    const d = e.touches[0].clientY - start.current;
    y.set(d > 0 ? Math.min(110, d * 0.5) : 0);
  };
  const onTouchEnd = () => {
    if (y.get() > 70) onRefresh();
    start.current = null;
    animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
  };
  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <motion.div style={{ height: y, opacity }} className="flex items-end justify-center overflow-hidden">
        <motion.div style={{ rotate }} className="mb-2 text-[#b4161b]"><RefreshCw size={22} /></motion.div>
      </motion.div>
      <motion.div style={{ y: 0 }}>{children}</motion.div>
    </div>
  );
}

// ---------------------------------------------------------------- home
export function HomeScreen({ articles, readIds, onOpen, syncing, progress, last, onSync, scrollRef }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  const list = useMemo(() => {
    let l = articles;
    if (cat !== "all") l = l.filter((a) => a.category === cat);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      l = l.filter((a) => `${a.title} ${a.content || ""} ${a.source}`.toLowerCase().includes(t));
    }
    return l;
  }, [articles, cat, q]);

  const today = list.filter((a) => isToday(a.pubDate));
  const featured = list.find((a) => a.image_url && a.image_url !== "No Image") || list[0];
  const rest = list.filter((a) => a !== featured);

  return (
    <PullToRefresh onRefresh={onSync} scrollRef={scrollRef}>
      <LargeHeader
        subtitle={AR_DATE.format(new Date())}
        title="Delon"
        right={
          <div className="flex items-center gap-2">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setSearching((s) => !s)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-[#1f2023] text-zinc-700 dark:text-zinc-200 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
              {searching ? <X size={17} /> : <Search size={17} />}
            </motion.button>
            <SyncPill syncing={syncing} progress={progress} last={last} onSync={onSync} />
          </div>
        }
      />
      <AnimatePresence>
        {searching && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-5">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} dir="auto" placeholder="ابحث في الأخبار…"
              className="mb-3 w-full rounded-2xl bg-white dark:bg-[#1f2023] px-4 py-3 text-[15px] text-zinc-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10 outline-none focus:ring-2 focus:ring-[#b4161b]/40" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* category chips */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-4" dir="rtl">
        {[["all", "الكل"], ...CATEGORIES.map((c) => [c, c])].map(([v, label]) => (
          <button key={v} onClick={() => setCat(v)}
            className={`relative shrink-0 rounded-full px-4 py-2 text-[13px] font-bold ${cat === v ? "text-white" : "text-zinc-600 dark:text-zinc-300 bg-white dark:bg-[#1f2023] ring-1 ring-black/5 dark:ring-white/10"}`}>
            {cat === v && (
              <motion.span layoutId="chip" className="absolute inset-0 rounded-full"
                style={{ background: v === "all" ? "#18181b" : CAT_COLORS[v] }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }} />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty icon="📰" title={syncing ? "Fetching the news…" : "No news yet"}
          text={syncing ? "Reading all your sources, this takes a minute." : "Pull down or tap Update to fetch today's news."} />
      ) : (
        <div className="space-y-3 px-4 pb-28">
          {featured && <FeatureCard article={featured} onOpen={onOpen} />}
          <div className="flex items-baseline justify-between px-1 pt-3" dir="rtl">
            <h2 className="text-[18px] font-extrabold text-zinc-900 dark:text-white">آخر الأخبار</h2>
            <span className="text-[12px] text-zinc-500">{today.length} اليوم · {list.length} المجموع</span>
          </div>
          {rest.map((a, i) => (
            <ArticleCard key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </PullToRefresh>
  );
}

// ---------------------------------------------------------------- rehamna
export function RehamnaScreen({ articles, readIds, onOpen, notify }) {
  const [sheet, setSheet] = useState(false);
  const reh = articles.filter((a) => a.rehamna);
  const todayCount = reh.filter((a) => isToday(a.pubDate)).length;
  const weekCount = reh.filter((a) => Date.now() - new Date(a.pubDate) < 7 * 86400000).length;

  return (
    <div className="pb-28">
      <LargeHeader subtitle="Rehamna" title="الرحامنة" />
      <div className="px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#b4161b] via-[#8f1116] to-[#3b0a0c] p-5 text-white shadow-[0_18px_40px_-18px_rgba(180,22,27,0.8)]" dir="rtl">
          <motion.div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10"
            animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }} />
          <div className="relative">
            <div className="text-[13px] font-semibold text-white/80">جريدة الرحامنة اليومية</div>
            <div className="mt-1 text-[26px] font-black">أخبار الرحامنة</div>
            <div className="mt-4 flex gap-6">
              <div><div className="text-[28px] font-black tabular-nums">{todayCount}</div><div className="text-[12px] text-white/75">خبر اليوم</div></div>
              <div><div className="text-[28px] font-black tabular-nums">{weekCount}</div><div className="text-[12px] text-white/75">هذا الأسبوع</div></div>
            </div>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => setSheet(true)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[15px] font-extrabold text-[#b4161b]">
              <FileDown size={18} /> إنشاء الصفحة الأولى PDF
            </motion.button>
          </div>
        </motion.div>
      </div>

      <div className="mt-5 space-y-3 px-4">
        {reh.length === 0 ? (
          <Empty icon="🗞️" title="لا توجد أخبار عن الرحامنة بعد" text="Update the news from the Home tab." />
        ) : (
          reh.map((a, i) => <ArticleCard key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} />)
        )}
      </div>

      <AnimatePresence>
        {sheet && <NewspaperSheet articles={articles} onClose={() => setSheet(false)} notify={notify} />}
      </AnimatePresence>
    </div>
  );
}

function NewspaperSheet({ articles, onClose, notify }) {
  const [days, setDays] = useState(1);
  const [useAi, setUseAi] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(null); // {msg, p}

  useEffect(() => {
    aiConfig().then((c) => setHasKey(!!c.key));
  }, []);

  const generate = async () => {
    setBusy({ msg: "Collecting articles…", p: 0.03 });
    try {
      const { rehamna } = await getTerms();
      const picked = collect(articles, rehamna, days, 40);
      let editorial = null;
      if (useAi && hasKey && picked.length) {
        setBusy({ msg: "AI is writing the editorial…", p: 0.06 });
        const digest = picked.slice(0, 15).map((a) => `- ${stripHtml(a.title)}: ${(a.content || "").slice(0, 350)}`).join("\n\n");
        editorial = await aiEditorial(digest).catch(() => null);
      }
      const doc = await buildNewspaper(picked, { days, editorial, onProgress: (msg, p) => setBusy({ msg, p }) });
      const d = new Date();
      await savePdf(doc, `rehamna-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.pdf`);
      notify("Newspaper ready ✓");
      onClose();
    } catch (e) {
      console.error(e);
      notify("Could not create the PDF");
      setBusy(null);
    }
  };

  return (
    <Sheet title="🗞️ Front page PDF" onClose={busy ? () => {} : onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-zinc-500">
        A newspaper-style front page with photos, built on your phone from every article about Rehamna.
      </p>
      <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-zinc-400">Period</div>
      <Segmented id="np" value={days} onChange={setDays} options={[[1, "Today"], [3, "3 days"], [7, "Week"], [30, "Month"]]} />
      <label className="mt-5 flex items-center justify-between rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3">
        <span className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
          AI editorial
          <span className="block text-[11.5px] font-normal text-zinc-500">{hasKey ? "Written from all the stories" : "Add an OpenRouter key in Settings"}</span>
        </span>
        <input type="checkbox" checked={useAi && hasKey} disabled={!hasKey} onChange={(e) => setUseAi(e.target.checked)} className="h-5 w-5 accent-[#b4161b]" />
      </label>

      {busy ? (
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-[12.5px] text-zinc-600 dark:text-zinc-300"><span>{busy.msg}</span><span>{Math.round(busy.p * 100)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <motion.div className="h-full rounded-full bg-[#b4161b]" animate={{ width: `${busy.p * 100}%` }} transition={{ ease: "easeOut" }} />
          </div>
        </div>
      ) : (
        <motion.button whileTap={{ scale: 0.97 }} onClick={generate}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b4161b] py-4 text-[15px] font-extrabold text-white shadow-lg shadow-red-900/20">
          <Newspaper size={18} /> Create newspaper
        </motion.button>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- saved
export function SavedScreen({ articles, readIds, onOpen }) {
  const saved = articles.filter((a) => a.bookmarked);
  return (
    <div className="pb-28">
      <LargeHeader subtitle="Bookmarks" title="المحفوظات" />
      <div className="space-y-3 px-4">
        {saved.length === 0 ? (
          <Empty icon="🔖" title="Nothing saved yet" text="Tap the bookmark on an article to keep it here." />
        ) : (
          saved.map((a, i) => <ArticleCard key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stats
export function StatsScreen({ articles }) {
  const [feedsCount, setFeedsCount] = useState(0);
  useEffect(() => {
    getFeeds().then((f) => setFeedsCount(Object.values(f).reduce((a, v) => a + v.length, 0)));
  }, []);
  return (
    <div className="pb-28">
      <LargeHeader subtitle="Insights" title="الإحصائيات" />
      <div className="-mt-2">
        <Analytics compact loader={async (d) => overview(articles, d, feedsCount)} key={`${articles.length}-${feedsCount}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- settings
const Group = ({ title, children }) => (
  <div className="mb-6">
    {title && <div className="mb-2 px-5 text-[12px] font-bold uppercase tracking-wide text-zinc-400">{title}</div>}
    <div className="mx-4 divide-y divide-black/5 dark:divide-white/10 overflow-hidden rounded-2xl bg-white dark:bg-[#1f2023] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">{children}</div>
  </div>
);
const Row = ({ label, value, onClick, danger }) => (
  <button onClick={onClick} className={`flex w-full items-center justify-between px-4 py-3.5 text-left text-[15px] ${danger ? "text-red-600" : "text-zinc-900 dark:text-zinc-100"}`}>
    <span>{label}</span>
    {value !== undefined && <span className="text-[14px] text-zinc-500">{value}</span>}
  </button>
);
const field = "w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2.5 text-[14px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-[#b4161b]/40";

export function SettingsScreen({ theme, setTheme, notify, onDataChanged }) {
  const [sheet, setSheet] = useState(null);
  const [feeds, setFeeds] = useState({});
  const [ai, setAi] = useState({ key: "", model: "" });
  const [terms, setTerms] = useState("");
  const [retention, setRetention] = useState(30);
  const [newFeed, setNewFeed] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    setFeeds(await getFeeds());
    setAi(await aiConfig());
    setTerms((await getTerms()).rehamna.join("\n"));
    setRetention(await kvGet("settings.retention", 30));
  };
  useEffect(() => {
    reload();
  }, []);

  const feedCount = Object.keys(feeds).length;

  return (
    <div className="pb-28">
      <LargeHeader subtitle="Delon" title="Settings" />
      <Group title="News">
        <Row label="Sources" value={`${feedCount} sites ›`} onClick={() => setSheet("feeds")} />
        <Row label="Rehamna words" value="Edit ›" onClick={() => setSheet("terms")} />
        <Row label="Keep articles for" value={`${retention} days ›`} onClick={() => setSheet("retention")} />
      </Group>
      <Group title="AI (optional)">
        <Row label="OpenRouter key" value={ai.key ? "Saved ✓ ›" : "Not set ›"} onClick={() => setSheet("ai")} />
      </Group>
      <Group title="Appearance">
        <div className="p-3"><Segmented id="theme" value={theme} onChange={setTheme} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} /></div>
      </Group>
      <Group title="Data">
        <Row label="Delete all stored news" danger onClick={async () => {
          if (window.confirm("Delete all stored articles and settings?")) {
            await clearAll();
            onDataChanged();
            reload();
            notify("All data deleted");
          }
        }} />
      </Group>
      <div className="px-5 text-center text-[12px] text-zinc-400">Delon works fully on this phone — no computer or server needed.</div>

      <AnimatePresence>
        {sheet === "feeds" && (
          <Sheet title="Sources" onClose={() => setSheet(null)}>
            <form className="mb-4 flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!newFeed.trim()) return;
              setAdding(true);
              const r = await addFeed(newFeed).catch(() => ({ ok: false }));
              setAdding(false);
              notify(r.ok ? `Added ${r.domain}` : "No RSS feed found on that site");
              if (r.ok) { setNewFeed(""); reload(); }
            }}>
              <input className={field} placeholder="example.ma" value={newFeed} onChange={(e) => setNewFeed(e.target.value)} inputMode="url" />
              <button className="flex shrink-0 items-center gap-1 rounded-xl bg-[#b4161b] px-4 text-[14px] font-bold text-white" disabled={adding}>
                {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />} Add
              </button>
            </form>
            <ul className="divide-y divide-black/5 dark:divide-white/10">
              {Object.entries(feeds).sort().map(([d, urls]) => (
                <motion.li layout key={d} className="flex items-center gap-3 py-2.5">
                  <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} alt="" className="h-6 w-6 rounded" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">{d}</div>
                    <div className="text-[11.5px] text-zinc-500">{urls.length} feed{urls.length > 1 ? "s" : ""}</div>
                  </div>
                  <button onClick={async () => { await removeFeed(d); reload(); }} className="rounded-full p-2 text-zinc-400 active:text-red-600"><Trash2 size={17} /></button>
                </motion.li>
              ))}
            </ul>
          </Sheet>
        )}
        {sheet === "terms" && (
          <Sheet title="Rehamna words" onClose={() => setSheet(null)}>
            <p className="mb-3 text-[13px] text-zinc-500">One word or phrase per line. Articles containing any of them appear in the Rehamna tab and newspaper.</p>
            <textarea dir="auto" rows={12} className={field} value={terms} onChange={(e) => setTerms(e.target.value)} />
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b4161b] py-3.5 font-bold text-white" onClick={async () => {
              await kvSet("terms.rehamna", terms.split("\n").map((s) => s.trim()).filter(Boolean));
              onDataChanged();
              setSheet(null);
              notify("Saved");
            }}><Check size={17} /> Save</button>
          </Sheet>
        )}
        {sheet === "ai" && (
          <Sheet title="AI summaries" onClose={() => setSheet(null)}>
            <p className="mb-3 text-[13px] text-zinc-500">Get a key at openrouter.ai. It is stored only on this phone and used for summaries and the newspaper editorial.</p>
            <input className={field} placeholder="sk-or-…" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} />
            <input className={`${field} mt-2`} placeholder="openai/gpt-4o-mini" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b4161b] py-3.5 font-bold text-white" onClick={async () => {
              await kvSet("ai.key", ai.key.trim());
              await kvSet("ai.model", ai.model.trim() || "openai/gpt-4o-mini");
              setSheet(null);
              notify("Saved");
            }}><Check size={17} /> Save</button>
          </Sheet>
        )}
        {sheet === "retention" && (
          <Sheet title="Keep articles for" onClose={() => setSheet(null)}>
            <Segmented id="ret" value={retention} onChange={async (v) => { setRetention(v); await kvSet("settings.retention", v); }}
              options={[[7, "7 days"], [30, "30 days"], [90, "90 days"]]} />
            <p className="mt-3 text-[12.5px] text-zinc-500">Bookmarked articles are always kept.</p>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

export { ChevronLeft };
