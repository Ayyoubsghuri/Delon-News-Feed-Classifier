import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowLeft, Bookmark, Share, Sparkles, MoreHorizontal, Loader2, Link2, ExternalLink, EyeOff, Sun } from "lucide-react";
import { firstImage, toParagraphs, stripHtml } from "../lib/format";
import { Sheet, SheetAction } from "./ui";
import { openExternal } from "../lib/api";
import { summarize } from "./engine/ai";

export async function shareArticle(a) {
  try {
    const { Share: S } = await import("@capacitor/share");
    await S.share({ title: stripHtml(a.title), text: stripHtml(a.title), url: a.link });
  } catch (_) {
    if (navigator.share) navigator.share({ title: a.title, url: a.link }).catch(() => {});
  }
}

export async function copyLink(a, notify) {
  try {
    await navigator.clipboard.writeText(a.link);
    notify("Link copied");
  } catch (_) {
    notify(a.link);
  }
}

const THEMES = {
  light: { bg: "#ffffff", fg: "#18181b", sub: "#71717a", dot: "#ffffff" },
  sepia: { bg: "#f6efe2", fg: "#3b2f20", sub: "#8a7a63", dot: "#e8dcc4" },
  gray: { bg: "#e9e9eb", fg: "#1f1f22", sub: "#6b6b70", dot: "#c9c9cd" },
  dark: { bg: "#141416", fg: "#ececee", sub: "#8e8e93", dot: "#2a2a2d" },
};

function useReader() {
  const load = () => {
    try {
      return { size: 18, font: "serif", theme: "light", ...JSON.parse(localStorage.getItem("delon.reader") || "{}") };
    } catch (_) {
      return { size: 18, font: "serif", theme: "light" };
    }
  };
  const [r, setR] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem("delon.reader", JSON.stringify(r));
    } catch (_) {}
  }, [r]);
  return [r, setR];
}

const fmtDate = (v) => {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("ar-MA", { day: "numeric", month: "long", year: "numeric" });
};

export default function ArticleScreen({ article, onBack, onToggleBookmark, onDelete, notify }) {
  const scrollRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const heroScale = useTransform(scrollY, [-200, 0], [1.3, 1]);
  const heroY = useTransform(scrollY, [0, 300], [0, 80]);
  const [reader, setReader] = useReader();
  const [sheet, setSheet] = useState(null);
  const [summary, setSummary] = useState(article.summary || null);
  const [busy, setBusy] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const [savedToast, setSavedToast] = useState(false);
  const t = THEMES[reader.theme];
  const image = firstImage(article);
  const hasHero = image && imgOk;
  const paragraphs = toParagraphs(article.content || article.description);
  const tags = (article.matched_places || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);

  const runSummary = async () => {
    setBusy(true);
    try {
      setSummary(await summarize(article));
    } catch (e) {
      notify(e.message === "no-key" ? "Add an OpenRouter key in Menu → AI" : "AI summary failed");
    } finally {
      setBusy(false);
    }
  };

  const bookmark = () => {
    onToggleBookmark();
    if (!article.bookmarked) {
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2200);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-40"
      style={{ background: t.bg }}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 40 }}
    >
      <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+8px)] z-20">
        <motion.button whileTap={{ scale: 0.85 }} onClick={onBack}
          className={`flex h-10 w-10 items-center justify-center rounded-full ${hasHero ? "bg-black/30 text-white backdrop-blur" : ""}`}
          style={hasHero ? {} : { color: t.fg }}>
          <ArrowLeft size={21} />
        </motion.button>
      </div>

      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain pb-28">
        {hasHero ? (
          <div className="relative h-[42vh] min-h-[260px] overflow-hidden bg-zinc-200">
            <motion.img src={image} alt="" onError={() => setImgOk(false)} style={{ scale: heroScale, y: heroY }}
              className="absolute inset-0 h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-[calc(env(safe-area-inset-top)+64px)]" />
        )}

        <motion.article
          dir="rtl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={`relative rounded-t-[22px] px-5 pt-5 ${hasHero ? "-mt-6" : ""}`}
          style={{ background: t.bg }}
        >
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: t.sub }}>
            <span className="ar">{fmtDate(article.pubDate)}</span>
            <span>·</span>
            <span dir="ltr">{article.source}</span>
          </div>
          <h1 className="ar selectable mt-2 text-[25px] font-extrabold leading-[1.5]" style={{ color: t.fg }}>{stripHtml(article.title)}</h1>
          {article.category && (
            <div className="ar mt-2 inline-block rounded-md bg-[#f26b1d]/10 px-2 py-0.5 text-[12px] font-bold text-[#f26b1d]">{article.category}</div>
          )}

          <AnimatePresence>
            {summary && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="ar selectable mt-5 rounded-2xl border border-[#f26b1d]/25 bg-[#f26b1d]/[0.06] p-4 text-[15px] leading-8" style={{ color: t.fg }}>
                  <div className="mb-1 flex items-center gap-1 text-[12px] font-bold text-[#f26b1d]"><Sparkles size={13} /> ملخص بالذكاء الاصطناعي</div>
                  {summary}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`selectable mt-5 space-y-5 ${reader.font === "serif" ? "serif" : "sans"}`}
            style={{ color: t.fg, fontSize: reader.size, lineHeight: reader.font === "serif" ? 2 : 1.95 }}>
            {paragraphs.map((p, i) => (
              <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 + Math.min(i, 6) * 0.05 }}>
                {p}
              </motion.p>
            ))}
          </div>

          {tags.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-2">
              {tags.map((tg) => (
                <span key={tg} className="ar rounded-full border px-3 py-1 text-[12.5px]" style={{ borderColor: `${t.sub}55`, color: t.fg }}>#{tg.replace(/\s+/g, "_")}</span>
              ))}
            </div>
          )}

          <button onClick={() => openExternal(article.link)} className="mt-7 flex items-center gap-1.5 text-[13.5px] font-semibold text-[#f26b1d]" dir="ltr">
            <ExternalLink size={14} /> Read on {article.source}
          </button>
        </motion.article>
      </div>

      {/* Saved toast */}
      <AnimatePresence>
        {savedToast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-30 flex items-center gap-3 rounded-2xl bg-white dark:bg-[#2a2a2d] p-3.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.3)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f26b1d] text-white"><Bookmark size={17} className="fill-white" /></span>
            <div>
              <div className="text-[14.5px] font-bold text-zinc-900 dark:text-white">Saved</div>
              <div className="text-[12px] text-zinc-500">You can find this story in Bookmarks.</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* black action bar */}
      <div className="absolute inset-x-0 bottom-0 z-30 bg-[#111] pb-[env(safe-area-inset-bottom)]">
        <div className="grid h-[60px] grid-cols-5 items-center text-white">
          {[
            [busy ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />, runSummary, false],
            [<span className="text-[15px] font-bold">A<span className="text-[12px]">A</span></span>, () => setSheet("reader"), false],
            [<Bookmark size={20} className={article.bookmarked ? "fill-[#f26b1d]" : ""} />, bookmark, article.bookmarked],
            [<Share size={20} />, () => shareArticle(article), false],
            [<MoreHorizontal size={22} />, () => setSheet("more"), false],
          ].map(([icon, fn, active], i) => (
            <motion.button key={i} whileTap={{ scale: 0.8 }} onClick={fn}
              className={`flex h-full items-center justify-center ${active ? "text-[#f26b1d]" : "text-white/90"}`}>
              {icon}
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {sheet === "reader" && (
          <Sheet onClose={() => setSheet(null)}>
            <div className="mb-5 flex items-center justify-between gap-3">
              {Object.entries(THEMES).map(([k, v]) => (
                <button key={k} onClick={() => setReader({ ...reader, theme: k })}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-2"
                  style={{ background: v.dot, borderColor: reader.theme === k ? "#f26b1d" : "rgba(0,0,0,0.12)" }}>
                  {reader.theme === k && <span className="h-2 w-2 rounded-full bg-[#f26b1d]" />}
                </button>
              ))}
              <Sun size={20} className="text-zinc-400" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-zinc-500">A</span>
              <input type="range" min={14} max={26} value={reader.size}
                onChange={(e) => setReader({ ...reader, size: +e.target.value })} className="flex-1 accent-[#f26b1d]" />
              <span className="text-[20px] text-zinc-700 dark:text-zinc-200">A</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[["sans", "كوفي · Sans"], ["serif", "نسخ · Serif"]].map(([k, label]) => (
                <button key={k} onClick={() => setReader({ ...reader, font: k })}
                  className={`${k} rounded-xl border py-2.5 text-[14px] ${reader.font === k ? "border-[#f26b1d] text-[#f26b1d]" : "border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300"}`}>
                  {label}
                </button>
              ))}
            </div>
          </Sheet>
        )}
        {sheet === "more" && (
          <Sheet onClose={() => setSheet(null)}>
            <SheetAction icon={<Share size={19} />} label="Share to …" onClick={() => { setSheet(null); shareArticle(article); }} />
            <SheetAction icon={<Link2 size={19} />} label="Copy link" onClick={() => { setSheet(null); copyLink(article, notify); }} />
            <SheetAction icon={<ExternalLink size={19} />} label="Open in browser" onClick={() => { setSheet(null); openExternal(article.link); }} />
            <SheetAction icon={<EyeOff size={19} />} label="Not interesting (delete)" danger onClick={() => { setSheet(null); onDelete(); }} />
          </Sheet>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
