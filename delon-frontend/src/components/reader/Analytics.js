import React, { useEffect, useMemo, useState } from "react";
import { motion, animate, useMotionValue, useTransform } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Newspaper, Rss, CalendarDays, Layers } from "lucide-react";
import { fetchJSON } from "../../lib/api";

// Validated categorical palette (light / dark steps of the same hues).
const PALETTE = {
  light: {
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    grid: "#ececea", axis: "#8a8984", text: "#52514e", surface: "#ffffff",
  },
  dark: {
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
    grid: "#2e2e30", axis: "#8a8984", text: "#c3c2b7", surface: "#1c1c1e",
  },
};

// Categories keep a fixed slot so their colour never changes between periods.
const CATEGORY_SLOT = { "شؤون جهوية": 0, "شؤون أمنية": 1, "شؤون سياسية": 2, "مجالس منتخبة": 3, "مختلفات": 4 };

function useDark() {
  const get = () => document.documentElement.classList.contains("dark");
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function CountUp({ value }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const c = animate(mv, Number(value) || 0, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return c.stop;
  }, [value, mv]);
  return <motion.span>{rounded}</motion.span>;
}

const card = "rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#232326] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

function Panel({ title, subtitle, children, className = "" }) {
  return (
    <motion.section variants={item} className={`${card} ${className}`}>
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </motion.section>
  );
}

function Kpi({ icon, label, value, hint, delta }) {
  return (
    <motion.div variants={item} className={card}>
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-white">
        <CountUp value={value} />
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
        {typeof delta === "number" && delta !== 0 && (
          <span className={`inline-flex items-center gap-0.5 font-medium ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-300"}`}>
            {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
        {hint}
      </div>
    </motion.div>
  );
}

function ChartTooltip({ active, payload, label, labelFormat }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur">
      {label !== undefined && <div className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{labelFormat ? labelFormat(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload.fill }} />
          <span dir="auto">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-zinc-900 dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (d) => {
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function Analytics({ loader, compact = false }) {
  const dark = useDark();
  const pal = dark ? PALETTE.dark : PALETTE.light;
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCat, setActiveCat] = useState(null);

  const load = async (d = days) => {
    setLoading(true);
    setError(null);
    try {
      setData(loader ? await loader(d) : await fetchJSON(`/analytics/overview?days=${d}`));
    } catch (e) {
      setError("Could not load analytics from the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const catTotal = useMemo(
    () => (data ? data.categories.reduce((a, c) => a + c.value, 0) : 0),
    [data]
  );
  const peakHour = useMemo(() => {
    if (!data) return null;
    return data.hours.reduce((m, h) => (h.value > m.value ? h : m), { hour: 0, value: 0 });
  }, [data]);
  const maxPlace = data && data.places.length ? data.places[0].value : 1;

  const axis = { stroke: pal.axis, fontSize: 11, tickLine: false, axisLine: false };

  return (
    <div className={`min-h-full p-4 sm:p-6 ${compact ? "" : "bg-[#f5f5f7] dark:bg-[#1c1c1e]"}`}>
      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[18px] font-semibold text-zinc-900 dark:text-white">Overview</div>
          <div className="text-[12px] text-zinc-500">
            {data ? `${data.kpis.feeds} feeds monitored${compact ? "" : ` · uptime ${data.kpis.uptime}`}` : "Loading…"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/[0.05] dark:bg-white/10 p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`relative rounded-md px-3 py-1 text-[12px] ${days === d ? "text-zinc-900 dark:text-white font-medium" : "text-zinc-600 dark:text-zinc-300"}`}
              >
                {days === d && (
                  <motion.span layoutId="range-pill" className="absolute inset-0 rounded-md bg-white dark:bg-zinc-700 shadow"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <span className="relative">{d} days</span>
              </button>
            ))}
          </div>
          <button className="tb-btn" title="Refresh" onClick={() => load()}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {!data && loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`${card} h-28 animate-pulse ${i > 3 ? "col-span-2 h-60" : ""}`} />
          ))}
        </div>
      )}

      {data && (
        <motion.div key={days} initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<Layers size={13} />} label={`Articles · ${days} days`} value={data.kpis.period}
            hint={`${data.kpis.total.toLocaleString()} all time`} />
          <Kpi icon={<CalendarDays size={13} />} label="Today" value={data.kpis.today}
            delta={data.kpis.today - data.kpis.yesterday} hint="vs yesterday" />
          <Kpi icon={<Newspaper size={13} />} label="Rehamna mentions" value={data.kpis.rehamna}
            hint={data.kpis.period ? `${Math.round((100 * data.kpis.rehamna) / data.kpis.period)}% of articles` : ""} />
          <Kpi icon={<Rss size={13} />} label="Active sources" value={data.kpis.sources}
            hint={`of ${data.kpis.feeds} feeds`} />

          <Panel title="Articles per day" subtitle="All stored articles and those mentioning Rehamna" className="col-span-2 lg:col-span-4">
            <div className="mb-2 flex gap-4 text-[11px] text-zinc-600 dark:text-zinc-300">
              <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded" style={{ background: pal.series[0] }} />All articles</span>
              <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded" style={{ background: pal.series[2] }} />Rehamna</span>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={data.timeline} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAll" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={pal.series[0]} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={pal.series[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gReh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={pal.series[2]} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={pal.series[2]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={pal.grid} />
                  <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} {...axis} />
                  <YAxis allowDecimals={false} width={44} {...axis} />
                  <Tooltip content={<ChartTooltip labelFormat={shortDate} />} cursor={{ stroke: pal.axis, strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="articles" name="All articles" stroke={pal.series[0]} strokeWidth={2}
                    fill="url(#gAll)" activeDot={{ r: 4, strokeWidth: 2, stroke: pal.surface }} animationDuration={900} />
                  <Area type="monotone" dataKey="rehamna" name="Rehamna" stroke={pal.series[2]} strokeWidth={2}
                    fill="url(#gReh)" activeDot={{ r: 4, strokeWidth: 2, stroke: pal.surface }} animationDuration={1100} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Categories" subtitle="Share of articles by topic" className="col-span-2">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative h-48 w-48 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.categories} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%"
                      paddingAngle={1.5} stroke={pal.surface} strokeWidth={2} cornerRadius={4}
                      onMouseEnter={(_, i) => setActiveCat(i)} onMouseLeave={() => setActiveCat(null)} animationDuration={900}>
                      {data.categories.map((c, i) => (
                        <Cell key={c.name} fill={pal.series[CATEGORY_SLOT[c.name] ?? (5 + i) % 8]}
                          opacity={activeCat === null || activeCat === i ? 1 : 0.35} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[22px] font-semibold tabular-nums text-zinc-900 dark:text-white"><CountUp value={catTotal} /></div>
                  <div className="text-[11px] text-zinc-500">articles</div>
                </div>
              </div>
              <ul className="w-full space-y-1.5">
                {data.categories.map((c, i) => (
                  <li key={c.name} onMouseEnter={() => setActiveCat(i)} onMouseLeave={() => setActiveCat(null)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-[12px] transition-colors ${activeCat === i ? "bg-black/[0.04] dark:bg-white/[0.06]" : ""}`}>
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: pal.series[CATEGORY_SLOT[c.name] ?? (5 + i) % 8] }} />
                    <span dir="rtl" className="text-zinc-700 dark:text-zinc-200">{c.name}</span>
                    <span className="ml-auto tabular-nums font-medium text-zinc-900 dark:text-white">{c.value}</span>
                    <span className="w-10 text-right tabular-nums text-zinc-500">{catTotal ? Math.round((100 * c.value) / catTotal) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Top sources" subtitle="Articles per website" className="col-span-2">
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={data.sources} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }} barCategoryGap={4}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={118} {...axis} tick={{ fill: pal.text, fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="value" name="Articles" fill={pal.series[0]} radius={[0, 4, 4, 0]} maxBarSize={14}
                    label={{ position: "right", fill: pal.text, fontSize: 11 }} animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Publishing hours"
            subtitle={peakHour && peakHour.value ? `Most news is published around ${String(peakHour.hour).padStart(2, "0")}:00` : "Hour of publication"}
            className="col-span-2">
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={data.hours} margin={{ top: 6, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke={pal.grid} />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} interval={2} {...axis} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip content={<ChartTooltip labelFormat={(h) => `${String(h).padStart(2, "0")}:00 – ${String(h).padStart(2, "0")}:59`} />}
                    cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="value" name="Articles" radius={[4, 4, 0, 0]} animationDuration={900}>
                    {data.hours.map((h) => (
                      <Cell key={h.hour} fill={pal.series[6]} opacity={peakHour && h.hour === peakHour.hour ? 1 : 0.55} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Most mentioned places" subtitle="From the places watch-list" className="col-span-2">
            {data.places.length === 0 && <div className="text-[12px] text-zinc-500">No places matched in this period.</div>}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
              {data.places.map((p, i) => (
                <li key={p.name} className="text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span dir="auto" className="truncate text-zinc-700 dark:text-zinc-200">{p.name}</span>
                    <span className="tabular-nums font-medium text-zinc-900 dark:text-white">{p.value}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ background: pal.series[2] }}
                      initial={{ width: 0 }} animate={{ width: `${(100 * p.value) / maxPlace}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.04, ease: [0.22, 1, 0.36, 1] }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </motion.div>
      )}
    </div>
  );
}
