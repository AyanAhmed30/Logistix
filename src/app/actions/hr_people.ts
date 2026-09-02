"use server";

import { getSession } from "@/lib/auth/session";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import { hasDepartmentAccess } from "@/lib/module-permissions";

export async function canAccessHrModule() {
  const session = await getSession();

  if (!session) {
    return { authorized: false };
  }

  if (isSuperAdminSession(session)) {
    return { authorized: true };
  }

  return {
    authorized: hasDepartmentAccess(session.permissions, "hr"),
  };
}
