import React, { useState } from "react";
import { X, Loader2, FileDown, Eye } from "lucide-react";
import { apiUrl, getApiBase, setApiBase, isNative, openExternal } from "../../lib/api";

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "sm:max-w-5xl h-[92vh]" : "sm:max-w-md"} max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-xl bg-white dark:bg-[#2a2a2d] shadow-2xl flex flex-col`}>
        <div className="flex items-center border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h2 className="flex-1 text-[15px] font-semibold text-zinc-900 dark:text-white">{title}</h2>
          <button className="tb-btn" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const field = "w-full rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50";
const primary = "inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const secondary = "inline-flex items-center justify-center gap-2 rounded-md bg-black/[0.06] dark:bg-white/10 px-4 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-black/10";

export function AddFeedDialog({ onClose, notify }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(apiUrl("/add-rss-feed"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      setResult({ ok: !!data.success, text: data.message || data.error, feed: data.feed });
      if (data.success) notify(`Feed added: ${data.domain}`);
    } catch (err) {
      setResult({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a website" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-[13px] text-zinc-500">Delon looks for an RSS feed (/feed, /rss, …) and adds it to your sources.</p>
        <input className={field} type="url" required placeholder="https://example.ma" value={url} onChange={(e) => setUrl(e.target.value)} />
        {result && (
          <div className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>
            {result.text}
            {result.feed && <div className="mt-1 break-all text-xs opacity-80">{result.feed}</div>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>Close</button>
          <button className={primary} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Add feed</button>
        </div>
      </form>
    </Modal>
  );
}

export function NewspaperDialog({ onClose, count }) {
  const [days, setDays] = useState(1);
  const [ai, setAi] = useState(true);
  const [limit, setLimit] = useState(40);

  const url = (download) =>
    apiUrl(`/rehamna/newspaper.pdf?days=${days}&limit=${limit}&ai=${ai ? 1 : 0}${download ? "&download=1" : ""}&t=${Date.now()}`);

  const ranges = [
    [1, "Today"],
    [3, "3 days"],
    [7, "Week"],
    [30, "Month"],
  ];

  return (
    <Modal title="🗞️  Rehamna front page" onClose={onClose}>
      <div className="space-y-5 p-4">
        <p className="text-[13px] leading-relaxed text-zinc-500">
          Builds a newspaper-style PDF (masthead, lead story, columns and photos) from every stored article that
          mentions الرحامنة, ابن جرير, سيدي بوعثمان… Terms are editable in <code>json/rehamna.json</code>.
          {typeof count === "number" && <> Currently <b>{count}</b> matching articles today.</>}
        </p>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Period</div>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-black/[0.05] dark:bg-white/10 p-1">
            {ranges.map(([d, label]) => (
              <button key={d} onClick={() => setDays(d)}
                className={`rounded-md py-1.5 text-[13px] ${days === d ? "bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white font-medium" : "text-zinc-600 dark:text-zinc-300"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-200">
          Max articles
          <input type="number" min={1} max={120} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(120, +e.target.value || 1)))}
            className={`${field} !w-24 text-right`} />
        </label>

        <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-200">
          <span>AI-written editorial <span className="block text-xs text-zinc-400">Uses OPENROUTER_API_KEY when configured</span></span>
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="h-4 w-4 accent-blue-600" />
        </label>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
          <button className={secondary} onClick={() => openExternal(url(false))}><Eye size={15} /> Preview</button>
          <button className={primary} onClick={() => openExternal(url(true))}><FileDown size={15} /> Download PDF</button>
        </div>
        <p className="text-[11px] text-zinc-400">Photos are downloaded from the news sites, so generation can take ~10–30 s.</p>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ onClose, theme, setTheme, onSaved, firstRun }) {
  const [server, setServer] = useState(getApiBase());
  const [status, setStatus] = useState(null);

  const test = async () => {
    setStatus("testing");
    try {
      const res = await fetch(`${server.replace(/\/+$/, "")}/available-categories`);
      setStatus(res.ok ? "ok" : "fail");
    } catch (_) {
      setStatus("fail");
    }
  };

  const save = () => {
    setApiBase(server);
    onSaved && onSaved();
    onClose();
  };

  return (
    <Modal title={firstRun ? "Connect to your Delon server" : "Settings"} onClose={onClose}>
      <div className="space-y-5 p-4">
        <div>
          <div className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">Server address</div>
          <p className="mb-2 text-xs text-zinc-500">
            {isNative()
              ? "The Android app reads news from the Delon backend running on your PC (same Wi-Fi) or online server."
              : "Leave empty to use the server this page is served from."}
          </p>
          <input className={field} placeholder="http://192.168.1.20:5000" value={server} onChange={(e) => setServer(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            <button className={secondary} onClick={test}>Test connection</button>
            {status === "testing" && <Loader2 size={15} className="animate-spin text-zinc-400" />}
            {status === "ok" && <span className="text-sm text-green-600">Connected ✓</span>}
            {status === "fail" && <span className="text-sm text-red-600">Not reachable</span>}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">Appearance</div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/[0.05] dark:bg-white/10 p-1">
            {["system", "light", "dark"].map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`rounded-md py-1.5 text-[13px] capitalize ${theme === t ? "bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white font-medium" : "text-zinc-600 dark:text-zinc-300"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>Cancel</button>
          <button className={primary} onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
