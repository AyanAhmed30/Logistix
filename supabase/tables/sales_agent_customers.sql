-- =====================================================
-- Table: sales_agent_customers
-- Purpose: Junction table linking sales agents to customers
-- Related Functionality: Sales tab - Customer allocation to sales agents
-- Related Tables: sales_agents, customers
-- =====================================================

create table if not exists sales_agent_customers (
  sales_agent_id uuid references sales_agents(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  primary key (sales_agent_id, customer_id),
  assigned_at timestamptz default now()
);

-- Create index on sales_agent_id for faster lookups
create index if not exists idx_sales_agent_customers_agent_id on sales_agent_customers(sales_agent_id);

-- Create index on customer_id for faster lookups
create index if not exists idx_sales_agent_customers_customer_id on sales_agent_customers(customer_id);

-- Ensure one customer can only be assigned to one sales agent
create unique index if not exists idx_sales_agent_customers_unique_customer on sales_agent_customers(customer_id);
