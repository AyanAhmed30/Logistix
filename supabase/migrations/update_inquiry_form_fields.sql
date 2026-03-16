-- =====================================================
-- Migration: Update inquiry form fields for detailed product inquiries
-- Purpose: Replace generic description/link fields with structured product fields
-- Adds: product_name, total_weight, cbm, quantity, sent_to_operations
-- =====================================================

-- Add product inquiry detail columns
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT '';
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS total_weight TEXT DEFAULT '';
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS cbm TEXT DEFAULT '';
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS quantity TEXT DEFAULT '';

-- Track whether inquiry was sent to operations department
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS sent_to_operations BOOLEAN NOT NULL DEFAULT false;

-- For existing inquiries that were already sent to accounting, also mark as sent to operations
UPDATE lead_inquiries SET sent_to_operations = true WHERE sent_to_accounting = true;
