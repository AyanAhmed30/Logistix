-- =====================================================
-- Migration: create todos
-- Purpose: Global Admin To-Do module (create + view my tasks)
-- Auth: referenced against existing app_users and employees
-- Location: supabase/to-do-migrations/ (do not copy into supabase/migrations/)
-- =====================================================

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date date,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed')),
  assigned_to_user_id uuid references public.app_users(id) on delete set null,
  assigned_to_employee_id uuid,
  assigned_to_username text not null,
  assigned_to_name text not null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_username text not null,
  created_by_name text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint todos_assignee_present check (
    assigned_to_user_id is not null
    or assigned_to_employee_id is not null
    or length(trim(assigned_to_username)) > 0
  )
);

-- Employees is an HR table and may be created via supabase/HR-migrations/.
-- Attach the FK only when that table already exists.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'employees'
  ) and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'todos'
      and constraint_name = 'todos_assigned_to_employee_id_fkey'
  ) then
    alter table public.todos
      add constraint todos_assigned_to_employee_id_fkey
      foreign key (assigned_to_employee_id)
      references public.employees(id)
      on delete set null;
  end if;
end $$;

alter table public.todos enable row level security;

drop policy if exists "Full access for service role" on public.todos;

create policy "Full access for service role"
on public.todos
for all
using (true)
with check (true);

create index if not exists idx_todos_assigned_to_user_id
  on public.todos(assigned_to_user_id);

create index if not exists idx_todos_assigned_to_employee_id
  on public.todos(assigned_to_employee_id);

create index if not exists idx_todos_assigned_to_username
  on public.todos(assigned_to_username);

create index if not exists idx_todos_created_by_user_id
  on public.todos(created_by_user_id);

create index if not exists idx_todos_status
  on public.todos(status);

create index if not exists idx_todos_priority
  on public.todos(priority);

create index if not exists idx_todos_due_date
  on public.todos(due_date);

create index if not exists idx_todos_created_at
  on public.todos(created_at desc);
