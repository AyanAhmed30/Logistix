import { EmployeeProfileManagement } from "@/components/hr/EmployeeProfileManagement";
import { requireHrPageAccess } from "@/lib/hr-page-access";

export default async function HrEmployeesPage() {
  await requireHrPageAccess("employee_profile_management");
  return <EmployeeProfileManagement />;
}
