// Standalone Delon for Android: everything runs on the phone.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { Home, Newspaper, Bookmark, BarChart3, Settings } from "lucide-react";
import "../css/index.css";

import { HomeScreen, RehamnaScreen, SavedScreen, StatsScreen, SettingsScreen } from "./Screens";
import ArticleScreen from "./ArticleScreen";
import { syncAll, loadArticles, rememberDeleted } from "./engine/feeds";
import { putArticles, deleteArticle, kvGet } from "./engine/store";

const TABS = [
  ["home", "Home", Home],
  ["rehamna", "Rehamna", Newspaper],
  ["saved", "Saved", Bookmark],
  ["stats", "Stats", BarChart3],
  ["settings", "Settings", Settings],
];
const AUTO_SYNC_MIN = 30;

const notify = (text) =>
  toast(text, { position: "top-center", className: "!rounded-full !text-[13px] !font-semibold dark:!bg-zinc-800 dark:!text-white" });

function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch (_) {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (_) {}
  }, [key, v]);
  return [v, setV];
}

export default function MobileApp() {
  const [tab, setTab] = useState("home");
  const [articles, setArticles] = useState([]);
  const [open, setOpen] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [last, setLast] = useState(null);
  const [readList, setReadList] = useStored("delon.m.read", []);
  const [theme, setTheme] = useStored("delon.theme", "system");
  const readIds = useMemo(() => new Set(readList), [readList]);
  const scrollRef = useRef(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const reload = useCallback(async () => {
    setArticles(await loadArticles());
    const l = await kvGet("sync.last", null);
    setLast(l ? new Date(l).toISOString() : null);
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setProgress(0.02);
    try {
      const first = !(await kvGet("sync.last", null));
      const r = await syncAll({ firstRun: first, onProgress: ({ done, total }) => setProgress(done / total) });
      notify(r.added ? `${r.added} new articles` : "You're up to date");
    } catch (e) {
      notify("Update failed — check the internet connection");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      reload();
    }
  }, [reload]);

  // initial load, auto-update when stale, and again when the app comes back
  useEffect(() => {
    const maybeSync = async () => {
      const l = await kvGet("sync.last", 0);
      if (Date.now() - l > AUTO_SYNC_MIN * 60000) sync();
    };
    reload().then(maybeSync);
    let sub;
    import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => isActive && maybeSync()))
      .then((s) => (sub = s))
      .catch(() => {});
    return () => sub && sub.remove && sub.remove();
  }, [reload, sync]);

  // Android back button closes the article first
  useEffect(() => {
    let sub;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          if (open) setOpen(null);
          else if (tab !== "home") setTab("home");
          else App.exitApp();
        })
      )
      .then((s) => (sub = s))
      .catch(() => {});
    return () => sub && sub.remove && sub.remove();
  }, [open, tab]);

  const openArticle = (a) => {
    setOpen(a);
    setReadList((p) => Array.from(new Set([...p, a.id])).slice(-8000));
  };

  const toggleBookmark = async () => {
    const updated = { ...open, bookmarked: !open.bookmarked };
    setOpen(updated);
    setArticles((list) => list.map((a) => (a.id === updated.id ? updated : a)));
    const { rehamna, ...plain } = updated;
    await putArticles([plain]);
    notify(updated.bookmarked ? "Saved" : "Removed from saved");
  };

  const remove = async () => {
    await deleteArticle(open.id);
    await rememberDeleted(open);
    setArticles((list) => list.filter((a) => a.id !== open.id));
    setOpen(null);
    notify("Article deleted");
  };

  const switchTab = (t) => {
    if (t === tab && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    setTab(t);
  };

  const screens = {
    home: <HomeScreen articles={articles} readIds={readIds} onOpen={openArticle} syncing={syncing} progress={progress} last={last} onSync={sync} scrollRef={scrollRef} />,
    rehamna: <RehamnaScreen articles={articles} readIds={readIds} onOpen={openArticle} notify={notify} />,
    saved: <SavedScreen articles={articles} readIds={readIds} onOpen={openArticle} />,
    stats: <StatsScreen articles={articles} />,
    settings: <SettingsScreen theme={theme} setTheme={setTheme} notify={notify} onDataChanged={reload} />,
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mobile-app fixed inset-0 bg-[#f2f3f5] dark:bg-[#0e0e10] text-zinc-900 dark:text-zinc-100 font-ui antialiased">
        <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto overscroll-contain">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            {screens[tab]}
          </motion.div>
        </div>

        {/* bottom tab bar */}
        <nav className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-30 grid grid-cols-5 rounded-[26px] bg-white/85 dark:bg-[#1f2023]/85 p-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl">
          {TABS.map(([id, label, Icon]) => {
            const active = tab === id;
            return (
              <motion.button key={id} whileTap={{ scale: 0.88 }} onClick={() => switchTab(id)}
                className={`relative flex flex-col items-center gap-0.5 rounded-[20px] py-2 text-[10.5px] font-bold ${active ? "text-white" : "text-zinc-500 dark:text-zinc-400"}`}>
                {active && (
                  <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-[20px] bg-[#b4161b]"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <Icon size={20} className="relative" strokeWidth={active ? 2.4 : 2} />
                <span className="relative">{label}</span>
              </motion.button>
            );
          })}
        </nav>

        <AnimatePresence>
          {open && (
            <ArticleScreen key={open.id} article={open} onBack={() => setOpen(null)} onToggleBookmark={toggleBookmark} onDelete={remove} notify={notify} />
          )}
        </AnimatePresence>
        <Toaster />
      </div>
    </MotionConfig>
  );
}
