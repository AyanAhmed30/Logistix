"use client";

import { useEffect, useState } from "react";
import { getMyAnalyticsProfile } from "@/app/actions/analytics/operations";
import { AnalyticsEmpty, AnalyticsError, AnalyticsLoading } from "@/components/analytics/AnalyticsParts";
import { OperationsEmployeeAnalytics } from "@/components/analytics/OperationsAnalytics";
import { SalesAgentAnalytics } from "@/components/analytics/SalesAgentAnalytics";

type Profile = Exclude<Awaited<ReturnType<typeof getMyAnalyticsProfile>>, { error: string }>;

/** The logged-in employee's own analytics. The server decides whose data this is. */
export function MyAnalytics() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"sales" | "operations">("sales");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getMyAnalyticsProfile()
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) setError(result.error ?? "Unknown error");
        else {
          setProfile(result);
          setView(result.sales ? "sales" : "operations");
        }
      })
      .catch(() => {
        if (!cancelled) setError("The request failed. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  if (error) return <AnalyticsError message={error} onRetry={() => setRetry((n) => n + 1)} />;
  if (!profile) return <AnalyticsLoading />;

  return (
    <div className="space-y-4">
      {profile.sales && profile.operations ? (
        <div role="tablist" aria-label="Department" className="flex gap-1 border-b border-slate-200">
          {(["sales", "operations"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
                view === id
                  ? "border-[#017e84] text-[#016970]"
                  : "border-transparent text-slate-600 hover:text-primary-dark"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}

      {view === "operations" ? (
        <OperationsEmployeeAnalytics username={profile.username} selfView />
      ) : profile.salesAgentId ? (
        <SalesAgentAnalytics agentId={profile.salesAgentId} selfView />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <AnalyticsEmpty
            title="Your login isn't linked to a sales agent record"
            description="Ask your administrator to link your user to a sales agent. Your analytics will appear here after that."
          />
        </div>
      )}
    </div>
  );
}
