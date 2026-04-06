"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Users,
  UserRoundPlus,
  UserCheck,
  Trophy,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSalesAgentDashboardStats, type SalesAgentDashboardStats } from "@/app/actions/dashboard";

function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
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

function CircularProgress({
  percentage,
  size = 100,
  strokeWidth = 6,
  color = "text-blue-600",
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
        style={{ position: "absolute" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${color} transition-all duration-500`}
        />
      </svg>
      <div className="text-center">
        <div className={`text-2xl font-bold ${color}`}>{percentage.toFixed(0)}%</div>
      </div>
    </div>
  );
}

export function SalesAgentDashboardOverview() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SalesAgentDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStats();
  }, []);

  async function loadStats() {
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
  }

  const maxStatus = useMemo(() => {
    if (!stats || stats.statusBreakdown.length === 0) return 1;
    return Math.max(...stats.statusBreakdown.map((item) => item.count), 1);
  }, [stats]);

  const maxMonthly = useMemo(() => {
    if (!stats || stats.monthlyLeads.length === 0) return 1;
    return Math.max(...stats.monthlyLeads.map((item) => item.count), 1);
  }, [stats]);

  const monthlyTotal = useMemo(() => {
    if (!stats) return 0;
    return stats.monthlyLeads.reduce((sum, item) => sum + item.count, 0);
  }, [stats]);

  const monthlyAverage = useMemo(() => {
    if (!stats || stats.monthlyLeads.length === 0) return 0;
    return Math.round(monthlyTotal / stats.monthlyLeads.length);
  }, [stats, monthlyTotal]);

  const peakMonth = useMemo(() => {
    if (!stats || stats.monthlyLeads.length === 0) {
      return { month: "-", count: 0 };
    }
    return stats.monthlyLeads.reduce((best, current) =>
      current.count > best.count ? current : best
    );
  }, [stats]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 bg-slate-200 rounded w-64 animate-pulse"></div>
          <div className="h-4 bg-slate-200 rounded w-96 mt-2 animate-pulse"></div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="bg-white border shadow-sm animate-pulse">
              <CardHeader>
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2 mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-slate-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardContent className="py-20 text-center text-red-600">
          {error || "Failed to load dashboard."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary-dark">Dashboard Overview</h1>
        <p className="text-secondary-muted mt-1">
          Complete sales performance overview for your account
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">
              <AnimatedNumber value={stats.totalLeads} />
            </div>
            <p className="text-xs text-secondary-muted mt-1">All assigned leads</p>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <UserCheck className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">
              <AnimatedNumber value={stats.totalCustomers} />
            </div>
            <p className="text-xs text-secondary-muted mt-1">Converted leads</p>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Own Leads</CardTitle>
            <UserRoundPlus className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">
              <AnimatedNumber value={stats.ownLeads} />
            </div>
            <p className="text-xs text-secondary-muted mt-1">Created by you</p>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received Leads</CardTitle>
            <TrendingUp className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">
              <AnimatedNumber value={stats.receivedLeads} />
            </div>
            <p className="text-xs text-secondary-muted mt-1">Transferred to you</p>
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won Leads</CardTitle>
            <Trophy className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">
              <AnimatedNumber value={stats.wonLeads} />
            </div>
            <p className="text-xs text-secondary-muted mt-1">Leads in win stage</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Lead Stage Overview
            </CardTitle>
            <CardDescription>Distribution of your leads across pipeline stages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.statusBreakdown.map((item) => (
              <div key={item.status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{item.status}</span>
                  <span className="text-lg font-semibold">{item.count}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-500"
                    style={{ width: `${(item.count / maxStatus) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Conversion Overview
            </CardTitle>
            <CardDescription>Lead conversion and follow-up performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Customers Converted</span>
                </div>
                <span className="text-lg font-semibold">{stats.totalCustomers}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Follow Up Leads</span>
                </div>
                <span className="text-lg font-semibold">{stats.followUpLeads}</span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-center">
                <CircularProgress
                  percentage={stats.conversionRate}
                  size={100}
                  strokeWidth={6}
                  color="text-green-600"
                />
              </div>
              <p className="text-center text-sm text-secondary-muted mt-2">
                {stats.conversionRate.toFixed(1)}% Conversion Rate
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Monthly Lead Trend
          </CardTitle>
          <CardDescription>Leads created over the last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div
                className="relative rounded-xl border bg-gradient-to-b from-slate-50 to-white p-4"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to right, rgba(148,163,184,0.10) 1px, transparent 1px)",
                  backgroundSize: "100% 25%, 16.66% 100%",
                }}
              >
                <div className="grid gap-3 grid-cols-6 items-end h-56">
                  {stats.monthlyLeads.map((item, idx) => (
                    <div key={item.month} className="flex flex-col items-center gap-2">
                      <div className="text-[10px] font-semibold text-primary-dark bg-white/90 border rounded px-1.5 py-0.5">
                        {item.count}
                      </div>
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 via-blue-500 to-cyan-400 shadow-sm transition-all duration-700"
                        style={{
                          height: `${Math.max((item.count / maxMonthly) * 100, 10)}%`,
                          animationDelay: `${idx * 70}ms`,
                        }}
                      />
                      <div className="h-2 w-2 rounded-full bg-indigo-500" />
                      <div className="text-[11px] text-secondary-muted">{item.month}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg border bg-slate-50">
                <div className="text-xs text-secondary-muted">6-Month Total</div>
                <div className="text-2xl font-bold text-primary-dark">
                  <AnimatedNumber value={monthlyTotal} />
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-slate-50">
                <div className="text-xs text-secondary-muted">Monthly Average</div>
                <div className="text-2xl font-bold text-blue-700">
                  <AnimatedNumber value={monthlyAverage} />
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-slate-50">
                <div className="text-xs text-secondary-muted">Peak Month</div>
                <div className="text-lg font-bold text-emerald-700">
                  {peakMonth.month} ({peakMonth.count})
                </div>
                <div className="mt-3 flex items-center justify-center">
                  <CircularProgress
                    percentage={maxMonthly > 0 ? (peakMonth.count / maxMonthly) * 100 : 0}
                    size={88}
                    strokeWidth={6}
                    color="text-emerald-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Quick Insights
          </CardTitle>
          <CardDescription>Sales status and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {stats.receivedLeads > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Newly Received Leads</p>
                  <p className="text-xs text-blue-700 mt-1">
                    You have {stats.receivedLeads} transferred lead{stats.receivedLeads !== 1 ? "s" : ""}.
                  </p>
                </div>
              </div>
            )}

            {stats.followUpLeads > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">Follow Up Required</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    {stats.followUpLeads} lead{stats.followUpLeads !== 1 ? "s" : ""} currently in follow-up stage.
                  </p>
                </div>
              </div>
            )}

            {stats.wonLeads > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-900">Winning Momentum</p>
                  <p className="text-xs text-green-700 mt-1">
                    Great work — {stats.wonLeads} lead{stats.wonLeads !== 1 ? "s" : ""} reached the Win stage.
                  </p>
                </div>
              </div>
            )}

            {stats.totalLeads === 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-orange-50 border border-orange-200">
                <XCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-900">No Leads Yet</p>
                  <p className="text-xs text-orange-700 mt-1">
                    Start by adding leads from the Lead tab to build your pipeline.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
