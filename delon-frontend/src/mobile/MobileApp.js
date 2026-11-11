// Standalone Delon for Android: everything runs on the phone.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import { Home, Newspaper, LayoutGrid, Bookmark, Menu, Share, Link2, EyeOff } from "lucide-react";
import "../css/index.css";
import "./mobile.css";

import { HomeScreen, ListPage, CategoriesScreen, SavedScreen, MenuScreen, StatsPage } from "./Screens";
import ArticleScreen, { shareArticle, copyLink } from "./ArticleScreen";
import { Sheet, SheetAction } from "./ui";
import { syncAll, loadArticles, rememberDeleted } from "./engine/feeds";
import { putArticles, deleteArticle, kvGet } from "./engine/store";

const TABS = [
  ["home", "Home", Home],
  ["rehamna", "Rehamna", Newspaper],
  ["categories", "Categories", LayoutGrid],
  ["saved", "Bookmarks", Bookmark],
  ["menu", "Menu", Menu],
];
const AUTO_SYNC_MIN = 30;

const notify = (text) =>
  toast(text, { position: "top-center", className: "!rounded-full !text-[13px] !font-semibold !bg-[#111] !text-white" });

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
  const [page, setPage] = useState(null); // pushed screen: {type, value}
  const [articles, setArticles] = useState([]);
  const [open, setOpen] = useState(null);
  const [moreFor, setMoreFor] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [last, setLast] = useState(null);
  const [readList, setReadList] = useStored("delon.m.read", []);
  const [theme, setTheme] = useStored("delon.theme", "light");
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
      notify(r.added ? `${r.added} new stories` : "You're up to date");
    } catch (e) {
      notify("Update failed — check your connection");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      reload();
    }
  }, [reload]);

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

  // Android back button: close sheet → article → pushed page → go Home → exit
  useEffect(() => {
    let sub;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          if (moreFor) setMoreFor(null);
          else if (open) setOpen(null);
          else if (page) setPage(null);
          else if (tab !== "home") setTab("home");
          else App.exitApp();
        })
      )
      .then((s) => (sub = s))
      .catch(() => {});
    return () => sub && sub.remove && sub.remove();
  }, [open, tab, page, moreFor]);

  const openArticle = (a) => {
    setOpen(a);
    setReadList((p) => Array.from(new Set([...p, a.id])).slice(-8000));
  };

  const toggleBookmark = async (a) => {
    const updated = { ...a, bookmarked: !a.bookmarked };
    if (open && open.id === a.id) setOpen(updated);
    setArticles((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    const { rehamna, ...plain } = updated;
    await putArticles([plain]);
    if (!open) notify(updated.bookmarked ? "Saved to Bookmarks" : "Removed from Bookmarks");
  };

  const remove = async (a) => {
    await deleteArticle(a.id);
    await rememberDeleted(a);
    setArticles((list) => list.filter((x) => x.id !== a.id));
    if (open && open.id === a.id) setOpen(null);
    notify("Story removed");
  };

  const switchTab = (t) => {
    setPage(null);
    if (t === tab && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    setTab(t);
  };

  const common = { articles, readIds, onOpen: openArticle, onMore: setMoreFor, onBookmark: toggleBookmark };
  const screens = {
    home: <HomeScreen {...common} syncing={syncing} progress={progress} last={last} onSync={sync} scrollRef={scrollRef} openPage={setPage} />,
    rehamna: <ListPage {...common} page={{ type: "rehamna" }} onBack={() => switchTab("home")} notify={notify} />,
    categories: <CategoriesScreen articles={articles} openPage={setPage} />,
    saved: <SavedScreen {...common} />,
    menu: <MenuScreen articles={articles} theme={theme} setTheme={setTheme} notify={notify} onDataChanged={reload} openPage={setPage} />,
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mobile-app fixed inset-0 bg-white dark:bg-[#111113] text-zinc-900 dark:text-zinc-100 antialiased">
        <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            {screens[tab]}
          </motion.div>
        </div>

        {/* pushed pages (category, source, stats…) */}
        <AnimatePresence>
          {page && (
            <motion.div key={`${page.type}-${page.value || ""}`} className="absolute inset-0 z-20 overflow-y-auto bg-white dark:bg-[#111113]"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}>
              {page.type === "stats" ? (
                <StatsPage articles={articles} onBack={() => setPage(null)} />
              ) : (
                <ListPage {...common} page={page} onBack={() => setPage(null)} notify={notify} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* black bottom navigation */}
        <nav className="absolute inset-x-0 bottom-0 z-30 rounded-t-[18px] bg-[#111] pb-[env(safe-area-inset-bottom)]">
          <div className="grid h-[62px] grid-cols-5">
            {TABS.map(([id, label, Icon]) => {
              const active = tab === id && !page;
              return (
                <motion.button key={id} whileTap={{ scale: 0.86 }} onClick={() => switchTab(id)}
                  className={`relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${active ? "text-[#f26b1d]" : "text-white/55"}`}>
                  {active && <motion.span layoutId="nav-dot" className="absolute top-1.5 h-1 w-1 rounded-full bg-[#f26b1d]" />}
                  <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
                  <span>{label}</span>
                </motion.button>
              );
            })}
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <ArticleScreen key={open.id} article={open} onBack={() => setOpen(null)}
              onToggleBookmark={() => toggleBookmark(open)} onDelete={() => remove(open)} notify={notify} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {moreFor && (
            <Sheet onClose={() => setMoreFor(null)}>
              <SheetAction icon={<Share size={19} />} label="Share to …" onClick={() => { shareArticle(moreFor); setMoreFor(null); }} />
              <SheetAction icon={<Link2 size={19} />} label="Copy link" onClick={() => { copyLink(moreFor, notify); setMoreFor(null); }} />
              <SheetAction icon={<Bookmark size={19} />} label={moreFor.bookmarked ? "Remove bookmark" : "Bookmark"} onClick={() => { toggleBookmark(moreFor); setMoreFor(null); }} />
              <SheetAction icon={<EyeOff size={19} />} label="Not interesting" danger onClick={() => { remove(moreFor); setMoreFor(null); }} />
            </Sheet>
          )}
        </AnimatePresence>
        <Toaster />
      </div>
    </MotionConfig>
  );
}
