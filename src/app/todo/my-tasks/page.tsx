import { MyTasksPanel } from "@/components/todo/MyTasksPanel";
import { requireTodoModuleAccess } from "@/lib/todo-page-access";

export default async function TodoMyTasksPage() {
  await requireTodoModuleAccess();
  return <MyTasksPanel />;
}
