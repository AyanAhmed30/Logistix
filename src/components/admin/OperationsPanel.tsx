"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export function OperationsPanel() {
  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Operations
        </CardTitle>
        <CardDescription>
          This section will be implemented in the future.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="py-16 text-center text-secondary-muted">
          Operations functionality coming soon...
        </div>
      </CardContent>
    </Card>
  );
}
