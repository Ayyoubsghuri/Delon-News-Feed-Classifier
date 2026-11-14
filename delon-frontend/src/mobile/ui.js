// Gazette-style building blocks for the mobile app.
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Feather, Bookmark } from "lucide-react";
import { timeAgo, firstImage, stripHtml, toParagraphs } from "../lib/format";

export const CAT_COLORS = {
  "شؤون جهوية": "#b4532a",
  "شؤون أمنية": "#8f2d24",
  "شؤون سياسية": "#3f5e4a",
  "مجالس منتخبة": "#7a5a2b",
  "مختلفات": "#4f5b73",
};
const CAT_EMOJI = { "شؤون جهوية": "🏛️", "شؤون أمنية": "⚖️", "شؤون سياسية": "📜", "مجالس منتخبة": "🗳️", "مختلفات": "🗞️" };

export const dek = (a, max = 150) => {
  const p = toParagraphs(a.content || a.description)[0] || "";
  const first = p.split(/(?<=[.!؟?])\s+/)[0] || p;
  return first.length > max ? `${first.slice(0, max).replace(/\s+\S*$/, "")}…` : first;
};

export const shortDate = (v) => {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};

export function Photo({ article, className = "", caption = true }) {
  const [ok, setOk] = useState(true);
  const src = firstImage(article);
  if (!src || !ok) {
    return (
      <div className={`${className} flex items-center justify-center`} style={{ background: "repeating-linear-gradient(45deg, var(--card), var(--card) 6px, var(--paper) 6px, var(--paper) 12px)" }}>
        <span className="text-3xl opacity-70">{CAT_EMOJI[article.category] || "🗞️"}</span>
      </div>
    );
  }
  return (
    <div className={`${className} relative overflow-hidden`}>
      <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="h-full w-full object-cover" style={{ filter: "sepia(0.18) contrast(1.02)" }} />
      {caption && (
        <span className="mono absolute bottom-2 right-2 rounded bg-[#faf6ee]/90 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase text-[#2a2119]" dir="ltr">
          Photo: {article.source}
        </span>
      )}
    </div>
  );
}

export const Kicker = ({ children, center }) => (
  <div className={`label rust ${center ? "text-center" : ""}`} style={{ letterSpacing: "0.08em", fontSize: 11 }}>{children}</div>
);

export const Byline = ({ article, center }) => (
  <div className={`label flex items-center gap-1.5 rust ${center ? "justify-center" : ""}`} dir="ltr" style={{ fontSize: 9.5 }}>
    <Feather size={11} /> By {article.source}{article.category ? <> — in <span className="font-[GzKufi] normal-case tracking-normal">{article.category}</span></> : null}
  </div>
);

/** Front-page lead story in a framed card. */
export function LeadCard({ article, onOpen }) {
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
      whileTap={{ scale: 0.985 }} onClick={() => onOpen(article)}
      className="card block w-full overflow-hidden rounded-2xl p-2.5 text-center">
      <Photo article={article} className="aspect-[4/3] w-full rounded-xl" />
      <div className="px-2 pb-3 pt-4" dir="rtl">
        <Kicker center>{article.category || "تقرير خاص"}</Kicker>
        <h2 className="serif ink mt-2 text-[24px] font-bold leading-[1.45]">{stripHtml(article.title)}</h2>
        <p className="serif muted mt-2 text-[14.5px] italic leading-7">{dek(article)}</p>
        <div className="mt-3"><Byline article={article} center /></div>
      </div>
    </motion.button>
  );
}

/** Small framed card for the two-column grid. */
export function GridCard({ article, onOpen, index = 0, unread }) {
  return (
    <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + index * 0.05 }}
      whileTap={{ scale: 0.97 }} onClick={() => onOpen(article)}
      className="card flex flex-col overflow-hidden rounded-2xl p-2 text-right" dir="rtl">
      <Photo article={article} caption={false} className="aspect-square w-full rounded-xl" />
      <div className="px-1 pb-1 pt-2.5">
        <Kicker>{article.category}</Kicker>
        <h3 className={`serif mt-1 line-clamp-4 text-[15px] font-bold leading-[1.55] ${unread ? "ink" : "muted"}`}>{stripHtml(article.title)}</h3>
        <div className="mono muted mt-2 text-[9.5px]" dir="ltr">{shortDate(article.pubDate)}</div>
      </div>
    </motion.button>
  );
}

/** Dispatch row: text and a small photo, separated by rules. */
export function DispatchRow({ article, onOpen, index = 0, unread }) {
  return (
    <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}
      whileTap={{ scale: 0.985 }} onClick={() => onOpen(article)}
      className="line flex w-full gap-3 border-b py-4 text-right" dir="rtl">
      <div className="min-w-0 flex-1">
        <Kicker>{article.category}</Kicker>
        <h3 className={`serif mt-1 line-clamp-3 text-[16.5px] font-bold leading-[1.55] ${unread ? "ink" : "muted"}`}>{stripHtml(article.title)}</h3>
        <div className="mt-2 flex items-center gap-2" dir="ltr">
          <span className="mono muted text-[9.5px]">{shortDate(article.pubDate)}</span>
          <span className="muted text-[10px]">·</span>
          <span className="label muted" style={{ fontSize: 9, letterSpacing: "0.1em" }}>{article.source}</span>
          {unread && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-rust" />}
        </div>
      </div>
      <Photo article={article} caption={false} className="h-[84px] w-[84px] shrink-0 rounded-xl" />
    </motion.button>
  );
}

/** Archive card (Saved screen). */
export function ArchiveCard({ article, onOpen, index = 0 }) {
  return (
    <motion.button initial={{ opacity: 0, y: 12, rotate: index % 2 ? 0.6 : -0.6 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: index * 0.04 }} whileTap={{ scale: 0.96 }} onClick={() => onOpen(article)}
      className="card relative flex min-h-[150px] flex-col rounded-2xl p-3.5 text-right shadow-[0_2px_0_var(--line)]" dir="rtl">
      <div className="flex items-center justify-between">
        <span className="text-[15px]">{CAT_EMOJI[article.category] || "🗞️"}</span>
        <Bookmark size={15} className="rust" fill="currentColor" />
      </div>
      <h3 className="serif ink mt-2 line-clamp-4 flex-1 text-[14.5px] font-bold leading-[1.55]">{stripHtml(article.title)}</h3>
      <div className="rule my-2" />
      <div className="mono muted text-[9.5px]" dir="ltr">{shortDate(article.pubDate)}</div>
    </motion.button>
  );
}

export function Chips({ options, value, onChange, id }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" dir="rtl">
      {options.map(([v, label]) => {
        const active = value === v;
        return (
          <button key={v} onClick={() => onChange(v)}
            className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold ${active ? "border-transparent text-white" : "line rust"}`}>
            {active && <motion.span layoutId={`chip-${id}`} className="bg-rust absolute inset-0 rounded-full" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange, id }) {
  return (
    <div className="card grid gap-1 rounded-xl p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`relative rounded-lg py-2 text-[13px] font-bold ${value === v ? "text-white" : "muted"}`}>
          {value === v && <motion.span layoutId={`seg-${id}`} className="bg-rust absolute inset-0 rounded-lg" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Sheet({ onClose, children, title }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end bg-[#1b140e]/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => info.offset.y > 110 && onClose()}
        className="paper max-h-[88vh] w-full overflow-y-auto rounded-t-[24px] border-t-2 border-[var(--line)] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--line)]" />
        {title && <h2 className="latin-serif ink mb-4 text-center text-[20px] font-bold">{title}</h2>}
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Empty({ icon, title, text }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 py-14 text-center">
      <motion.div animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 4, repeat: Infinity }} className="mb-4 text-5xl">{icon}</motion.div>
      <div className="serif ink text-[18px] font-bold">{title}</div>
      {text && <div className="muted mt-1 text-[13px]">{text}</div>}
    </motion.div>
  );
}

export const timeLabel = (a) => timeAgo(a.pubDate);
