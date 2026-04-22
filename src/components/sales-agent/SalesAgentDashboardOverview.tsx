"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  UserRoundPlus,
  UserCheck,
  Trophy,
  UsersRound,
  ArrowDown,
} from "lucide-react";
import { getSalesAgentDashboardStats, type SalesAgentDashboardStats } from "@/app/actions/dashboard";

/* ------------------------------ helpers ------------------------------ */

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const duration = 500;
    const steps = 20;
    const increment = value / steps;
    const timer = setInterval(() => {
      frame += 1;
      if (frame >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Number((increment * frame).toFixed(1)));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span>
      {Number.isInteger(value) ? Math.round(displayValue) : displayValue}
      {suffix}
    </span>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/* ------------------------------ KPI card ------------------------------ */

type KpiTone = "blue" | "purple" | "green" | "cyan" | "amber";

const toneStyles: Record<KpiTone, { bg: string; ring: string; icon: string }> = {
  blue: {
    bg: "bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8]",
    ring: "ring-[#3b82f6]/30",
    icon: "text-white",
  },
  purple: {
    bg: "bg-gradient-to-br from-[#a855f7] to-[#6d28d9]",
    ring: "ring-[#a855f7]/30",
    icon: "text-white",
  },
  green: {
    bg: "bg-gradient-to-br from-[#10b981] to-[#047857]",
    ring: "ring-[#10b981]/30",
    icon: "text-white",
  },
  cyan: {
    bg: "bg-gradient-to-br from-[#06b6d4] to-[#0e7490]",
    ring: "ring-[#06b6d4]/30",
    icon: "text-white",
  },
  amber: {
    bg: "bg-gradient-to-br from-[#f59e0b] to-[#b45309]",
    ring: "ring-[#f59e0b]/30",
    icon: "text-white",
  },
};

function KpiCard({
  tone,
  icon,
  value,
  label,
  description,
}: {
  tone: KpiTone;
  icon: React.ReactNode;
  value: number;
  label: string;
  description: string;
}) {
  const t = toneStyles[tone];
  return (
    <div className="relative rounded-xl bg-[#0F2C3F] text-white p-4 overflow-hidden group">
      <div
        className={`h-10 w-10 rounded-xl flex items-center justify-center ${t.bg} ring-4 ${t.ring}`}
      >
        <span className={t.icon}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-white [&_span]:text-white">
        {value >= 1000 ? (
          <span className="text-white">{formatCompact(value)}</span>
        ) : (
          <AnimatedNumber value={value} />
        )}
      </div>
      <div className="text-[13px] font-semibold text-white mt-0.5">{label}</div>
      <div className="text-[11px] text-slate-300 mt-0.5">{description}</div>
      <div className="pointer-events-none absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
    </div>
  );
}

/* --------------------------- Bar chart (Quick Insights) --------------------------- */

function InsightsBars({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-3 h-40 pt-3">
      {data.map((d, i) => {
        const height = Math.max((d.value / max) * 100, 4);
        const isEven = i % 2 === 0;
        return (
          <div key={`${d.label}-${i}`} className="flex-1 flex flex-col items-center gap-2">
            <div className="relative flex w-full items-end gap-1.5 h-32">
              <div
                className={`flex-1 rounded-t-md ${
                  isEven ? "bg-[#0F2C3F]" : "bg-[#E2EDF1]"
                } transition-all duration-500`}
                style={{ height: `${height}%` }}
              />
              <div
                className={`flex-1 rounded-t-md ${
                  isEven ? "bg-[#C4D8DE]" : "bg-[#0F2C3F]"
                } transition-all duration-500`}
                style={{ height: `${Math.max(height * 0.7, 4)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 truncate max-w-full">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- Line chart (Customer Fulfilment) --------------------------- */

function FulfilmentLineChart({
  data,
  width = 360,
  height = 150,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pad = 8;
  const range = Math.max(max - min, 1);
  const stepX = (width - pad * 2) / Math.max(data.length - 1, 1);

  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / range);
    return { x, y };
  });

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(" ");

  const areaPath = `${path} L ${(pad + (data.length - 1) * stepX).toFixed(1)} ${height - pad} L ${pad} ${height - pad} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      <defs>
        <linearGradient id="fulfilmentArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#fulfilmentArea)" />
      <path d={path} fill="none" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#ffffff" stroke="#bae6fd" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

/* --------------------------- Gauge (Conversion) --------------------------- */

function ConversionGauge({ percentage }: { percentage: number }) {
  const radius = 70;
  const stroke = 14;
  const circumference = Math.PI * radius;
  const clamped = Math.max(0, Math.min(percentage, 100));
  const dashArray = `${(clamped / 100) * circumference} ${circumference}`;

  return (
    <div className="relative w-[200px] h-[110px]">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <defs>
          <linearGradient id="gaugeFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0F2C3F" />
            <stop offset="100%" stopColor="#2DA79F" />
          </linearGradient>
        </defs>
        <path
          d={`M ${100 - radius} 100 A ${radius} ${radius} 0 0 1 ${100 + radius} 100`}
          stroke="#E2EDF1"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${100 - radius} 100 A ${radius} ${radius} 0 0 1 ${100 + radius} 100`}
          stroke="url(#gaugeFill)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          className="transition-all duration-700"
        />
      </svg>
    </div>
  );
}

/* --------------------------- Area chart (Monthly Trend) --------------------------- */

function MonthlyAreaChart({ data }: { data: Array<{ month: string; count: number }> }) {
  const width = 760;
  const height = 240;
  const padL = 34;
  const padR = 10;
  const padT = 20;
  const padB = 30;

  if (data.length === 0) {
    return <div className="text-sm text-slate-500">No data</div>;
  }

  const max = Math.max(...data.map((d) => d.count), 3);
  const stepX = (width - padL - padR) / Math.max(data.length - 1, 1);
  const points = data.map((d, i) => {
    const x = padL + i * stepX;
    const y = padT + (height - padT - padB) * (1 - d.count / max);
    return { x, y, value: d.count, label: d.month };
  });

  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
  const area = `${path} L ${points[points.length - 1].x} ${height - padB} L ${padL} ${height - padB} Z`;

  // find peak (approx where "New Visitors" tag sits in the image)
  const peakIdx = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const peak = points[peakIdx];

  const gridLines = 4;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => padT + ((height - padT - padB) * i) / gridLines);
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => Math.round(max - (max * i) / gridLines));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
      <defs>
        <linearGradient id="monthlyArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2DA79F" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2DA79F" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridYs.map((y, i) => (
        <g key={i}>
          <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#E5EAF0" strokeDasharray="3 4" />
          <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-slate-400" fontSize="10">
            {gridValues[i]}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#monthlyArea)" />
      <path d={path} fill="none" stroke="#0F7D75" strokeWidth="2" strokeLinecap="round" />

      {/* peak marker */}
      <line x1={peak.x} y1={padT} x2={peak.x} y2={height - padB} stroke="#f59e0b" strokeDasharray="3 3" opacity="0.6" />
      <circle cx={peak.x} cy={peak.y} r={4.5} fill="#ffffff" stroke="#f59e0b" strokeWidth={2.5} />

      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#0F7D75" opacity="0.6" />
      ))}

      {points.map((p, i) => (
        <text
          key={`lbl-${i}`}
          x={p.x}
          y={height - padB + 16}
          textAnchor="middle"
          className="fill-slate-500"
          fontSize="10"
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------ main view ------------------------------ */

export function SalesAgentDashboardOverview() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SalesAgentDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    const result = await getSalesAgentDashboardStats();
    if ("error" in result) {
      setError(result.error ?? "Failed to load dashboard.");
      setStats(null);
    } else {
      setError(null);
      setStats(result.stats);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadStats]);

  const statusMax = useMemo(() => {
    if (!stats || stats.statusBreakdown.length === 0) return 1;
    return Math.max(...stats.statusBreakdown.map((s) => s.count), 1);
  }, [stats]);

  const extendedMonthly = useMemo(() => {
    if (!stats) return [] as Array<{ month: string; count: number }>;
    const base = stats.monthlyLeads;
    const monthsFull = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (base.length >= 12) return base.slice(-12);
    // Pad the front with zero-count synthetic months so the chart reads as a 12-month trend (like the image).
    const have = base.map((m) => m.month);
    const missing = monthsFull.filter((m) => !have.includes(m));
    const padded = [
      ...missing.slice(0, Math.max(0, 12 - base.length)).map((m) => ({ month: m, count: 0 })),
      ...base,
    ];
    return padded.slice(-12);
  }, [stats]);

  const insightsBars = useMemo(() => {
    if (!stats) return [] as Array<{ label: string; value: number }>;
    const src: Array<{ label: string; count: number }> =
      stats.monthlyLeads.length > 0
        ? stats.monthlyLeads.map((m) => ({ label: m.month, count: m.count }))
        : stats.statusBreakdown.map((s) => ({ label: s.status, count: s.count }));
    return src.slice(-6).map((row) => ({ label: row.label, value: row.count }));
  }, [stats]);

  const fulfilment = useMemo(() => {
    if (!stats) return { series: [] as number[], last: 0, current: 0, lastLabel: "", currentLabel: "" };
    const m = stats.monthlyLeads;
    const last = m[m.length - 2];
    const cur = m[m.length - 1];
    return {
      series: m.map((x) => x.count),
      last: last?.count ?? 0,
      current: cur?.count ?? 0,
      lastLabel: last?.month ?? "Last Month",
      currentLabel: cur?.month ?? "This Month",
    };
  }, [stats]);

  /* ------------------------------ loading ------------------------------ */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-56 rounded-xl bg-white shadow-sm border animate-pulse" />
          <div className="h-56 rounded-xl bg-white shadow-sm border animate-pulse" />
          <div className="lg:col-span-2 h-72 rounded-xl bg-white shadow-sm border animate-pulse" />
          <div className="h-72 rounded-xl bg-white shadow-sm border animate-pulse" />
          <div className="h-72 rounded-xl bg-white shadow-sm border animate-pulse" />
          <div className="lg:col-span-2 h-72 rounded-xl bg-white shadow-sm border animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-8 text-center text-rose-600 shadow-sm">
        {error || "Failed to load dashboard."}
      </div>
    );
  }

  /* ------------------------------ render ------------------------------ */

  return (
    <div className="space-y-5">
      {/* Row 1: Dashboard Overview (wide) + Quick Insights */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <header>
            <h2 className="text-lg font-semibold text-[#0F2C3F]">Dashboard Overview</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete sales performance overview for your account
            </p>
          </header>

          <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              tone="blue"
              icon={<Users className="h-4 w-4" />}
              value={stats.totalLeads}
              label="Total Leads"
              description="All assigned leads"
            />
            <KpiCard
              tone="purple"
              icon={<UserCheck className="h-4 w-4" />}
              value={stats.totalCustomers}
              label="Total Customer"
              description="Converted leads"
            />
            <KpiCard
              tone="green"
              icon={<UserRoundPlus className="h-4 w-4" />}
              value={stats.ownLeads}
              label="Own Leads"
              description="Created by you"
            />
            <KpiCard
              tone="cyan"
              icon={<UsersRound className="h-4 w-4" />}
              value={stats.receivedLeads}
              label="Received Leads"
              description="Transferred to you"
            />
            <KpiCard
              tone="amber"
              icon={<Trophy className="h-4 w-4" />}
              value={stats.wonLeads}
              label="Won Leads"
              description="Leads in win stage"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <header>
            <h2 className="text-lg font-semibold text-[#0F2C3F]">Quick Insights</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sales status and recommendations</p>
          </header>
          <div className="mt-3">
            {insightsBars.length === 0 ? (
              <p className="text-sm text-slate-500">No data yet</p>
            ) : (
              <InsightsBars data={insightsBars} />
            )}
          </div>
        </section>
      </div>

      {/* Row 2: Lead Stage Overview + Customer Fulfilment */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <header>
            <h2 className="text-lg font-semibold text-[#0F2C3F]">Lead Stage Overview</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution of your leads across pipeline stages
            </p>
          </header>

          <div className="mt-5 space-y-4">
            {stats.statusBreakdown.slice(0, 4).map((item, idx) => {
              const pct = Math.round((item.count / statusMax) * 100);
              return (
                <div key={item.status} className="flex items-center gap-4">
                  <span className="text-slate-400 font-mono text-sm w-8 shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-slate-700 w-40 shrink-0 truncate">
                    {item.status}
                  </span>
                  <div className="flex-1 h-1.5 bg-[#E2EDF1] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0F2C3F] transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 border border-[#E2EDF1] rounded-md px-2 py-1 min-w-[48px] text-center">
                    {pct}%
                  </span>
                </div>
              );
            })}
            {stats.statusBreakdown.length === 0 && (
              <p className="text-sm text-slate-500">No pipeline activity yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-[#0F2C3F] text-white border border-slate-900/40 shadow-sm p-5">
          <header>
            <h2 className="text-lg font-semibold text-white">Customer Fulfilment</h2>
          </header>
          <div className="mt-3">
            {fulfilment.series.length > 0 ? (
              <FulfilmentLineChart data={fulfilment.series} />
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-400 text-sm">
                No data
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-around text-xs">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#7dd3fc]" />
                <span className="text-slate-300">{fulfilment.lastLabel}</span>
              </div>
              <span className="mt-1 text-sm font-semibold text-white">{fulfilment.last}</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="text-slate-300">{fulfilment.currentLabel}</span>
              </div>
              <span className="mt-1 text-sm font-semibold text-white">{fulfilment.current}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Row 3: Conversion Overview + Monthly Lead Trend */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <header className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#0F2C3F]">Conversion Overview</h2>
              <p className="text-xs text-slate-500 mt-0.5">Lead conversion and follow-up performance</p>
            </div>
            <div className="text-right text-xs space-y-1 text-slate-500">
              <div className="flex items-center gap-2 justify-end">
                <span>Customers Converted</span>
                <span className="text-sm font-semibold text-[#0F2C3F]">{stats.totalCustomers}</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span>Follow Up Leads</span>
                <span className="text-sm font-semibold text-[#0F2C3F]">{stats.followUpLeads}</span>
              </div>
            </div>
          </header>

          <div className="mt-6 flex flex-col items-center">
            <ConversionGauge percentage={stats.conversionRate} />
            <p className="mt-2 text-xs text-slate-500">
              <span className="text-[#0F2C3F] font-semibold">
                {stats.conversionRate.toFixed(1)}%
              </span>{" "}
              Conversion Rate
            </p>
          </div>
        </section>

        <section className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 shadow-sm p-5">
          <header className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#0F2C3F]">Monthly Lead Trend</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Leads created over the last {extendedMonthly.length} months
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2C3F] text-white text-[10px] px-2.5 py-1">
              <ArrowDown className="h-3 w-3" />
              New Visitors
            </span>
          </header>
          <div className="mt-4 -mx-2">
            <MonthlyAreaChart data={extendedMonthly} />
          </div>
        </section>
      </div>
    </div>
  );
}
