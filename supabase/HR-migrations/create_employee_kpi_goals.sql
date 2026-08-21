-- Create employee_kpi_goals table
CREATE TABLE IF NOT EXISTS public.employee_kpi_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  goal text NOT NULL,
  weight integer NOT NULL CHECK (weight >= 1 AND weight <= 100),
  target text NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_kpi_goals ENABLE ROW LEVEL SECURITY;

-- Service Role policy (same as HR module)
CREATE POLICY "Service role can do anything" ON public.employee_kpi_goals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_employee_kpi_goals_employee_id ON public.employee_kpi_goals(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_kpi_goals_status ON public.employee_kpi_goals(status);
CREATE INDEX IF NOT EXISTS idx_employee_kpi_goals_created_at ON public.employee_kpi_goals(created_at);
