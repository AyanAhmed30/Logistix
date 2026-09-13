import type { LucideIcon } from "lucide-react";
import { ListPlus, ListChecks } from "lucide-react";

export type TodoNavId = "create" | "my-tasks";

export type TodoNavItem = {
  id: TodoNavId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const TODO_NAV_ITEMS: TodoNavItem[] = [
  {
    id: "create",
    label: "Create a To-Do",
    href: "/todo",
    icon: ListPlus,
  },
  {
    id: "my-tasks",
    label: "View Tasks",
    href: "/todo/my-tasks",
    icon: ListChecks,
  },
];

export function getTodoNavItemByPath(pathname: string): TodoNavItem | undefined {
  if (pathname === "/todo" || pathname === "/todo/") {
    return TODO_NAV_ITEMS.find((item) => item.id === "create");
  }
  return TODO_NAV_ITEMS.find(
    (item) => item.id !== "create" && pathname.startsWith(item.href)
  );
}

export function defaultTodoRoute(): string {
  return "/todo";
}
