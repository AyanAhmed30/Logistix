"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoadingInstructionPanel() {
  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle>Loading Instructions</CardTitle>
        <CardDescription>Loading instruction functionality will be added here.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-secondary-muted">
          This section is under development.
        </div>
      </CardContent>
    </Card>
  );
}
