import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  RefreshCw, Newspaper, FileDown, Search, X, Loader2, Plus, Trash2, ArrowLeft, Check, ChevronRight,
  BarChart3, Rss, Type, Sparkles, Palette, Database, Clock,
} from "lucide-react";
import { LeadStory, StoryRow, Segmented, Sheet, Empty, TopBar, IconBtn, Logo, Thumb, Badge, CATEGORY_INFO } from "./ui";
import { isToday, timeAgo, faviconFor } from "../lib/format";
import { CATEGORIES, stripHtml } from "./engine/classify";
import { buildNewspaper, collect, savePdf } from "./engine/newspaper";
import { editorial as aiEditorial, aiConfig } from "./engine/ai";
import { getFeeds, addFeed, removeFeed, getTerms } from "./engine/feeds";
import { kvGet, kvSet, clearAll } from "./engine/store";
import Analytics from "../components/reader/Analytics";
import { overview } from "./engine/analytics";

const inPeriod = (a, p) => {
  if (p === "all") return true;
  const days = { today: 1, week: 7, month: 30 }[p];
  if (p === "today") return isToday(a.pubDate);
  return Date.now() - new Date(a.pubDate) < days * 86400000;
};

// ---------------------------------------------------------------- pull to refresh
function PullToRefresh({ onRefresh, children, scrollRef }) {
  const y = useMotionValue(0);
  const rotate = useTransform(y, [0, 80], [0, 300]);
  const opacity = useTransform(y, [10, 60], [0, 1]);
  const start = useRef(null);
  return (
    <div
      onTouchStart={(e) => {
        if (scrollRef.current && scrollRef.current.scrollTop <= 0) start.current = e.touches[0].clientY;
      }}
      onTouchMove={(e) => {
        if (start.current == null) return;
        const d = e.touches[0].clientY - start.current;
        y.set(d > 0 ? Math.min(100, d * 0.5) : 0);
      }}
      onTouchEnd={() => {
        if (y.get() > 65) onRefresh();
        start.current = null;
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }}
    >
      <motion.div style={{ height: y, opacity }} className="flex items-end justify-center overflow-hidden">
        <motion.div style={{ rotate }} className="mb-2 text-[#f26b1d]"><RefreshCw size={20} /></motion.div>
      </motion.div>
      {children}
    </div>
  );
}

function SyncBar({ syncing, progress }) {
  return (
    <AnimatePresence>
      {syncing && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-[2px] bg-[#f26b1d]/15">
          <motion.div className="h-full bg-[#f26b1d]" animate={{ width: `${Math.max(4, progress * 100)}%` }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- overview tiles
function Tile({ label, article, active, onClick, emoji }) {
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={onClick}
      className={`relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-2xl p-[2px] ${active ? "bg-[#f26b1d]" : "bg-transparent"}`}>
      <div className="relative h-full w-full overflow-hidden rounded-[14px]">
        {article ? <Thumb article={article} className="h-full w-full" rounded="rounded-[14px]" /> : (
          <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-zinc-100 dark:bg-zinc-800 text-3xl">{emoji}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="ar absolute inset-x-1 bottom-1.5 text-center text-[11px] font-bold leading-tight text-white">{label}</div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------- home
export function HomeScreen({ articles, readIds, onOpen, onMore, onBookmark, syncing, progress, last, onSync, scrollRef, openPage }) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  const list = useMemo(() => {
    if (!q.trim()) return articles;
    const t = q.trim().toLowerCase();
    return articles.filter((a) => `${a.title} ${a.content || ""} ${a.source}`.toLowerCase().includes(t));
  }, [articles, q]);
  const lead = list.find((a) => a.image_url && a.image_url !== "No Image") || list[0];
  const rest = list.filter((a) => a !== lead);
  const latestIn = (cat) => articles.find((a) => a.category === cat && a.image_url && a.image_url !== "No Image") || articles.find((a) => a.category === cat);
  const rehamnaLatest = articles.find((a) => a.rehamna && a.image_url && a.image_url !== "No Image") || articles.find((a) => a.rehamna);

  return (
    <PullToRefresh onRefresh={onSync} scrollRef={scrollRef}>
      <TopBar
        border={false}
        left={<Badge onClick={() => openPage({ type: "stats" })} />}
        center={<Logo />}
        right={<IconBtn onClick={() => setSearching((s) => !s)}>{searching ? <X size={20} /> : <Search size={20} />}</IconBtn>}
      />
      <SyncBar syncing={syncing} progress={progress} />
      <AnimatePresence>
        {searching && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} dir="auto" placeholder="ابحث في الأخبار…"
              className="ar my-2 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-[15px] text-zinc-900 dark:text-white outline-none" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overview */}
      <div className="flex items-center justify-between px-4 pt-2">
        <div className="caps text-[11.5px] font-bold text-zinc-400">Overview</div>
        <button onClick={onSync} className="flex items-center gap-1 text-[11.5px] font-semibold text-zinc-400">
          <RefreshCw size={12} className={syncing ? "animate-spin text-[#f26b1d]" : ""} />
          {syncing ? `${Math.round(progress * 100)}%` : last ? timeAgo(last) : "Update"}
        </button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto px-4 pb-4 pt-2.5" dir="rtl">
        <Tile label="الرحامنة" article={rehamnaLatest} emoji="🗞️" active onClick={() => openPage({ type: "rehamna" })} />
        {CATEGORIES.map((c) => (
          <Tile key={c} label={c} article={latestIn(c)} emoji={CATEGORY_INFO[c].emoji} onClick={() => openPage({ type: "category", value: c })} />
        ))}
      </div>

      {list.length === 0 ? (
        <Empty icon="📰" title={syncing ? "Fetching the news…" : "No news yet"}
          text={syncing ? "Reading all your sources, this takes a minute." : "Pull down to fetch today's news."} />
      ) : (
        <div className="pb-24">
          {lead && <LeadStory article={lead} onOpen={onOpen} onMore={onMore} onBookmark={onBookmark} />}
          {rest.map((a, i) => (
            <StoryRow key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} onMore={onMore} onBookmark={onBookmark} />
          ))}
        </div>
      )}
    </PullToRefresh>
  );
}

// ---------------------------------------------------------------- list page (category / source / rehamna)
export function ListPage({ page, articles, readIds, onOpen, onMore, onBookmark, onBack, notify }) {
  const [period, setPeriod] = useState("all");
  const [sheet, setSheet] = useState(false);
  let title = page.value;
  let base = articles;
  if (page.type === "category") base = articles.filter((a) => a.category === page.value);
  if (page.type === "source") base = articles.filter((a) => a.source === page.value);
  if (page.type === "rehamna") {
    base = articles.filter((a) => a.rehamna);
    title = "أخبار الرحامنة";
  }
  const list = base.filter((a) => inPeriod(a, period));

  return (
    <div className="min-h-full bg-white dark:bg-[#111113]">
      <TopBar left={<IconBtn onClick={onBack}><ArrowLeft size={21} /></IconBtn>}
        center={<span className="ar text-[16px] font-bold text-zinc-900 dark:text-white">{title}</span>}
        right={page.type === "rehamna" ? <IconBtn onClick={() => setSheet(true)}><FileDown size={20} className="text-[#f26b1d]" /></IconBtn> : null} />
      <div className="px-4 py-3">
        <Segmented id={`p-${page.type}`} value={period} onChange={setPeriod}
          options={[["all", "All"], ["today", "Today"], ["week", "Week"], ["month", "Month"]]} />
      </div>
      {page.type === "rehamna" && (
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => setSheet(true)}
          className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-[#111] p-4 text-right text-white" dir="rtl">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f26b1d]"><Newspaper size={22} /></span>
          <span className="flex-1">
            <span className="ar block text-[15px] font-bold">الصفحة الأولى PDF</span>
            <span className="ar block text-[12px] text-white/60">جريدة بالصور من كل أخبار الرحامنة</span>
          </span>
          <ChevronRight size={18} className="rotate-180 text-white/50" />
        </motion.button>
      )}
      <div className="pb-24">
        {list.length === 0 ? (
          <Empty icon={page.type === "rehamna" ? "🗞️" : "📭"} title="Nothing here yet" text="Try another period or pull to refresh on Home." />
        ) : (
          list.map((a, i) => <StoryRow key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} onMore={onMore} onBookmark={onBookmark} />)
        )}
      </div>
      <AnimatePresence>{sheet && <NewspaperSheet articles={articles} onClose={() => setSheet(false)} notify={notify} />}</AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- categories
export function CategoriesScreen({ articles, openPage }) {
  const [tab, setTab] = useState("all");
  const counts = useMemo(() => {
    const c = {};
    articles.forEach((a) => (c[a.category] = (c[a.category] || 0) + 1));
    return c;
  }, [articles]);
  const sources = useMemo(() => {
    const s = {};
    articles.forEach((a) => (s[a.source] = s[a.source] || { count: 0, link: a.link }) && s[a.source].count++);
    return Object.entries(s).sort((a, b) => b[1].count - a[1].count);
  }, [articles]);
  const rehCount = articles.filter((a) => a.rehamna).length;

  const Card = ({ emoji, icon, title, hint, count, onClick, i }) => (
    <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      whileTap={{ scale: 0.96 }} onClick={onClick} dir="rtl"
      className="rounded-2xl bg-zinc-50 dark:bg-[#1c1c1e] p-3.5 text-right ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="flex items-center gap-2">
        {icon || <span className="text-[19px]">{emoji}</span>}
        <span className="ar truncate text-[14.5px] font-bold text-zinc-900 dark:text-white">{title}</span>
      </div>
      <div className="ar mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-zinc-500">{hint}</div>
      <div className="mt-2 text-[11px] font-semibold text-[#f26b1d]" dir="ltr">{count} articles</div>
    </motion.button>
  );

  return (
    <div className="min-h-full bg-white dark:bg-[#111113]">
      <TopBar border={false} center={<span className="text-[16px] font-bold text-zinc-900 dark:text-white">Categories</span>} />
      <Segmented underline id="cats" value={tab} onChange={setTab} options={[["all", "All"], ["sources", "Sources"]]} />
      <div className="grid grid-cols-2 gap-2.5 p-4 pb-24">
        {tab === "all" ? (
          <>
            <Card i={0} emoji="🗞️" title="الرحامنة" hint="ابن جرير، سيدي بوعثمان، صخور الرحامنة…" count={rehCount} onClick={() => openPage({ type: "rehamna" })} />
            {CATEGORIES.map((c, i) => (
              <Card key={c} i={i + 1} emoji={CATEGORY_INFO[c].emoji} title={c} hint={CATEGORY_INFO[c].hint} count={counts[c] || 0}
                onClick={() => openPage({ type: "category", value: c })} />
            ))}
          </>
        ) : (
          sources.map(([s, info], i) => (
            <Card key={s} i={Math.min(i, 12)} title={s} hint={`آخر خبر ${timeAgo((articles.find((a) => a.source === s) || {}).pubDate)}`}
              icon={<img src={faviconFor(s, info.link)} alt="" className="h-5 w-5 rounded" onError={(e) => (e.target.style.visibility = "hidden")} />}
              count={info.count} onClick={() => openPage({ type: "source", value: s })} />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bookmarks
export function SavedScreen({ articles, readIds, onOpen, onMore, onBookmark }) {
  const saved = articles.filter((a) => a.bookmarked);
  return (
    <div className="min-h-full bg-white dark:bg-[#111113]">
      <TopBar center={<span className="text-[16px] font-bold text-zinc-900 dark:text-white">Bookmarks</span>} />
      <div className="pb-24">
        {saved.length === 0 ? (
          <Empty icon="🔖" title="No bookmarks yet" text="Tap the bookmark on any story to save it here." />
        ) : (
          saved.map((a, i) => <StoryRow key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} onMore={onMore} onBookmark={onBookmark} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- newspaper sheet
export function NewspaperSheet({ articles, onClose, notify }) {
  const [days, setDays] = useState(1);
  const [useAi, setUseAi] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(null);

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
    <Sheet title="Rehamna front page" onClose={busy ? () => {} : onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-zinc-500">
        A newspaper-style PDF with photos, made on your phone from every story about Rehamna.
      </p>
      <div className="caps mb-2 text-[11px] font-bold text-zinc-400">Period</div>
      <Segmented id="np" value={days} onChange={setDays} options={[[1, "Today"], [3, "3 days"], [7, "Week"], [30, "Month"]]} />
      <label className="mt-4 flex items-center justify-between border-y border-black/[0.06] dark:border-white/10 py-3.5">
        <span className="text-[15px] text-zinc-900 dark:text-zinc-100">
          AI editorial
          <span className="block text-[12px] text-zinc-500">{hasKey ? "Written from all the stories" : "Add an OpenRouter key in Menu → AI"}</span>
        </span>
        <input type="checkbox" checked={useAi && hasKey} disabled={!hasKey} onChange={(e) => setUseAi(e.target.checked)} className="h-5 w-5 accent-[#f26b1d]" />
      </label>
      {busy ? (
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-[12.5px] text-zinc-600 dark:text-zinc-300"><span>{busy.msg}</span><span>{Math.round(busy.p * 100)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <motion.div className="h-full rounded-full bg-[#f26b1d]" animate={{ width: `${busy.p * 100}%` }} />
          </div>
        </div>
      ) : (
        <motion.button whileTap={{ scale: 0.97 }} onClick={generate}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f26b1d] py-3.5 text-[15px] font-bold text-white">
          <Newspaper size={18} /> Create newspaper
        </motion.button>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- stats page
export function StatsPage({ articles, onBack }) {
  const [feedsCount, setFeedsCount] = useState(0);
  useEffect(() => {
    getFeeds().then((f) => setFeedsCount(Object.values(f).reduce((a, v) => a + v.length, 0)));
  }, []);
  return (
    <div className="min-h-full bg-[#f5f5f7] dark:bg-[#111113]">
      <TopBar left={<IconBtn onClick={onBack}><ArrowLeft size={21} /></IconBtn>}
        center={<span className="text-[16px] font-bold text-zinc-900 dark:text-white">Statistics</span>} />
      <div className="pb-24">
        <Analytics compact loader={async (d) => overview(articles, d, feedsCount)} key={`${articles.length}-${feedsCount}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- menu
const field = "w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2.5 text-[14px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-[#f26b1d]/40";

function MenuRow({ icon, label, value, onClick, danger }) {
  return (
    <motion.button whileTap={{ backgroundColor: "rgba(0,0,0,0.03)" }} onClick={onClick}
      className={`flex w-full items-center gap-3.5 border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3.5 text-left ${danger ? "text-red-600" : "text-zinc-900 dark:text-zinc-100"}`}>
      <span className={danger ? "" : "text-zinc-500"}>{icon}</span>
      <span className="flex-1 text-[15.5px]">{label}</span>
      {value !== undefined && <span className="text-[13.5px] text-zinc-400">{value}</span>}
      {!danger && <ChevronRight size={17} className="text-zinc-300" />}
    </motion.button>
  );
}

export function MenuScreen({ articles, theme, setTheme, notify, onDataChanged, openPage }) {
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

  return (
    <div className="min-h-full bg-white dark:bg-[#111113]">
      <TopBar border={false} center={<span className="text-[16px] font-bold text-zinc-900 dark:text-white">Menu</span>} />
      <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl bg-[#111] p-4 text-white">
        <Badge size={46} />
        <div className="flex-1">
          <div className="text-[16px] font-bold">Delon</div>
          <div className="text-[12px] text-white/60">{articles.length} stories · {Object.keys(feeds).length} sources · works offline</div>
        </div>
      </div>
      <div className="border-t border-black/[0.06] dark:border-white/[0.08]">
        <MenuRow icon={<BarChart3 size={19} />} label="Statistics" onClick={() => openPage({ type: "stats" })} />
        <MenuRow icon={<Rss size={19} />} label="Sources" value={Object.keys(feeds).length} onClick={() => setSheet("feeds")} />
        <MenuRow icon={<Type size={19} />} label="Rehamna words" onClick={() => setSheet("terms")} />
        <MenuRow icon={<Sparkles size={19} />} label="AI (OpenRouter)" value={ai.key ? "On" : "Off"} onClick={() => setSheet("ai")} />
        <MenuRow icon={<Palette size={19} />} label="Appearance" value={theme} onClick={() => setSheet("theme")} />
        <MenuRow icon={<Clock size={19} />} label="Keep stories for" value={`${retention} days`} onClick={() => setSheet("retention")} />
        <MenuRow icon={<Database size={19} />} label="Delete all stored news" danger onClick={async () => {
          if (window.confirm("Delete all stored stories and settings?")) {
            await clearAll();
            onDataChanged();
            reload();
            notify("All data deleted");
          }
        }} />
      </div>
      <div className="px-6 py-6 pb-28 text-center text-[12px] leading-relaxed text-zinc-400">
        Delon fetches, classifies and stores the news on this phone — no computer or server needed.
      </div>

      <AnimatePresence>
        {sheet === "feeds" && (
          <Sheet title="Sources" onClose={() => setSheet(null)}>
            <form className="mb-3 flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!newFeed.trim()) return;
              setAdding(true);
              const r = await addFeed(newFeed).catch(() => ({ ok: false }));
              setAdding(false);
              notify(r.ok ? `Added ${r.domain}` : "No RSS feed found on that site");
              if (r.ok) { setNewFeed(""); reload(); }
            }}>
              <input className={field} placeholder="example.ma" value={newFeed} onChange={(e) => setNewFeed(e.target.value)} inputMode="url" />
              <button className="flex shrink-0 items-center gap-1 rounded-xl bg-[#f26b1d] px-4 text-[14px] font-bold text-white" disabled={adding}>
                {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />} Add
              </button>
            </form>
            <ul>
              {Object.entries(feeds).sort().map(([d, urls]) => (
                <motion.li layout key={d} className="flex items-center gap-3 border-b border-black/[0.05] dark:border-white/[0.08] py-2.5">
                  <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} alt="" className="h-6 w-6 rounded" onError={(e) => (e.target.style.visibility = "hidden")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">{d}</div>
                    <div className="text-[11.5px] text-zinc-500">{urls.length} feed{urls.length > 1 ? "s" : ""}</div>
                  </div>
                  <button onClick={async () => { await removeFeed(d); reload(); }} className="p-2 text-zinc-400 active:text-red-600"><Trash2 size={17} /></button>
                </motion.li>
              ))}
            </ul>
          </Sheet>
        )}
        {sheet === "terms" && (
          <Sheet title="Rehamna words" onClose={() => setSheet(null)}>
            <p className="mb-3 text-[13px] text-zinc-500">One word or phrase per line.</p>
            <textarea dir="auto" rows={12} className={`${field} ar`} value={terms} onChange={(e) => setTerms(e.target.value)} />
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f26b1d] py-3.5 font-bold text-white" onClick={async () => {
              await kvSet("terms.rehamna", terms.split("\n").map((s) => s.trim()).filter(Boolean));
              onDataChanged();
              setSheet(null);
              notify("Saved");
            }}><Check size={17} /> Save</button>
          </Sheet>
        )}
        {sheet === "ai" && (
          <Sheet title="AI summaries" onClose={() => setSheet(null)}>
            <p className="mb-3 text-[13px] text-zinc-500">Get a key at openrouter.ai. It stays on this phone and powers summaries and the newspaper editorial.</p>
            <input className={field} placeholder="sk-or-…" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} />
            <input className={`${field} mt-2`} placeholder="openai/gpt-4o-mini" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f26b1d] py-3.5 font-bold text-white" onClick={async () => {
              await kvSet("ai.key", ai.key.trim());
              await kvSet("ai.model", ai.model.trim() || "openai/gpt-4o-mini");
              setSheet(null);
              notify("Saved");
            }}><Check size={17} /> Save</button>
          </Sheet>
        )}
        {sheet === "theme" && (
          <Sheet title="Appearance" onClose={() => setSheet(null)}>
            <Segmented id="theme" value={theme} onChange={setTheme} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
          </Sheet>
        )}
        {sheet === "retention" && (
          <Sheet title="Keep stories for" onClose={() => setSheet(null)}>
            <Segmented id="ret" value={retention} onChange={async (v) => { setRetention(v); await kvSet("settings.retention", v); }}
              options={[[7, "7 days"], [30, "30 days"], [90, "90 days"]]} />
            <p className="mt-3 text-[12.5px] text-zinc-500">Bookmarked stories are always kept.</p>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
