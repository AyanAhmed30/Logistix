-- =====================================================
-- Table: app_users
-- Purpose: Store application user accounts (admin and regular users)
-- Related Functionality: Authentication, User Management
-- =====================================================

create table if not exists public.app_users (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  password text not null,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.app_users enable row level security;

-- Create index on username for faster lookups
create index if not exists idx_app_users_username on app_users(username);

-- Create index on role for filtering
create index if not exists idx_app_users_role on app_users(role);
