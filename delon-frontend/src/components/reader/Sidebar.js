import React, { useState } from "react";
import {
  Plus, Zap, Circle, CalendarDays, Bookmark, Folder, ChevronRight,
  ChevronDown, Newspaper, BarChart3, Settings, RefreshCw,
} from "lucide-react";
import { faviconFor } from "../../lib/format";

const CATEGORY_ORDER = ["شؤون جهوية", "شؤون أمنية", "شؤون سياسية", "مجالس منتخبة", "مختلفات"];

function Row({ active, icon, label, count, onClick, indent = 0, chevron, onChevron, dir }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" ? onClick() : null)}
      className={`group flex items-center gap-2 rounded-md px-2 py-[5px] text-[13px] cursor-default select-none
        ${active ? "bg-black/[0.09] dark:bg-white/[0.12]" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate text-left text-zinc-800 dark:text-zinc-100" dir={dir}>{label}</span>
      {count > 0 && <span className="text-[11px] tabular-nums text-zinc-500">{count}</span>}
      {chevron !== undefined && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onChevron && onChevron();
          }}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {chevron ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      )}
    </div>
  );
}

function SourceIcon({ source, link }) {
  const [failed, setFailed] = useState(false);
  const src = faviconFor(source, link);
  if (!src || failed) {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded bg-zinc-400 text-[9px] font-bold uppercase text-white">
        {(source || "?").slice(0, 1)}
      </span>
    );
  }
  return <img src={src} alt="" className="h-4 w-4 rounded-[3px]" onError={() => setFailed(true)} />;
}

export default function Sidebar({
  filter, setFilter, counts, categories, onSync, syncing, onAddFeed, onCharts,
  onSettings, onNewspaper,
}) {
  const [open, setOpen] = useState({ "شؤون جهوية": true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const is = (type, value) => filter.type === type && (value === undefined || filter.value === value);

  const sortedCats = Object.keys(categories).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 99) % 99 - (CATEGORY_ORDER.indexOf(b) + 99) % 99
  );

  return (
    <aside className="flex h-full w-full flex-col bg-[#ececee]/90 dark:bg-[#232326] backdrop-blur-xl">
      {/* Toolbar (traffic-light row on macOS) */}
      <div className="flex h-12 shrink-0 items-center justify-end gap-1 px-3 pt-safe text-zinc-500">
        <button title="Add feed" onClick={onAddFeed} className="tb-btn"><Plus size={17} /></button>
        <button title="Analytics" onClick={onCharts} className="tb-btn"><BarChart3 size={17} /></button>
        <button title="Refresh all feeds" onClick={onSync} className="tb-btn" disabled={syncing}>
          {syncing ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={17} />}
        </button>
        <button title="Settings" onClick={onSettings} className="tb-btn"><Settings size={16} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <Row active={is("unread")} onClick={() => setFilter({ type: "unread" })}
          icon={<Circle size={13} className="fill-blue-500 text-blue-500" />} label="Unread" count={counts.unread} />
        <Row active={is("today")} onClick={() => setFilter({ type: "today" })}
          icon={<CalendarDays size={15} className="text-red-500" />} label="Today" count={counts.today} />
        <Row active={is("bookmarks")} onClick={() => setFilter({ type: "bookmarks" })}
          icon={<Bookmark size={15} className="fill-orange-500 text-orange-500" />} label="Bookmarks" count={counts.bookmarks} />

        <div className="mt-4 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Rehamna</div>
        <Row active={is("rehamna")} onClick={() => setFilter({ type: "rehamna" })}
          icon={<Newspaper size={15} className="text-emerald-600" />} label="أخبار الرحامنة" dir="rtl" count={counts.rehamna} />
        <Row onClick={onNewspaper}
          icon={<span className="text-[13px]">🗞️</span>} label="Front page PDF…" />

        <div className="mt-4 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Categories</div>
        {sortedCats.map((cat) => {
          const sources = categories[cat];
          const total = Object.values(sources).reduce((a, b) => a + b.count, 0);
          return (
            <div key={cat}>
              <Row
                active={is("category", cat)}
                onClick={() => setFilter({ type: "category", value: cat })}
                icon={<Folder size={15} className="fill-sky-500 text-sky-500" />}
                label={cat}
                dir="rtl"
                count={total}
                chevron={!!open[cat]}
                onChevron={() => toggle(cat)}
              />
              {open[cat] &&
                Object.entries(sources)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([src, info]) => (
                    <Row
                      key={src}
                      indent={1}
                      active={is("source", `${cat}::${src}`)}
                      onClick={() => setFilter({ type: "source", value: `${cat}::${src}` })}
                      icon={<SourceIcon source={src} link={info.link} />}
                      label={src}
                      count={info.count}
                    />
                  ))}
            </div>
          );
        })}
        {sortedCats.length === 0 && (
          <div className="px-3 py-2 text-xs text-zinc-400">No articles yet — press ⚡ to refresh.</div>
        )}
      </nav>
    </aside>
  );
}
