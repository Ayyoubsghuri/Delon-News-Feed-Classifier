import React, { useEffect, useState } from "react";
import {
  ExternalLink, Bookmark, Trash2, Share2, ChevronLeft, CircleDot, Sparkles, Loader2,
} from "lucide-react";
import { timeAgo, firstImage, toParagraphs, stripHtml } from "../../lib/format";
import { fetchJSON, openExternal } from "../../lib/api";

function Tool({ title, onClick, children, active, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`tb-btn ${active ? "!text-orange-500" : ""}`}
    >
      {children}
    </button>
  );
}

export default function ArticleView({
  article, bookmarked, onToggleBookmark, onDelete, onMarkUnread, onBack, notify,
}) {
  const [shares, setShares] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  const articleId = article && article.id;
  useEffect(() => {
    setShares(null);
    setSummary(null);
    setConfirm(false);
    setImgOk(true);
  }, [articleId]);

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white dark:bg-[#1c1c1e] text-zinc-400">
        <div className="text-5xl mb-3 opacity-40">📰</div>
        <div className="text-sm">No article selected</div>
      </div>
    );
  }

  const image = firstImage(article);
  const paragraphs = toParagraphs(article.content || article.description);
  const body = paragraphs.length ? paragraphs : toParagraphs(article.description);

  const loadShares = async () => {
    try {
      const data = await fetchJSON(`/get-share-counts?url=${encodeURIComponent(article.link)}`);
      setShares(data);
    } catch (_) {
      notify("Share counts unavailable");
    }
  };

  const summarize = async () => {
    setSummarizing(true);
    try {
      const data = await fetchJSON(`/get-article-summary?article_id=${encodeURIComponent(article.id)}`);
      setSummary(data.summary || data.message || "No summary available.");
    } catch (_) {
      notify("AI summary unavailable (check OPENROUTER_API_KEY)");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <section className="flex h-full flex-col bg-white dark:bg-[#1c1c1e]">
      <header className="flex h-12 shrink-0 items-center gap-1 px-3 text-zinc-500 pt-safe box-content">
        {onBack && <Tool title="Back" onClick={onBack}><ChevronLeft size={20} /></Tool>}
        <Tool title="Mark as unread" onClick={onMarkUnread}><CircleDot size={16} /></Tool>
        <Tool title="AI summary" onClick={summarize} disabled={summarizing}>
          {summarizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        </Tool>
        <div className="ml-auto flex items-center gap-1">
          <Tool title={bookmarked ? "Remove bookmark" : "Bookmark"} onClick={onToggleBookmark} active={bookmarked}>
            <Bookmark size={16} className={bookmarked ? "fill-orange-500" : ""} />
          </Tool>
          <Tool title="Share counts" onClick={loadShares}><Share2 size={16} /></Tool>
          <Tool title="Delete" onClick={() => setConfirm(true)}><Trash2 size={16} /></Tool>
          <Tool title="Open in browser" onClick={() => openExternal(article.link)}><ExternalLink size={16} /></Tool>
        </div>
      </header>

      {confirm && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 px-3 py-2 text-sm">
          <span className="flex-1 text-red-700 dark:text-red-300">Delete this article? It won't come back on the next refresh.</span>
          <button className="rounded px-2 py-1 text-zinc-600 dark:text-zinc-300 hover:bg-black/5" onClick={() => setConfirm(false)}>Cancel</button>
          <button className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700" onClick={() => { setConfirm(false); onDelete(); }}>Delete</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <article dir="auto" className="mx-auto max-w-[700px] px-6 pb-24 pt-6 sm:px-8">
          <h1 dir="auto" className="text-[28px] sm:text-[30px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">
            {stripHtml(article.title)}
          </h1>
          <div dir="auto" className="mt-3 text-[14px] text-zinc-500">{article.source}</div>
          <div className="mt-1 flex items-center gap-2 text-[13px] text-zinc-400" dir="ltr">
            <span>{article.author || article.source}</span>
            <span>•</span>
            <span>{timeAgo(article.pubDate || article.time || article.timestamp)}</span>
            {article.category && (
              <span dir="rtl" className="ml-auto rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-[1px] text-[11px] text-zinc-500">{article.category}</span>
            )}
          </div>

          {shares && (
            <div className="mt-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300" dir="ltr">
              Facebook: <b>{shares.Facebook || 0}</b> shares
              {shares.FacebookDetails && (
                <> · {shares.FacebookDetails.comments || 0} comments · {shares.FacebookDetails.reactions || 0} reactions</>
              )}
            </div>
          )}

          {image && imgOk && (
            <figure className="my-8">
              <img
                src={image}
                alt=""
                onError={() => setImgOk(false)}
                className="mx-auto max-h-[420px] w-full rounded-md object-cover shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)]"
              />
            </figure>
          )}

          {summary && (
            <div dir="auto" className="my-6 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 p-4 text-[15px] leading-8 text-zinc-800 dark:text-zinc-100">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-300" dir="ltr">
                <Sparkles size={13} /> AI summary
              </div>
              {summary}
            </div>
          )}

          <div className="reader-body mt-6 space-y-5 text-[17px] leading-[1.95] text-zinc-800 dark:text-zinc-200">
            {body.map((p, i) => (
              <p key={i} dir="auto">{p}</p>
            ))}
          </div>

          <button
            onClick={() => openExternal(article.link)}
            className="mt-10 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            dir="ltr"
          >
            Read on {article.source || "source"} <ExternalLink size={13} />
          </button>
        </article>
      </div>
    </section>
  );
}
