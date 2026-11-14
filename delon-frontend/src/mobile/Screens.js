import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { RefreshCw, Newspaper, Search, X, Loader2, Plus, Trash2, Check, Menu, Printer, ChevronLeft } from "lucide-react";
import { LeadCard, GridCard, DispatchRow, ArchiveCard, Chips, Segmented, Sheet, Empty, Kicker } from "./ui";
import { timeAgo } from "../lib/format";
import { CATEGORIES } from "./engine/classify";
import { buildNewspaper, collect, savePdf } from "./engine/newspaper";
import { editorial as aiEditorial, aiConfig } from "./engine/ai";
import { getFeeds, addFeed, removeFeed, getTerms, saveRehamnaTerms } from "./engine/feeds";
import { kvGet, kvSet, clearAll } from "./engine/store";
import { stripHtml } from "./engine/classify";
import Analytics from "../components/reader/Analytics";
import { overview } from "./engine/analytics";

const now = new Date();
const VOL = `VOL. ${now.getFullYear() - 2023} · NO. ${Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)}`;
const AR_DATE = new Intl.DateTimeFormat("ar-MA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------- masthead
export function Masthead({ title = "DELON", left, right, sub }) {
  return (
    <div className="paper line sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)]">
      <div className="grid h-[64px] grid-cols-[44px_1fr_44px] items-center px-3" dir="ltr">
        <div>{left}</div>
        <div className="text-center leading-none">
          <div className="mono muted text-[8.5px]">{sub || VOL}</div>
          <div className="latin-serif ink mt-1 text-[22px] font-black tracking-[0.06em]">{title}</div>
        </div>
        <div className="flex justify-end">{right}</div>
      </div>
    </div>
  );
}

const IconBtn = ({ children, onClick }) => (
  <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} className="ink flex h-10 w-10 items-center justify-center">{children}</motion.button>
);

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
        <motion.div style={{ rotate }} className="rust mb-2"><RefreshCw size={20} /></motion.div>
      </motion.div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- front page
export function HomeScreen({ articles, readIds, onOpen, syncing, progress, last, onSync, scrollRef, onMenu }) {
  const [section, setSection] = useState("front");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  const list = useMemo(() => {
    let l = articles;
    if (section !== "front") l = l.filter((a) => a.category === section);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      l = l.filter((a) => `${a.title} ${a.content || ""} ${a.source}`.toLowerCase().includes(t));
    }
    return l;
  }, [articles, section, q]);
  const lead = list.find((a) => a.image_url && a.image_url !== "No Image") || list[0];
  const rest = list.filter((a) => a !== lead);
  const grid = rest.slice(0, 4);
  const rows = rest.slice(4);

  return (
    <PullToRefresh onRefresh={onSync} scrollRef={scrollRef}>
      <Masthead
        left={<IconBtn onClick={onMenu}><Menu size={20} /></IconBtn>}
        right={<IconBtn onClick={() => setSearching((s) => !s)}>{searching ? <X size={20} /> : <Search size={19} />}</IconBtn>}
      />
      {/* section tabs */}
      <div className="paper line sticky top-[calc(env(safe-area-inset-top)+64px)] z-10 border-b">
        <div className="flex gap-5 overflow-x-auto px-4" dir="rtl">
          {[["front", "الصفحة الأولى"], ...CATEGORIES.map((c) => [c, c])].map(([v, label]) => (
            <button key={v} onClick={() => setSection(v)} className={`relative shrink-0 py-2.5 text-[13px] font-bold ${section === v ? "rust" : "muted"}`}>
              {label}
              {section === v && <motion.span layoutId="section-line" className="bg-rust absolute inset-x-0 -bottom-px h-[2px]" />}
            </button>
          ))}
        </div>
        {syncing && (
          <div className="h-[2px] bg-[var(--rust-soft)]"><motion.div className="bg-rust h-full" animate={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
        )}
      </div>

      <AnimatePresence>
        {searching && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} dir="auto" placeholder="ابحث في الأرشيف…"
              className="card ink serif mt-3 w-full rounded-xl px-4 py-2.5 text-[15px] outline-none" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-4 pb-2 pt-3" dir="rtl">
        <span className="serif muted text-[12.5px]">{AR_DATE.format(now)}</span>
        <button onClick={onSync} className="label muted flex items-center gap-1" dir="ltr" style={{ fontSize: 9.5 }}>
          <RefreshCw size={11} className={syncing ? "rust animate-spin" : ""} />
          {syncing ? `${Math.round(progress * 100)}%` : last ? `Updated ${timeAgo(last)}` : "Update"}
        </button>
      </div>

      {list.length === 0 ? (
        <Empty icon="🗞️" title={syncing ? "الأخبار في الطريق…" : "لا توجد أخبار بعد"}
          text={syncing ? "Reading all your sources — this takes a minute." : "Pull down to fetch today's news."} />
      ) : (
        <div className="px-4 pb-28">
          {lead && <LeadCard article={lead} onOpen={onOpen} />}
          {grid.length > 0 && (
            <>
              <div className="my-5 flex items-center gap-3" aria-hidden>
                <span className="rule flex-1" /><span className="label rust">In this edition</span><span className="rule flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {grid.map((a, i) => <GridCard key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} />)}
              </div>
            </>
          )}
          {rows.length > 0 && (
            <>
              <div className="double-rule mt-6" />
              <div className="label ink mt-3 text-center">Latest dispatches</div>
              {rows.map((a, i) => <DispatchRow key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} />)}
            </>
          )}
        </div>
      )}
    </PullToRefresh>
  );
}

// ---------------------------------------------------------------- rehamna
export function RehamnaScreen({ articles, readIds, onOpen, notify }) {
  const [sheet, setSheet] = useState(false);
  const [period, setPeriod] = useState("recent"); // today + yesterday by default
  const reh = articles.filter((a) => a.rehamna);
  const dayStart = (offset) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    return d;
  };
  const pub = (a) => new Date(a.pubDate);
  const todayList = reh.filter((a) => pub(a) >= dayStart(0));
  const yesterdayList = reh.filter((a) => pub(a) >= dayStart(1) && pub(a) < dayStart(0));
  const weekList = reh.filter((a) => pub(a) >= dayStart(6));
  const shown = { recent: [...todayList, ...yesterdayList], today: todayList, yesterday: yesterdayList, week: weekList, all: reh }[period];

  return (
    <div className="pb-28">
      <Masthead title="REHAMNA" sub="THE PROVINCE DISPATCH" />
      <div className="px-4 pt-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card rounded-2xl p-5 text-center" dir="rtl">
          <Kicker center>جريدة الرحامنة اليومية</Kicker>
          <div className="serif ink mt-1 text-[30px] font-bold">أخبار الرحامنة</div>
          <div className="double-rule mx-auto mt-3 w-2/3" />
          <div className="mt-4 grid grid-cols-3">
            {[[todayList.length, "اليوم"], [yesterdayList.length, "أمس"], [weekList.length, "هذا الأسبوع"]].map(([n, l], i) => (
              <div key={l} className={i ? "line border-r" : ""}>
                <div className="latin-serif ink text-[30px] font-black tabular-nums">{n}</div>
                <div className="muted text-[12px]">{l}</div>
              </div>
            ))}
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet(true)}
            className="bg-rust mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white">
            <Printer size={18} /> إنشاء الصفحة الأولى PDF
          </motion.button>
        </motion.div>
      </div>

      <div className="mt-5 px-4">
        <Chips id="reh" value={period} onChange={setPeriod}
          options={[["recent", "اليوم وأمس"], ["today", "اليوم"], ["yesterday", "أمس"], ["week", "الأسبوع"], ["all", "الكل"]]} />
      </div>
      <div className="px-4">
        {shown.length === 0 ? (
          <Empty icon="🗞️" title={reh.length ? "لا توجد أخبار في هذه الفترة" : "لا توجد أخبار عن الرحامنة بعد"}
            text={reh.length ? "اختر الأسبوع أو الكل لرؤية أخبار أقدم." : "Update the news from the Front page."} />
        ) : (
          shown.map((a, i) => <DispatchRow key={a.id} article={a} index={i} unread={!readIds.has(a.id)} onOpen={onOpen} />)
        )}
      </div>
      <AnimatePresence>{sheet && <NewspaperSheet articles={articles} onClose={() => setSheet(false)} notify={notify} />}</AnimatePresence>
    </div>
  );
}

function NewspaperSheet({ articles, onClose, notify }) {
  const [days, setDays] = useState(2);
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
    <Sheet title="Print the front page" onClose={busy ? () => {} : onClose}>
      <p className="serif muted mb-4 text-center text-[14px] italic leading-7">
        A newspaper-style PDF with photos, set on your phone from every dispatch about Rehamna.
      </p>
      <div className="label muted mb-2">Edition</div>
      <Segmented id="np" value={days} onChange={setDays} options={[[1, "اليوم"], [2, "اليوم وأمس"], [7, "الأسبوع"], [30, "الشهر"]]} />
      <label className="card mt-4 flex items-center justify-between rounded-xl px-4 py-3">
        <span className="ink text-[14px] font-semibold">
          AI editorial
          <span className="muted block text-[11.5px] font-normal">{hasKey ? "Written from all the stories" : "Add an OpenRouter key in Settings"}</span>
        </span>
        <input type="checkbox" checked={useAi && hasKey} disabled={!hasKey} onChange={(e) => setUseAi(e.target.checked)} className="h-5 w-5 accent-[#b4532a]" />
      </label>
      {busy ? (
        <div className="mt-6">
          <div className="muted mb-2 flex justify-between text-[12.5px]"><span>{busy.msg}</span><span className="mono">{Math.round(busy.p * 100)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
            <motion.div className="bg-rust h-full rounded-full" animate={{ width: `${busy.p * 100}%` }} />
          </div>
        </div>
      ) : (
        <motion.button whileTap={{ scale: 0.97 }} onClick={generate}
          className="bg-rust mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white">
          <Newspaper size={18} /> Create newspaper
        </motion.button>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- archives (saved)
export function SavedScreen({ articles, onOpen, goFront }) {
  const [filter, setFilter] = useState("all");
  const saved = articles.filter((a) => a.bookmarked && (filter === "all" || a.category === filter));
  const cats = [...new Set(articles.filter((a) => a.bookmarked).map((a) => a.category).filter(Boolean))];
  return (
    <div className="pb-28">
      <div className="pt-[calc(env(safe-area-inset-top)+22px)] text-center">
        <div className="latin-serif ink text-[26px] font-black tracking-[0.12em]">THE ARCHIVES</div>
        <div className="label muted mt-1" style={{ fontSize: 8.5, letterSpacing: "0.22em" }}>Personal collection &amp; saved dispatches</div>
      </div>
      <div className="mt-5 px-4">
        <Chips id="arch" value={filter} onChange={setFilter} options={[["all", "كل المحفوظات"], ...cats.map((c) => [c, c])]} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-3">
        {saved.map((a, i) => <ArchiveCard key={a.id} article={a} index={i} onOpen={onOpen} />)}
        <motion.button whileTap={{ scale: 0.96 }} onClick={goFront}
          className="line muted flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--muted)]"><Plus size={18} /></span>
          <span className="label" style={{ fontSize: 9 }}>Add clipping</span>
        </motion.button>
      </div>
      {saved.length === 0 && <p className="serif muted px-8 pt-6 text-center text-[13.5px] italic">Tap the bookmark on any story to keep it in your archives.</p>}
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
      <Masthead title="THE LEDGER" sub="FIGURES & STATISTICS" />
      <div className="gz-stats">
        <Analytics compact loader={async (d) => overview(articles, d, feedsCount)} key={`${articles.length}-${feedsCount}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- settings
const Group = ({ title, children }) => (
  <div className="mb-6">
    {title && <div className="label rust mb-2 px-5">{title}</div>}
    <div className="card mx-4 divide-y divide-[var(--line)] overflow-hidden rounded-2xl">{children}</div>
  </div>
);
const Row = ({ label, value, onClick, danger }) => (
  <button onClick={onClick} className={`flex w-full items-center justify-between px-4 py-3.5 text-left text-[15px] ${danger ? "text-[#a3322a]" : "ink"}`}>
    <span>{label}</span>
    {value !== undefined && <span className="muted text-[13.5px]">{value}</span>}
  </button>
);
const field = "card ink w-full rounded-xl px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-[#b4532a]/40";

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

  return (
    <div className="pb-28">
      <Masthead title="THE DESK" sub="EDITOR'S SETTINGS" />
      <div className="h-5" />
      <Group title="Newsroom">
        <Row label="Sources" value={`${Object.keys(feeds).length} sites ›`} onClick={() => setSheet("feeds")} />
        <Row label="Rehamna words" value="Edit ›" onClick={() => setSheet("terms")} />
        <Row label="Keep articles for" value={`${retention} days ›`} onClick={() => setSheet("retention")} />
      </Group>
      <Group title="AI (optional)">
        <Row label="OpenRouter key" value={ai.key ? "Saved ✓ ›" : "Not set ›"} onClick={() => setSheet("ai")} />
      </Group>
      <Group title="Appearance">
        <div className="p-3"><Segmented id="theme" value={theme} onChange={setTheme} options={[["system", "System"], ["light", "Paper"], ["dark", "Night"]]} /></div>
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
      <p className="serif muted px-8 text-center text-[13px] italic">Delon works entirely on this phone — no computer or server needed.</p>

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
              <button className="bg-rust flex shrink-0 items-center gap-1 rounded-xl px-4 text-[14px] font-bold text-white" disabled={adding}>
                {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />} Add
              </button>
            </form>
            <ul className="divide-y divide-[var(--line)]">
              {Object.entries(feeds).sort().map(([d, urls]) => (
                <motion.li layout key={d} className="flex items-center gap-3 py-2.5">
                  <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} alt="" className="h-6 w-6 rounded" onError={(e) => (e.target.style.visibility = "hidden")} />
                  <div className="min-w-0 flex-1">
                    <div className="ink truncate text-[14px] font-semibold">{d}</div>
                    <div className="muted text-[11.5px]">{urls.length} feed{urls.length > 1 ? "s" : ""}</div>
                  </div>
                  <button onClick={async () => { await removeFeed(d); reload(); }} className="muted p-2"><Trash2 size={17} /></button>
                </motion.li>
              ))}
            </ul>
          </Sheet>
        )}
        {sheet === "terms" && (
          <Sheet title="Rehamna words" onClose={() => setSheet(null)}>
            <p className="muted mb-3 text-[13px]">One word or phrase per line. Stories containing any of them appear in the Rehamna tab and newspaper.</p>
            <textarea dir="auto" rows={12} className={field} value={terms} onChange={(e) => setTerms(e.target.value)} />
            <button className="bg-rust mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-white" onClick={async () => {
              await saveRehamnaTerms(terms.split("\n").map((s) => s.trim()).filter(Boolean));
              onDataChanged();
              setSheet(null);
              notify("Saved");
            }}><Check size={17} /> Save</button>
          </Sheet>
        )}
        {sheet === "ai" && (
          <Sheet title="AI summaries" onClose={() => setSheet(null)}>
            <p className="muted mb-3 text-[13px]">Get a key at openrouter.ai. It is stored only on this phone and used for summaries and the newspaper editorial.</p>
            <input className={field} placeholder="sk-or-…" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} />
            <input className={`${field} mt-2`} placeholder="openai/gpt-4o-mini" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
            <button className="bg-rust mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-white" onClick={async () => {
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
            <p className="muted mt-3 text-[12.5px]">Saved articles are always kept.</p>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

export { ChevronLeft };
