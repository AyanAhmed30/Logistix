import { getSession } from "@/lib/auth/session";
import { redirect, notFound } from "next/navigation";
import { getSalesAgentOverviewDetailForAdmin } from "@/app/actions/admin_sales_agent_overview";
import { SalesAgentOverviewDetailView } from "@/components/admin/SalesAgentOverviewDetailView";

export default async function SalesAgentOverviewPage({
  params,
}: {
  params: Promise<{ salesAgentId: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  const { salesAgentId } = await params;
  const result = await getSalesAgentOverviewDetailForAdmin(salesAgentId);

  if ("error" in result) {
    if (result.error === "Sales agent not found") {
      notFound();
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3 max-w-md">
          {result.error}
        </p>
      </div>
    );
  }

  return <SalesAgentOverviewDetailView overview={result.overview} />;
}
