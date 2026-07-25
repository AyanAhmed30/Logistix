"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmEmptyState } from "@/components/crm/CrmSkeleton";

/** Placeholder — Sales module (Quotations → Orders → Invoicing). */
export function CrmQuotationsPlaceholder() {
  return (
    <CrmEmptyState
      title="My Quotations"
      description="Quotations will open here once the Sales module is available. Create opportunities in My Pipeline until then."
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            asChild
            className="h-8 bg-[#017e84] hover:bg-[#016970] rounded-sm"
          >
            <Link href="/crm/pipeline">Go to My Pipeline</Link>
          </Button>
          <p className="w-full text-xs text-secondary-muted flex items-center justify-center gap-1.5 mt-2">
            <FileText className="h-3.5 w-3.5" />
            Coming soon
          </p>
        </div>
      }
    />
  );
}
