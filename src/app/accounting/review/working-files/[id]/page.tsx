import { Suspense } from "react";
import { AccountingWorkingFileDetailView } from "@/components/accounting/AccountingWorkingFileDetailView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default async function AccountingWorkingFileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={4} cols={4} />
        </div>
      }
    >
      <AccountingWorkingFileDetailView fileId={id} />
    </Suspense>
  );
}
