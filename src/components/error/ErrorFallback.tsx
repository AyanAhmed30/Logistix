"use client";

import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorFallbackProps = {
  title?: string;
  description?: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  onGoHome?: () => void;
  compact?: boolean;
};

export function ErrorFallback({
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again or return to your dashboard.",
  errorMessage,
  onRetry,
  onGoHome,
  compact = false,
}: ErrorFallbackProps) {
  return (
    <Card
      className={
        compact
          ? "border-amber-200 bg-amber-50/60 shadow-sm"
          : "mx-auto max-w-xl border-amber-200 bg-amber-50/60 shadow-sm"
      }
    >
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-900">{title}</CardTitle>
            <CardDescription className="text-slate-600">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? (
          <p className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-600">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {onRetry ? (
            <Button type="button" onClick={onRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          ) : null}
          {onGoHome ? (
            <Button type="button" variant="outline" onClick={onGoHome} className="gap-2">
              <Home className="h-4 w-4" />
              Go to dashboard
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
