-- Add job_description column to employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS job_description text;
