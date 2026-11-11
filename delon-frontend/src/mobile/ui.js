// Shared building blocks for the mobile app.
import React, { useState } from "react";
import { motion } from "framer-motion";
import { timeAgo, firstImage, stripHtml, faviconFor } from "../lib/format";

export const CAT_COLORS = {
  "شؤون جهوية": "#2a78d6",
  "شؤون أمنية": "#eb6834",
  "شؤون سياسية": "#1baf7a",
  "مجالس منتخبة": "#c98500",
  "مختلفات": "#d55181",
};

export function Favicon({ source, link, size = 16 }) {
  const [bad, setBad] = useState(false);
  const src = faviconFor(source, link);
  if (!src || bad)
    return (
      <span style={{ width: size, height: size }} className="inline-flex items-center justify-center rounded-full bg-zinc-300 dark:bg-zinc-600 text-[9px] font-bold uppercase text-white">
        {(source || "?")[0]}
      </span>
    );
  return <img src={src} alt="" style={{ width: size, height: size }} className="rounded-full bg-white" onError={() => setBad(true)} />;
}

export function Thumb({ article, className }) {
  const [ok, setOk] = useState(true);
  const src = firstImage(article);
  if (!src || !ok) {
    const c = CAT_COLORS[article.category] || "#6b7280";
    return (
      <div className={`${className} flex items-center justify-center`} style={{ background: `linear-gradient(135deg, ${c}22, ${c}55)` }}>
        <span className="text-2xl font-black" style={{ color: c }}>{(stripHtml(article.title) || "؟").trim()[0]}</span>
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" className={`${className} object-cover`} onError={() => setOk(false)} />;
}

export function CategoryTag({ category, light }) {
  if (!category) return null;
  const c = CAT_COLORS[category] || "#6b7280";
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-bold"
      style={light ? { background: "rgba(255,255,255,0.18)", color: "#fff" } : { background: `${c}1a`, color: c }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: light ? "#fff" : c }} />
      {category}
    </span>
  );
}

export function ArticleCard({ article, unread, onOpen, index = 0 }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 10) * 0.035, ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(article)}
      dir="rtl"
      className="flex w-full gap-3 rounded-2xl bg-white dark:bg-[#1f2023] p-3 text-right shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
    >
      <Thumb article={article} className="h-[84px] w-[84px] shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <CategoryTag category={article.category} />
          {unread && <span className="h-2 w-2 rounded-full bg-[#b4161b]" />}
        </div>
        <h3 className={`line-clamp-3 text-[15px] leading-[1.45] ${unread ? "font-bold text-zinc-900 dark:text-white" : "font-semibold text-zinc-500 dark:text-zinc-400"}`}>
          {stripHtml(article.title)}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500" dir="ltr">
          <span className="truncate">{timeAgo(article.pubDate)}</span>
          <span>·</span>
          <span className="truncate">{article.source}</span>
          <Favicon source={article.source} link={article.link} size={14} />
        </div>
      </div>
    </motion.button>
  );
}

export function FeatureCard({ article, onOpen }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.985 }}
      onClick={() => onOpen(article)}
      dir="rtl"
      className="relative block h-64 w-full overflow-hidden rounded-3xl text-right shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)]"
    >
      <Thumb article={article} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <CategoryTag category={article.category} light />
        <h2 className="mt-2 line-clamp-3 text-[20px] font-extrabold leading-[1.4] text-white">{stripHtml(article.title)}</h2>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-white/80" dir="ltr">
          <span>{timeAgo(article.pubDate)}</span>
          <span>·</span>
          <span>{article.source}</span>
          <Favicon source={article.source} link={article.link} size={14} />
        </div>
      </div>
    </motion.button>
  );
}

export function Segmented({ options, value, onChange, id }) {
  return (
    <div className="grid gap-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`relative rounded-lg py-2 text-[13px] ${value === v ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-300"}`}>
          {value === v && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg bg-white dark:bg-zinc-700 shadow"
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
    <motion.div className="fixed inset-0 z-50 flex items-end bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => info.offset.y > 120 && onClose()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] bg-white dark:bg-[#1f2023] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        {title && <h2 className="mb-4 text-[19px] font-extrabold text-zinc-900 dark:text-white">{title}</h2>}
        {children}
      </motion.div>
    </motion.div>
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
