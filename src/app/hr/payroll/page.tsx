import { PayrollManagement } from "@/components/hr/PayrollManagement";
import { requireHrPageAccess } from "@/lib/hr-page-access";

export default async function HrPayrollPage() {
  await requireHrPageAccess("payroll_management");
  return <PayrollManagement />;
}
