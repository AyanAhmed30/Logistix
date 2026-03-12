-- =====================================================
-- Migration: Add UOM (Unit of Measurement) to quotations
-- =====================================================

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'pcs / u';
