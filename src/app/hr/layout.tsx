import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccessAdminDashboard } from "@/lib/auth/portal-access";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import { HRDashboardShell } from "@/components/hr/HRDashboardShell";
import { requireHrModuleAccess } from "@/lib/hr-page-access";

export default async function HrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireHrModuleAccess();
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const isAdminAccess = canAccessAdminDashboard(session);
  const roleLabel = isSuperAdminSession(session) ? "Admin" : "User";

  return (
    <HRDashboardShell
      username={session.username}
      roleLabel={roleLabel}
      showAdminBackLink={isAdminAccess}
      access={access}
    >
      {children}
    </HRDashboardShell>
  );
}
