import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import "./css/index.css";

import Sidebar from "./components/reader/Sidebar";
import ArticleList from "./components/reader/ArticleList";
import ArticleView from "./components/reader/ArticleView";
import { Modal, AddFeedDialog, NewspaperDialog, SettingsDialog } from "./components/reader/Dialogs";
import Info from "./components/info";
import { apiUrl, fetchJSON, needsServerSetup } from "./lib/api";
import { isToday, parseDate, stripHtml } from "./lib/format";

const DAYS = 7; // how much history the reader keeps in view
const SYNC_EVERY_MS = 60 * 60 * 1000;

function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch (_) {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }, [key, value]);
  return [value, setValue];
}

function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

const notify = (text) => toast(text, { position: "bottom-center", style: { fontSize: 13 } });
const sortByDate = (list) =>
  [...list].sort(
    (a, b) =>
      (parseDate(b.pubDate || b.timestamp) || 0) - (parseDate(a.pubDate || a.timestamp) || 0)
  );

export default function App() {
  const isMobile = useIsMobile();
  const [articles, setArticles] = useState([]);
  const [rehamna, setRehamna] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState({ type: "today" });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [readList, setReadList] = useStored("delon.read", []);
  const [bookmarks, setBookmarks] = useStored("delon.bookmarks", {});
  const [theme, setTheme] = useStored("delon.theme", "system");
  const [showSidebar, setShowSidebar] = useStored("delon.sidebar", true);
  const [mobileView, setMobileView] = useState("list"); // sidebar | list | article
  const [dialog, setDialog] = useState(needsServerSetup() ? "setup" : null);
  const syncingRef = useRef(false);

  const readIds = useMemo(() => new Set(readList), [readList]);

  // ---------- theme ----------
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // ---------- data ----------
  const load = useCallback(async () => {
    if (needsServerSetup()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [all, reh] = await Promise.all([
        fetchJSON(`/articles?days=${DAYS}`),
        fetchJSON(`/rehamna/articles?days=${DAYS}&limit=120`).catch(() => ({ articles: [] })),
      ]);
      setArticles(sortByDate(all.articles || []));
      setRehamna(reh.articles || []);
    } catch (e) {
      notify("Cannot reach the Delon server — check Settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current || needsServerSetup()) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await fetch(apiUrl("/fetch-rss"));
      const data = await res.json();
      if (data.status === "success") {
        notify(`Updated · ${data.article_count || 0} articles from ${data.feeds_total || 0} feeds`);
      }
    } catch (_) {
      notify("Refresh failed");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      load();
    }
  }, [load]);

  useEffect(() => {
    load().then(sync);
    const t = setInterval(sync, SYNC_EVERY_MS);
    return () => clearInterval(t);
  }, [load, sync]);

  // ---------- derived ----------
  const bookmarkList = useMemo(() => sortByDate(Object.values(bookmarks)), [bookmarks]);

  const categories = useMemo(() => {
    const out = {};
    for (const a of articles) {
      const cat = a.category || "مختلفات";
      const src = a.source || "unknown";
      out[cat] = out[cat] || {};
      out[cat][src] = out[cat][src] || { count: 0, link: a.link };
      out[cat][src].count += readIds.has(a.id) ? 0 : 1;
    }
    return out;
  }, [articles, readIds]);

  const counts = useMemo(
    () => ({
      unread: articles.filter((a) => !readIds.has(a.id)).length,
      today: articles.filter((a) => isToday(a.pubDate || a.timestamp) && !readIds.has(a.id)).length,
      bookmarks: bookmarkList.length,
      rehamna: rehamna.filter((a) => !readIds.has(a.id)).length,
    }),
    [articles, readIds, bookmarkList, rehamna]
  );

  const { listTitle, visible } = useMemo(() => {
    let list = articles;
    let title = "All";
    switch (filter.type) {
      case "unread":
        list = articles.filter((a) => !readIds.has(a.id) || (selected && a.id === selected.id));
        title = "Unread";
        break;
      case "today":
        list = articles.filter((a) => isToday(a.pubDate || a.timestamp));
        title = "Today";
        break;
      case "bookmarks":
        list = bookmarkList;
        title = "Bookmarks";
        break;
      case "rehamna":
        list = sortByDate(rehamna);
        title = "أخبار الرحامنة";
        break;
      case "category":
        list = articles.filter((a) => (a.category || "مختلفات") === filter.value);
        title = filter.value;
        break;
      case "source": {
        const [cat, src] = filter.value.split("::");
        list = articles.filter((a) => (a.category || "مختلفات") === cat && a.source === src);
        title = src;
        break;
      }
      default:
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        `${a.title} ${stripHtml(a.description)} ${a.content || ""} ${a.source}`.toLowerCase().includes(q)
      );
    }
    return { listTitle: title, visible: list };
  }, [articles, rehamna, bookmarkList, filter, query, readIds, selected]);

  // ---------- actions ----------
  const markRead = (id, read = true) =>
    setReadList((prev) => {
      const set = new Set(prev);
      read ? set.add(id) : set.delete(id);
      return Array.from(set).slice(-8000);
    });

  const selectArticle = (a) => {
    setSelected(a);
    markRead(a.id);
    if (isMobile) setMobileView("article");
  };

  const chooseFilter = (f) => {
    setFilter(f);
    setSelected(null);
    if (isMobile) setMobileView("list");
  };

  const markAllRead = () => {
    setReadList((prev) => Array.from(new Set([...prev, ...visible.map((a) => a.id)])).slice(-8000));
    notify(`Marked ${visible.length} as read`);
  };

  const toggleBookmark = () => {
    if (!selected) return;
    setBookmarks((prev) => {
      const next = { ...prev };
      if (next[selected.id]) delete next[selected.id];
      else next[selected.id] = selected;
      return next;
    });
  };

  const deleteSelected = async () => {
    if (!selected) return;
    const { id, title } = selected;
    try {
      await fetch(
        apiUrl(`/delete?article_id=${encodeURIComponent(id)}&article_title=${encodeURIComponent(title)}`),
        { method: "DELETE" }
      );
    } catch (_) {}
    setArticles((p) => p.filter((a) => a.id !== id));
    setRehamna((p) => p.filter((a) => a.id !== id));
    setSelected(null);
    if (isMobile) setMobileView("list");
    notify("Article deleted");
  };

  // ---------- layout ----------
  const sidebar = (
    <Sidebar
      filter={filter}
      setFilter={chooseFilter}
      counts={counts}
      categories={categories}
      syncing={syncing}
      onSync={sync}
      onAddFeed={() => setDialog("add")}
      onCharts={() => setDialog("charts")}
      onSettings={() => setDialog("settings")}
      onNewspaper={() => setDialog("newspaper")}
    />
  );
  const list = (
    <ArticleList
      title={listTitle}
      articles={visible}
      selectedId={selected && selected.id}
      onSelect={selectArticle}
      readIds={readIds}
      query={query}
      setQuery={setQuery}
      loading={loading}
      onMarkAllRead={markAllRead}
      onToggleSidebar={() => setShowSidebar((s) => !s)}
      onBack={isMobile ? () => setMobileView("sidebar") : null}
      isRehamna={filter.type === "rehamna"}
      onNewspaper={() => setDialog("newspaper")}
    />
  );
  const view = (
    <ArticleView
      article={selected}
      bookmarked={!!(selected && bookmarks[selected.id])}
      onToggleBookmark={toggleBookmark}
      onDelete={deleteSelected}
      onMarkUnread={() => selected && markRead(selected.id, false)}
      onBack={isMobile ? () => setMobileView("list") : null}
      notify={notify}
    />
  );

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-white text-zinc-900 dark:bg-[#1c1c1e] dark:text-zinc-100 font-ui antialiased">
      {isMobile ? (
        <div className="h-full">
          {mobileView === "sidebar" && sidebar}
          {mobileView === "list" && list}
          {mobileView === "article" && view}
        </div>
      ) : (
        <div className="flex h-full">
          {showSidebar && (
            <div className="w-[250px] shrink-0 border-r border-black/10 dark:border-black/40">{sidebar}</div>
          )}
          <div className="w-[320px] lg:w-[340px] shrink-0">{list}</div>
          <div className="min-w-0 flex-1">{view}</div>
        </div>
      )}

      {dialog === "add" && <AddFeedDialog onClose={() => setDialog(null)} notify={notify} />}
      {dialog === "newspaper" && (
        <NewspaperDialog onClose={() => setDialog(null)} count={rehamna.filter((a) => isToday(a.pubDate || a.timestamp)).length} />
      )}
      {(dialog === "settings" || dialog === "setup") && (
        <SettingsDialog
          firstRun={dialog === "setup"}
          theme={theme}
          setTheme={setTheme}
          onClose={() => setDialog(null)}
          onSaved={() => load().then(sync)}
        />
      )}
      {dialog === "charts" && (
        <Modal title="Analytics" wide onClose={() => setDialog(null)}>
          <Info />
        </Modal>
      )}
      <Toaster />
    </div>
  );
}
