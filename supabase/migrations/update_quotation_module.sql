-- =====================================================
-- Migration: Update Quotation Module for Odoo-like functionality
-- Adds quotation_number, expiration_date, payment_terms, taxes columns
-- Creates inquiry_logs table for tracking inquiry edits
-- =====================================================

-- Add new columns to quotations table
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_number TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Immediate';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS taxes NUMERIC(5,2) DEFAULT 0;

-- Auto-assign quotation numbers to existing rows that don't have one
DO $$
DECLARE
  r RECORD;
  counter INT := 1;
BEGIN
  FOR r IN SELECT id FROM quotations WHERE quotation_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE quotations SET quotation_number = 'S' || LPAD(counter::TEXT, 5, '0') WHERE id = r.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- Create inquiry_logs table for tracking inquiry edits
CREATE TABLE IF NOT EXISTS inquiry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES lead_inquiries(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);
