"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export function ImportInvoicePanel() {
  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Import Invoice
        </CardTitle>
        <CardDescription>
          This section will be implemented in the future.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="py-16 text-center text-secondary-muted">
          Import Invoice functionality coming soon...
        </div>
      </CardContent>
    </Card>
  );
}
