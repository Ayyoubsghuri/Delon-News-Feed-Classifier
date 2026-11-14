import React, { useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { ArrowLeft, Bookmark, Share2, ExternalLink, Trash2, Sparkles, Loader2 } from "lucide-react";
import { toParagraphs, stripHtml } from "../lib/format";
import { Photo, shortDate, dek } from "./ui";
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

export default function ArticleScreen({ article, onBack, onToggleBookmark, onDelete, notify }) {
  const scrollRef = useRef(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  const [summary, setSummary] = useState(article.summary || null);
  const [busy, setBusy] = useState(false);
  const paragraphs = toParagraphs(article.content || article.description);
  const [firstWord, ...restWords] = (paragraphs[0] || "").split(" ");

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
    <motion.div className="gz fixed inset-0 z-40" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 360, damping: 38 }}>
      {/* top bar */}
      <div className="paper line absolute inset-x-0 top-0 z-20 border-b pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-2 px-3" dir="ltr">
          <motion.button whileTap={{ scale: 0.85 }} onClick={onBack} className="ink flex items-center gap-1.5 px-1">
            <ArrowLeft size={18} /> <span className="label">Dispatch</span>
          </motion.button>
          <div className="flex-1" />
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => shareArticle(article)}
            className="bg-rust flex h-9 w-9 items-center justify-center rounded-full text-white"><Share2 size={16} /></motion.button>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onToggleBookmark} className="rust flex h-9 w-9 items-center justify-center">
            <motion.span key={String(article.bookmarked)} animate={{ scale: [0.6, 1.2, 1] }} className="flex">
              <Bookmark size={19} fill={article.bookmarked ? "currentColor" : "none"} />
            </motion.span>
          </motion.button>
        </div>
        <motion.div className="bg-rust h-[2px] origin-left" style={{ scaleX: progress }} />
      </div>

      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain pt-[calc(env(safe-area-inset-top)+58px)]">
        <motion.article dir="rtl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.45 }}
          className="px-6 pb-16 pt-7">
          <div className="label rust text-center" style={{ fontSize: 11, letterSpacing: "0.12em" }}>{article.category || "رسالة خاصة"}</div>
          <h1 className="serif ink selectable mt-3 text-center text-[27px] font-bold leading-[1.5]">{stripHtml(article.title)}</h1>
          <div className="mx-auto mt-4 h-px w-16 bg-[var(--line)]" />
          <div className="label muted mt-3 text-center" dir="ltr" style={{ fontSize: 10 }}>By {article.source}</div>
          <div className="mono muted mt-1 text-center text-[9.5px]" dir="ltr">{shortDate(article.pubDate)} · {article.source}</div>

          <Photo article={article} className="mt-6 aspect-[16/10] w-full rounded-xl" />
          <p className="serif muted mt-3 text-center text-[13.5px] italic leading-7">{dek(article, 180)}</p>

          <div className="double-rule mt-6" />

          <AnimatePresence>
            {summary && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="card mt-5 rounded-xl p-4">
                  <div className="label rust mb-1.5 flex items-center gap-1" dir="ltr"><Sparkles size={12} /> Editor's summary</div>
                  <p className="serif ink selectable text-[15px] leading-8">{summary}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="serif ink selectable mt-6 space-y-5 text-justify text-[18px] leading-[2.05]">
            {paragraphs.length > 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <span className="rust text-[30px] font-bold leading-none">{firstWord} </span>
                {restWords.join(" ")}
              </motion.p>
            )}
            {paragraphs.slice(1).map((p, i) => (
              <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + Math.min(i, 6) * 0.05 }}>{p}</motion.p>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-2" aria-hidden>
            <span className="h-px w-10 bg-[var(--line)]" /><span className="rust text-xs">❦</span><span className="h-px w-10 bg-[var(--line)]" />
          </div>

          <div className="mt-7 space-y-2.5" dir="ltr">
            <motion.button whileTap={{ scale: 0.97 }} onClick={runSummary} disabled={busy}
              className="bg-rust flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} تلخيص بالذكاء الاصطناعي
            </motion.button>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => openExternal(article.link)} className="card ink flex items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-semibold">
                <ExternalLink size={15} /> Open site
              </button>
              <button onClick={onDelete} className="card flex items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-semibold text-[#a3322a]">
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        </motion.article>
      </div>
    </motion.div>
  );
}
