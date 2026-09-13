import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccessAdminDashboard } from "@/lib/auth/portal-access";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import { TodoDashboardShell } from "@/components/todo/TodoDashboardShell";
import { requireTodoModuleAccess } from "@/lib/todo-page-access";

export default async function TodoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireTodoModuleAccess();
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const isAdminAccess = canAccessAdminDashboard(session);
  const roleLabel = isSuperAdminSession(session) ? "Admin" : "User";

  return (
    <TodoDashboardShell
      username={session.username}
      roleLabel={roleLabel}
      showAdminBackLink={isAdminAccess}
      access={access}
    >
      {children}
    </TodoDashboardShell>
  );
}
