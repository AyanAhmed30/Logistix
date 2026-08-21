import { redirect } from "next/navigation";

/** Legacy HR entry — keep for bookmarks; prefer `/hr`. */
export default function HrLegacyDashboardPage() {
  redirect("/hr");
}
