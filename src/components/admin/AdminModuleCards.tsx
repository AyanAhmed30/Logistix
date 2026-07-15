"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_MODULES, type AdminModule } from "@/lib/admin-navigation";
import { ChevronRight } from "lucide-react";

type Props = {
  onModuleSelect: (module: AdminModule) => void;
};

export function AdminModuleCards({ onModuleSelect }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-primary-dark">Application Modules</h2>
        <p className="text-sm text-secondary-muted mt-1">
          Select a module to open its tools — Odoo-style workspace navigation
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ADMIN_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => onModuleSelect(module.id)}
              className="text-left group"
            >
              <Card
                className={`h-full bg-white border shadow-sm transition-all duration-200 hover:shadow-md ${module.borderClass} group-hover:-translate-y-0.5`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${module.iconBgClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary-accent transition-colors mt-1" />
                  </div>
                  <CardTitle className={`text-lg ${module.accentClass}`}>{module.label}</CardTitle>
                  <CardDescription className="text-secondary-muted leading-relaxed">
                    {module.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
                    Open module
                  </span>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
