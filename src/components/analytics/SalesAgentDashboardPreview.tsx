"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  BarChart3,
  Building,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  LayoutDashboard,
  Menu,
  MoreVertical,
  Package,
  Search,
  Settings,
  Truck,
  Users,
  X,
  XCircle,
} from "lucide-react";

/**
 * Design preview with sample data only. Not connected to Supabase.
 * Colours are set on each element because globals.css colours every element,
 * including SVG paths, so icons use stroke-* rather than text-*.
 */

type Status = "Approved" | "Pending" | "Rejected";

type CustomerRow = {
  customer: string;
  contact: string;
  total: number;
  sent: number;
  approved: number;
  pending: number;
  rejected: number;
  lastActivity: string;
  status: Status;
};

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Logistics Operations", icon: Package },
  { label: "Shipments", icon: Truck },
  { label: "Quotes", icon: FileText },
  { label: "Analytics", icon: BarChart3 },
  { label: "CRM", icon: Users },
  { label: "Settings", icon: Settings },
];

const KPIS: Array<{
  label: string;
  value: number;
  accent: string;
  icon?: ComponentType<{ className?: string }>;
  iconColor?: string;
}> = [
  { label: "Total Contacts", value: 98, accent: "border-t-slate-300" },
  { label: "Inquiries Sent", value: 145, accent: "border-t-blue-500" },
  { label: "Approved", value: 62, accent: "border-t-emerald-500", icon: CheckCircle2, iconColor: "stroke-emerald-600" },
  { label: "Pending", value: 43, accent: "border-t-amber-500", icon: Clock, iconColor: "stroke-amber-600" },
  { label: "Rejected", value: 40, accent: "border-t-red-400", icon: XCircle, iconColor: "stroke-red-500" },
  { label: "Total Quotations", value: 88, accent: "border-t-slate-300" },
];

const PIPELINE = [
  { stage: "Prospecting", count: 98, conversion: null, fill: "bg-blue-700", text: "text-white" },
  { stage: "Qualification", count: 145, conversion: "18% Conversion", fill: "bg-blue-600", text: "text-white" },
  { stage: "Proposal", count: 62, conversion: "45% Conversion", fill: "bg-blue-400", text: "text-slate-900" },
  { stage: "Negotiation", count: 43, conversion: "20% Conversion", fill: "bg-blue-300", text: "text-slate-900" },
  { stage: "Closing", count: 0, conversion: null, fill: "bg-blue-100", text: "text-slate-900" },
];

const CUSTOMERS: CustomerRow[] = (
  [
    ["Apex Freight", "Ahmed Ali", 98, 145, 62, 4, 0, "24 Aug 2026", "Approved"],
    ["Maersk Global", "John Ahmed", 96, 62, 10, 6, 0, "24 Aug 2026", "Pending"],
    ["DHL Global", "Sara Khan", 16, 18, 6, 4, 2, "18 May 2026", "Pending"],
    ["TransGlobal Logistics", "Ahmed Ali", 15, 18, 6, 2, 1, "18 May 2026", "Approved"],
    ["Blue Harbor Shipping", "John Ahmed", 14, 12, 4, 0, 3, "19 May 2026", "Rejected"],
    ["Northline Cargo", "Sara Khan", 15, 12, 10, 0, 0, "07 May 2026", "Approved"],
    ["Pacific Route Lines", "Omar Farooq", 13, 11, 5, 3, 1, "02 May 2026", "Pending"],
    ["Silk Road Forwarders", "Hina Malik", 12, 10, 6, 2, 0, "29 Apr 2026", "Approved"],
    ["Karachi Port Movers", "Ahmed Ali", 12, 9, 3, 2, 4, "27 Apr 2026", "Rejected"],
    ["Meridian Freightways", "Bilal Raza", 11, 9, 7, 1, 0, "22 Apr 2026", "Approved"],
    ["Cargo Bridge Asia", "Sara Khan", 10, 8, 2, 4, 1, "19 Apr 2026", "Pending"],
    ["Orbit Supply Chain", "Omar Farooq", 10, 8, 5, 0, 2, "15 Apr 2026", "Approved"],
    ["Delta Container Co", "Hina Malik", 9, 7, 1, 2, 4, "11 Apr 2026", "Rejected"],
    ["Evergreen Haulage", "John Ahmed", 9, 7, 4, 3, 0, "08 Apr 2026", "Pending"],
    ["Summit Air Cargo", "Bilal Raza", 8, 6, 5, 1, 0, "04 Apr 2026", "Approved"],
    ["Coastal Link Freight", "Ahmed Ali", 8, 6, 2, 1, 3, "01 Apr 2026", "Rejected"],
    ["Prime Mover Logistics", "Sara Khan", 7, 6, 3, 3, 0, "28 Mar 2026", "Pending"],
    ["Unity Shipping Lines", "Omar Farooq", 7, 5, 4, 0, 1, "24 Mar 2026", "Approved"],
    ["Horizon Trade Cargo", "Hina Malik", 6, 5, 1, 2, 2, "20 Mar 2026", "Pending"],
    ["Atlas Forwarding", "Bilal Raza", 6, 4, 3, 1, 0, "16 Mar 2026", "Approved"],
    ["Indus Valley Transport", "John Ahmed", 5, 4, 0, 1, 3, "12 Mar 2026", "Rejected"],
    ["Rapid Route Express", "Ahmed Ali", 5, 3, 2, 1, 0, "09 Mar 2026", "Approved"],
    ["Gulf Stream Cargo", "Sara Khan", 4, 3, 1, 2, 0, "05 Mar 2026", "Pending"],
    ["Vertex Global Freight", "Omar Farooq", 3, 2, 1, 0, 1, "01 Mar 2026", "Approved"],
  ] as const
).map(([customer, contact, total, sent, approved, pending, rejected, lastActivity, status]) => ({
  customer,
  contact,
  total,
  sent,
  approved,
  pending,
  rejected,
  lastActivity,
  status,
}));

const CHART = [
  { date: "Sep 1", sent: 14, approved: 6 },
  { date: "Sep 3", sent: 40, approved: 18 },
  { date: "Sep 8", sent: 32, approved: 15 },
  { date: "Sep 10", sent: 73, approved: 34 },
  { date: "Dec 15", sent: 50, approved: 28 },
  { date: "Dec 20", sent: 62, approved: 31 },
  { date: "Dec 27", sent: 57, approved: 36 },
  { date: "Dec 30", sent: 84, approved: 45 },
];

const ACTIVITY = [
  { title: "Customer updated inquiry for freight logistics", who: "Ahmed Ali", when: "3 months ago", dot: "bg-blue-500" },
  { title: "Approved rate quote for Apex Freight", who: "Admin", when: "3 months ago", dot: "bg-emerald-500" },
  { title: "Pending custom clearance approval", who: "Freight payment", when: "3 months ago", dot: "bg-amber-500" },
  { title: "Quotation sent to Maersk Global", who: "Ahmed Ali", when: "3 months ago", dot: "bg-blue-500" },
  { title: "Approved inquiry for Northline Cargo", who: "Admin", when: "4 months ago", dot: "bg-emerald-500" },
];

const STATUS_STYLES: Record<Status, string> = {
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Rejected: "bg-red-50 text-red-700 ring-red-600/20",
};

const DATE_RANGES = ["This Month", "Last 30 Days", "Custom Range"];
const PAGE_SIZE = 6;
const card = "rounded-xl border border-slate-200/80 bg-white shadow-xs";
const cardTitle = "text-xs font-semibold uppercase tracking-wide text-slate-900";

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState("Analytics");
  return (
    <aside
      className={`${open ? "flex" : "hidden"} lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200/80 bg-white`}
    >
      <div className="flex h-16 items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Building className="h-4 w-4 stroke-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">Logistix</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close menu" className="lg:hidden">
          <X className="h-5 w-5 stroke-slate-500" />
        </button>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const isActive = active === item.label;
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => setActive(item.label)}
              className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-sm ${
                isActive
                  ? "border-blue-600 bg-blue-50 font-medium text-blue-600"
                  : "border-transparent text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "stroke-blue-600" : "stroke-slate-500"}`} />
              <span className={isActive ? "text-blue-600" : "text-slate-700"}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function PipelineCard() {
  return (
    <section aria-label="Sales pipeline" className={`${card} p-5`}>
      <p className={cardTitle}>Sales Pipeline</p>
      <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-0">
        {PIPELINE.map((step, index) => (
          <li key={step.stage} className={`min-w-0 flex-1 ${index > 0 ? "sm:-ml-3" : ""}`}>
            <div
              className={`${step.fill} flex h-24 flex-col items-center justify-center px-6 text-center`}
              style={{
                clipPath:
                  index === 0
                    ? "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)"
                    : "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%)",
              }}
            >
              <span className={`truncate text-sm font-semibold ${step.text}`}>{step.stage}</span>
              <span className={`text-xs ${step.text}`}>{step.count} Inquiries</span>
            </div>
            <p className="mt-2 h-4 text-center text-xs text-slate-500">{step.conversion}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CustomerTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"All" | Status>("All");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return CUSTOMERS.filter(
      (row) =>
        (status === "All" || row.status === status) &&
        (!needle ||
          row.customer.toLowerCase().includes(needle) ||
          row.contact.toLowerCase().includes(needle))
    );
  }, [search, status]);

  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const first = rows.length ? (current - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(current * PAGE_SIZE, rows.length);
  const th = "px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap";
  const thNum = "px-3 py-2.5 text-right text-xs font-medium text-slate-500 whitespace-nowrap";
  const num = "px-3 py-3 text-right text-sm tabular-nums text-slate-700";

  return (
    <section aria-label="Customer and contact performance" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <p className={cardTitle}>Customer &amp; Contact Performance</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search contact</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 stroke-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search contact"
              className="h-9 w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm text-slate-700 outline-none focus:border-blue-500"
            />
          </label>
          <label className="relative">
            <span className="sr-only">Status</span>
            <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 stroke-slate-400" />
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "All" | Status);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="All">All statuses</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Rejected">Rejected</option>
            </select>
          </label>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Customer Name</th>
              <th className={th}>Primary Contact</th>
              <th className={thNum}>Total Inquiries</th>
              <th className={thNum}>Sent</th>
              <th className={thNum}>Approved</th>
              <th className={thNum}>Pending</th>
              <th className={thNum}>Rejected</th>
              <th className={th}>Last Activity Date</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.customer} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <p className="text-sm font-medium text-slate-900">{row.customer}</p>
                  <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">{row.contact}</td>
                <td className={num}>{row.total}</td>
                <td className={num}>{row.sent}</td>
                <td className={num}>{row.approved}</td>
                <td className={num}>{row.pending}</td>
                <td className={num}>{row.rejected}</td>
                <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">{row.lastActivity}</td>
                <td className="px-3 py-3 text-right">
                  <button type="button" aria-label={`Actions for ${row.customer}`} className="rounded-md p-1 hover:bg-slate-100">
                    <MoreVertical className="h-4 w-4 stroke-slate-500" />
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                  No customers match these filters
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <p className="text-xs tabular-nums text-slate-500">
          Showing {first}-{last} of {rows.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="rounded-md border border-slate-200 p-1 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4 stroke-slate-600" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={current >= lastPage}
            onClick={() => setPage(current + 1)}
            className="rounded-md border border-slate-200 p-1 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4 stroke-slate-600" />
          </button>
        </div>
      </div>
    </section>
  );
}

const W = 360;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 28 };
const xAt = (index: number) => PAD.left + (index * (W - PAD.left - PAD.right)) / (CHART.length - 1);
const yAt = (value: number) => H - PAD.bottom - (value / 100) * (H - PAD.top - PAD.bottom);

/** Catmull-Rom spline converted to cubic Bezier segments. */
function smoothPath(points: Array<[number, number]>) {
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    path += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }
  return path;
}

const LINES = [
  { key: "sent" as const, label: "Sent", color: "#2563eb" },
  { key: "approved" as const, label: "Approved", color: "#059669" },
];

function InquiryChart() {
  const [hover, setHover] = useState<number | null>(null);
  const point = hover === null ? null : CHART[hover];
  return (
    <section aria-label="Inquiry performance" className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-2">
        <p className={cardTitle}>Inquiry Performance</p>
        <div className="flex gap-3">
          {LINES.map((line) => (
            <span key={line.key} className="flex items-center gap-1 text-xs text-slate-500">
              <span className="h-0.5 w-3 rounded-full" style={{ background: line.color }} aria-hidden />
              {line.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Inquiries sent and approved over time">
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yAt(tick)} y2={yAt(tick)} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PAD.left - 6} y={yAt(tick) + 3} textAnchor="end" fontSize="9" fill="#64748b">
                {tick}
              </text>
            </g>
          ))}
          {CHART.map((row, index) => (
            <text key={row.date} x={xAt(index)} y={H - 8} textAnchor="middle" fontSize="8" fill="#64748b">
              {row.date}
            </text>
          ))}
          {hover !== null ? (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#cbd5e1" strokeWidth="1" />
          ) : null}
          {LINES.map((line) => (
            <g key={line.key}>
              <path
                d={smoothPath(CHART.map((row, index) => [xAt(index), yAt(row[line.key])]))}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {CHART.map((row, index) => (
                <circle
                  key={row.date}
                  cx={xAt(index)}
                  cy={yAt(row[line.key])}
                  r={hover === index ? 4 : 2.5}
                  fill={line.color}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
              ))}
            </g>
          ))}
          {CHART.map((row, index) => (
            <rect
              key={row.date}
              x={xAt(index) - (W - PAD.left - PAD.right) / (CHART.length - 1) / 2}
              y={PAD.top}
              width={(W - PAD.left - PAD.right) / (CHART.length - 1)}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              tabIndex={0}
              aria-label={`${row.date}: ${row.sent} sent, ${row.approved} approved`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
        {point && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-xs"
            style={{ left: `${Math.min(84, Math.max(16, (xAt(hover) / W) * 100))}%` }}
          >
            <p className="text-xs font-medium text-slate-900">{point.date}</p>
            <p className="text-xs tabular-nums text-slate-500 whitespace-nowrap">
              {point.sent} sent, {point.approved} approved
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ActivityCard() {
  return (
    <section aria-label="Recent inquiry activity" className={`${card} p-5`}>
      <p className={cardTitle}>Recent Inquiry Activity</p>
      <ol className="mt-4">
        {ACTIVITY.map((item, index) => (
          <li key={item.title} className="relative flex gap-3 pb-4 last:pb-0">
            {index < ACTIVITY.length - 1 ? (
              <span aria-hidden className="absolute left-[4px] top-4 bottom-0 w-px bg-slate-200" />
            ) : null}
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
            <div className="min-w-0">
              <p className="text-sm text-slate-700">{item.title}</p>
              <p className="text-xs text-slate-500">
                {item.who}, {item.when}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SalesAgentDashboardPreview() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState(DATE_RANGES[0]);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white px-4 lg:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="lg:hidden">
            <Menu className="h-5 w-5 stroke-slate-600" />
          </button>
          <label className="relative max-w-sm flex-1">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 stroke-slate-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-12 text-sm text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
            />
            <kbd className="absolute right-2 top-2 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-500">
              ⌘K
            </kbd>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                aria-expanded={rangeOpen}
                onClick={() => setRangeOpen((open) => !open)}
                className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Calendar className="h-4 w-4 stroke-slate-500" />
                <span className="hidden text-slate-700 sm:inline">{range}</span>
                <ChevronDown className="h-4 w-4 stroke-slate-500" />
              </button>
              {rangeOpen ? (
                <ul className="absolute right-0 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-xs">
                  {DATE_RANGES.map((option) => (
                    <li key={option}>
                      <button
                        type="button"
                        onClick={() => {
                          setRange(option);
                          setRangeOpen(false);
                        }}
                        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                          option === range ? "text-blue-600" : "text-slate-700"
                        }`}
                      >
                        {option}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                AA
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-sm font-medium leading-tight text-slate-900">Ahmed Ali</span>
                <span className="block text-xs leading-tight text-slate-500">Sales Agent</span>
              </span>
            </button>
          </div>
        </header>

        <main className="space-y-4 p-4 lg:p-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">Analytics</span>
            <ChevronRight className="h-3.5 w-3.5 stroke-slate-400" />
            <span className="text-slate-500">Sales</span>
            <ChevronRight className="h-3.5 w-3.5 stroke-slate-400" />
            <span className="font-medium text-slate-900">Ahmed Ali</span>
          </nav>

          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {KPIS.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className={`${card} border-t-2 ${kpi.accent} p-4`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
                    {Icon ? <Icon className={`h-4 w-4 shrink-0 ${kpi.iconColor}`} /> : null}
                  </div>
                  <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-slate-900">{kpi.value}</p>
                </div>
              );
            })}
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="min-w-0 space-y-4 xl:col-span-8">
              <PipelineCard />
              <CustomerTable />
            </div>
            <div className="min-w-0 space-y-4 xl:col-span-4">
              <InquiryChart />
              <ActivityCard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
