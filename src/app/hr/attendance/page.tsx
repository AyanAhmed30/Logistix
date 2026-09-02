import { AttendanceAndLeaveTracking } from "@/components/hr/AttendanceAndLeaveTracking";
import { requireHrPageAccess } from "@/lib/hr-page-access";

export default async function HrAttendancePage() {
  await requireHrPageAccess("attendance_leave_tracking");
  return <AttendanceAndLeaveTracking />;
}
