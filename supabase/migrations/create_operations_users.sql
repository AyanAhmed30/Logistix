-- Create operations_users table for Operations team members
CREATE TABLE IF NOT EXISTS operations_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast login lookups
CREATE INDEX IF NOT EXISTS idx_operations_users_username ON operations_users(username);
