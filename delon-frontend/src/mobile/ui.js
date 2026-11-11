// Shared building blocks for the mobile app (editorial white + orange style).
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, MoreHorizontal } from "lucide-react";
import { timeAgo, firstImage, stripHtml } from "../lib/format";

export const ACCENT = "#f26b1d";

export const CATEGORY_INFO = {
  "شؤون جهوية": { emoji: "🏙️", color: "#2a78d6", hint: "الجهات، المدن، التنمية المحلية" },
  "شؤون أمنية": { emoji: "🚨", color: "#e34948", hint: "الأمن، الحوادث، القضاء" },
  "شؤون سياسية": { emoji: "🏛️", color: "#6250d6", hint: "الحكومة، الأحزاب، البرلمان" },
  "مجالس منتخبة": { emoji: "🗳️", color: "#1baf7a", hint: "الجماعات، المجالس، الانتخابات" },
  "مختلفات": { emoji: "🌍", color: "#c98500", hint: "اقتصاد، ثقافة، رياضة، دولي" },
};
export const CAT_COLORS = Object.fromEntries(Object.entries(CATEGORY_INFO).map(([k, v]) => [k, v.color]));

export function Thumb({ article, className, rounded = "rounded-xl" }) {
  const [ok, setOk] = useState(true);
  const src = article && firstImage(article);
  if (!src || !ok) {
    const info = CATEGORY_INFO[article && article.category] || { emoji: "📰", color: "#9ca3af" };
    return (
      <div className={`${className} ${rounded} flex items-center justify-center`} style={{ background: `linear-gradient(140deg, ${info.color}26, ${info.color}59)` }}>
        <span className="text-[28px]">{info.emoji}</span>
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" className={`${className} ${rounded} object-cover bg-zinc-100 dark:bg-zinc-800`} onError={() => setOk(false)} />;
}

export const Kicker = ({ category, className = "" }) =>
  category ? (
    <div className={`ar text-[11.5px] font-bold text-zinc-400 ${className}`} dir="rtl">{category}</div>
  ) : null;

function Meta({ article, onMore, onBookmark, light }) {
  return (
    <div className={`mt-2 flex items-center gap-1.5 text-[12px] ${light ? "text-white/75" : "text-zinc-400"}`} dir="ltr">
      <span>{timeAgo(article.pubDate)}</span>
      <span className="opacity-60">·</span>
      <span className="truncate">{article.source}</span>
      <span className="flex-1" />
      {onBookmark && (
        <motion.span whileTap={{ scale: 0.8 }} onClick={(e) => { e.stopPropagation(); onBookmark(article); }} className="p-1">
          <Bookmark size={15} className={article.bookmarked ? "fill-[#f26b1d] text-[#f26b1d]" : ""} />
        </motion.span>
      )}
      {onMore && (
        <motion.span whileTap={{ scale: 0.8 }} onClick={(e) => { e.stopPropagation(); onMore(article); }} className="p-1">
          <MoreHorizontal size={16} />
        </motion.span>
      )}
    </div>
  );
}

/** Big lead story: wide photo, then kicker / headline / meta. */
export function LeadStory({ article, onOpen, onMore, onBookmark }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      onClick={() => onOpen(article)} className="cursor-pointer px-4 pb-4">
      <motion.div whileTap={{ scale: 0.985 }}>
        <Thumb article={article} className="aspect-[16/10] w-full" rounded="rounded-2xl" />
      </motion.div>
      <Kicker category={article.category} className="mt-3" />
      <h2 dir="rtl" className="ar mt-1 text-[21px] font-extrabold leading-[1.5] text-zinc-900 dark:text-white">{stripHtml(article.title)}</h2>
      <Meta article={article} onMore={onMore} onBookmark={onBookmark} />
    </motion.div>
  );
}

/** List row: text + square thumbnail (thumbnail on the left for RTL text). */
export function StoryRow({ article, unread, onOpen, onMore, onBookmark, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03 }}
      onClick={() => onOpen(article)}
      className="cursor-pointer border-t border-black/[0.06] dark:border-white/[0.08] px-4 py-4 active:bg-black/[0.02]"
    >
      <div className="flex gap-3" dir="rtl">
        <div className="min-w-0 flex-1">
          <Kicker category={article.category} />
          <h3 className={`ar mt-1 line-clamp-3 text-[15.5px] leading-[1.55] ${unread ? "font-bold text-zinc-900 dark:text-white" : "font-semibold text-zinc-500 dark:text-zinc-400"}`}>
            {stripHtml(article.title)}
          </h3>
        </div>
        <Thumb article={article} className="h-[78px] w-[78px] shrink-0" />
      </div>
      <Meta article={article} onMore={onMore} onBookmark={onBookmark} />
    </motion.div>
  );
}

export function Segmented({ options, value, onChange, id, underline }) {
  if (underline) {
    return (
      <div className="flex border-b border-black/[0.08] dark:border-white/10">
        {options.map(([v, label]) => (
          <button key={v} onClick={() => onChange(v)}
            className={`relative flex-1 py-2.5 text-[14px] font-semibold ${value === v ? "text-[#f26b1d]" : "text-zinc-400"}`}>
            {label}
            {value === v && <motion.span layoutId={`ul-${id}`} className="absolute inset-x-6 -bottom-px h-[2px] rounded bg-[#f26b1d]" />}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex rounded-xl border border-black/[0.08] dark:border-white/10 p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`relative flex-1 rounded-[10px] py-1.5 text-[12.5px] font-semibold ${value === v ? "text-[#f26b1d]" : "text-zinc-400"}`}>
          {value === v && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[10px] bg-[#f26b1d]/10"
              transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Sheet({ onClose, children, title }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => info.offset.y > 110 && onClose()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-[22px] bg-white dark:bg-[#1c1c1e] px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-2.5"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        {title && <h2 className="mb-4 text-[18px] font-bold text-zinc-900 dark:text-white">{title}</h2>}
        {children}
      </motion.div>
    </motion.div>
  );
}

export function SheetAction({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-4 py-3.5 text-[15.5px] ${danger ? "text-red-600" : "text-zinc-900 dark:text-zinc-100"}`}>
      <span className={danger ? "text-red-600" : "text-zinc-700 dark:text-zinc-300"}>{icon}</span>
      {label}
    </button>
  );
}

export function Empty({ icon, title, text, action }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 py-16 text-center">
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }} className="mb-4 text-5xl">
        {icon}
      </motion.div>
      <div className="text-[16px] font-bold text-zinc-800 dark:text-zinc-100">{title}</div>
      {text && <div className="mt-1 text-[13px] text-zinc-500">{text}</div>}
      {action}
    </motion.div>
  );
}

export function TopBar({ left, center, right, border = true }) {
  return (
    <div className={`sticky top-0 z-20 bg-white/95 dark:bg-[#111113]/95 backdrop-blur pt-[env(safe-area-inset-top)] ${border ? "border-b border-black/[0.06] dark:border-white/[0.08]" : ""}`}>
      <div className="grid h-14 grid-cols-[48px_1fr_48px] items-center px-3">
        <div className="flex justify-start">{left}</div>
        <div className="flex justify-center truncate">{center}</div>
        <div className="flex justify-end">{right}</div>
      </div>
    </div>
  );
}

export const IconBtn = ({ children, onClick, className = "" }) => (
  <motion.button whileTap={{ scale: 0.85 }} onClick={onClick}
    className={`flex h-10 w-10 items-center justify-center rounded-full text-zinc-800 dark:text-zinc-100 ${className}`}>
    {children}
  </motion.button>
);

export function Logo() {
  return (
    <div className="select-none text-center leading-none" dir="ltr">
      <div className="text-[19px] font-black tracking-[0.18em] text-zinc-900 dark:text-white">
        DEL<span className="text-[#f26b1d]">O</span>N
      </div>
      <div className="mt-0.5 text-[8.5px] font-semibold tracking-[0.42em] text-zinc-400">NEWS</div>
    </div>
  );
}

export const Badge = ({ size = 32, onClick }) => (
  <motion.button whileTap={{ scale: 0.9 }} onClick={onClick} style={{ width: size, height: size }}
    className="flex items-center justify-center rounded-full bg-gradient-to-br from-[#ff8a3d] to-[#e2550f] font-black text-white shadow-[0_4px_12px_-4px_rgba(242,107,29,0.7)]">
    <span style={{ fontSize: size * 0.48 }}>D</span>
  </motion.button>
);
