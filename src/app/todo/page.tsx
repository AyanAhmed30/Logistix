import { CreateTodoForm } from "@/components/todo/CreateTodoForm";
import { requireTodoModuleAccess } from "@/lib/todo-page-access";

export default async function TodoCreatePage() {
  await requireTodoModuleAccess();
  return <CreateTodoForm />;
}
