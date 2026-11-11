import React, { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronLeft, Bookmark, Share2, ExternalLink, Trash2, Sparkles, Loader2 } from "lucide-react";
import { timeAgo, firstImage, toParagraphs, stripHtml } from "../lib/format";
import { CategoryTag, Favicon } from "./ui";
import { openExternal } from "../lib/api";
import { summarize } from "./engine/ai";

async function shareArticle(a) {
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: stripHtml(a.title), text: stripHtml(a.title), url: a.link });
  } catch (_) {
    if (navigator.share) navigator.share({ title: a.title, url: a.link }).catch(() => {});
  }
}

const Glass = ({ children, onClick, active }) => (
  <motion.button whileTap={{ scale: 0.85 }} onClick={onClick}
    className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md ${active ? "bg-[#b4161b] text-white" : "bg-black/35 text-white"}`}>
    {children}
  </motion.button>
);

export default function ArticleScreen({ article, onBack, onToggleBookmark, onDelete, notify }) {
  const scrollRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const heroY = useTransform(scrollY, [0, 300], [0, 90]);
  const heroScale = useTransform(scrollY, [-150, 0], [1.25, 1]);
  const barOpacity = useTransform(scrollY, [180, 260], [0, 1]);
  const [summary, setSummary] = useState(article.summary || null);
  const [busy, setBusy] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const image = firstImage(article);
  const hasHero = image && imgOk;
  const paragraphs = toParagraphs(article.content || article.description);

  const runSummary = async () => {
    setBusy(true);
    try {
      setSummary(await summarize(article));
    } catch (e) {
      notify(e.message === "no-key" ? "Add an OpenRouter key in Settings to use AI" : "AI summary failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 bg-white dark:bg-[#121214]"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 360, damping: 38 }}
    >
      {/* top bar (fades in when scrolled) */}
      <motion.div style={{ opacity: hasHero ? barOpacity : 1 }}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[calc(env(safe-area-inset-top)+60px)] bg-white/90 dark:bg-[#121214]/90 backdrop-blur border-b border-black/5 dark:border-white/10" />
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
        <Glass onClick={onBack}><ChevronLeft size={22} /></Glass>
        <div className="flex-1" />
        <Glass onClick={onToggleBookmark} active={article.bookmarked}>
          <motion.span key={String(article.bookmarked)} animate={{ scale: [0.6, 1.2, 1] }} className="flex">
            <Bookmark size={18} className={article.bookmarked ? "fill-white" : ""} />
          </motion.span>
        </Glass>
        <Glass onClick={() => shareArticle(article)}><Share2 size={18} /></Glass>
      </div>

      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
        {hasHero ? (
          <div className="relative h-[46vh] min-h-[280px] overflow-hidden bg-zinc-200 dark:bg-zinc-800">
            <motion.img src={image} alt="" onError={() => setImgOk(false)} style={{ y: heroY, scale: heroScale }}
              className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
          </div>
        ) : (
          <div className="h-[calc(env(safe-area-inset-top)+70px)]" />
        )}

        <motion.article
          dir="rtl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={`relative rounded-t-[28px] bg-white dark:bg-[#121214] px-5 pb-32 pt-6 ${hasHero ? "-mt-8" : ""}`}
        >
          <CategoryTag category={article.category} />
          <h1 className="mt-3 text-[25px] font-extrabold leading-[1.45] text-zinc-900 dark:text-white">{stripHtml(article.title)}</h1>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-zinc-500" dir="ltr">
            <Favicon source={article.source} link={article.link} size={18} />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{article.source}</span>
            <span>·</span>
            <span>{timeAgo(article.pubDate)}</span>
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={runSummary} disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-violet-600 to-fuchsia-600 py-3 text-[14px] font-bold text-white shadow-lg shadow-violet-600/20">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {summary ? "تحديث الملخص بالذكاء الاصطناعي" : "تلخيص بالذكاء الاصطناعي"}
          </motion.button>

          {summary && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="mt-4 overflow-hidden rounded-2xl bg-violet-50 dark:bg-violet-950/40 p-4 text-[15px] leading-8 text-zinc-800 dark:text-zinc-100">
              {summary}
            </motion.div>
          )}

          <div className="mt-6 space-y-5 text-[17.5px] leading-[2] text-zinc-800 dark:text-zinc-200" style={{ fontFamily: "'Wafeq', 'Noto Naskh Arabic', serif" }}>
            {paragraphs.map((p, i) => (
              <motion.p key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + Math.min(i, 6) * 0.05 }}>
                {p}
              </motion.p>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3" dir="ltr">
            <button onClick={() => openExternal(article.link)}
              className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 py-3 text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
              <ExternalLink size={16} /> Open site
            </button>
            <button onClick={onDelete}
              className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 dark:bg-red-950/50 py-3 text-[14px] font-semibold text-red-600">
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </motion.article>
      </div>
    </motion.div>
  );
}
