import { ReportsGeneration } from "@/components/hr/ReportsGeneration";
import { requireHrPageAccess } from "@/lib/hr-page-access";

export default async function HrReportsPage() {
  await requireHrPageAccess("report_generation");
  return <ReportsGeneration />;
}
