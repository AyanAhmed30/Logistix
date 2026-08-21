import { getSession } from "@/lib/auth/session";
import {
  isAccessDenied,
  requireHrAccess,
  requireHrChildModule,
} from "@/lib/auth/require-access";

export async function assertHrAccess() {
  const result = await requireHrAccess();
  if (isAccessDenied(result)) {
    throw new Error("Unauthorized");
  }
  return result;
}

export async function assertHrChildPermission(moduleKey: string) {
  const result = await requireHrChildModule(moduleKey);
  if (isAccessDenied(result)) {
    throw new Error("Unauthorized");
  }
  return result;
}

/** Convenience: ensure session exists and has any HR access (admin or HR perms). */
export async function assertHrSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  await assertHrAccess();
  return session;
}
