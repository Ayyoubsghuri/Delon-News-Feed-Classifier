import React from "react";
import { Search, PanelLeft, CheckCheck, ChevronLeft, FileDown } from "lucide-react";
import { timeAgo, stripHtml } from "../../lib/format";

export default function ArticleList({
  title, articles, selectedId, onSelect, readIds, query, setQuery, onMarkAllRead,
  onToggleSidebar, onBack, loading, isRehamna, onNewspaper,
}) {
  return (
    <section className="flex h-full w-full flex-col bg-white dark:bg-[#1c1c1e] border-r border-black/10 dark:border-white/10">
      <header className="shrink-0 border-b border-black/[0.06] dark:border-white/10 pt-safe">
        <div className="flex h-12 items-center gap-1 px-3 text-zinc-500">
          {onBack ? (
            <button className="tb-btn" onClick={onBack} title="Back"><ChevronLeft size={20} /></button>
          ) : (
            <button className="tb-btn" onClick={onToggleSidebar} title="Toggle sidebar"><PanelLeft size={17} /></button>
          )}
          <button className="tb-btn" onClick={onMarkAllRead} title="Mark all as read"><CheckCheck size={17} /></button>
          {isRehamna && (
            <button className="tb-btn !w-auto px-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400"
              onClick={onNewspaper} title="Generate front-page PDF">
              <FileDown size={15} className="mr-1" /> PDF
            </button>
          )}
          <div className="ml-auto text-right">
            <div className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 leading-tight" dir="auto">{title}</div>
            <div className="text-[11px] text-zinc-400 leading-tight">{articles.length} items</div>
          </div>
        </div>
        <div className="px-3 pb-2">
          <label className="flex items-center gap-2 rounded-md bg-black/[0.05] dark:bg-white/[0.08] px-2 py-1.5 text-zinc-500">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              dir="auto"
              className="w-full bg-transparent text-[13px] text-zinc-800 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
            />
          </label>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && articles.length === 0 && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 w-5/6 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-3 w-3/5 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-2 w-2/5 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        )}
        {!loading && articles.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-400">Nothing here.</div>
        )}
        <ul>
          {articles.map((a) => {
            const active = a.id === selectedId;
            const unread = !readIds.has(a.id);
            return (
              <li key={a.id}>
                <button
                  onClick={() => onSelect(a)}
                  className={`block w-full border-b border-black/[0.05] dark:border-white/[0.06] px-4 py-3 text-left transition-colors
                    ${active ? "bg-black/[0.07] dark:bg-white/[0.1]" : "hover:bg-black/[0.025] dark:hover:bg-white/[0.04]"}`}
                >
                  <h3
                    dir="auto"
                    className={`text-[14px] leading-snug line-clamp-3 ${unread ? "font-bold text-zinc-900 dark:text-white" : "font-medium text-zinc-500 dark:text-zinc-400"}`}
                  >
                    {stripHtml(a.title)}
                  </h3>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className={`h-[7px] w-[7px] shrink-0 rounded-full border ${unread ? "border-blue-500 bg-blue-500" : "border-zinc-300 dark:border-zinc-600"}`} />
                    <span className="truncate">{a.source || a.author}</span>
                    {a.category && (
                      <span className="hidden sm:inline truncate rounded bg-black/[0.05] dark:bg-white/10 px-1.5 py-[1px] text-[10px]" dir="rtl">{a.category}</span>
                    )}
                    <span className="ml-auto shrink-0 tabular-nums">{timeAgo(a.pubDate || a.time || a.timestamp)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
