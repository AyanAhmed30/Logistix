-- =====================================================
-- Migration: Add additional fields to packing_lists table
-- Purpose: Support full packing list format with Bill To, Ship To, and shipping details
-- =====================================================

-- Add new columns to packing_lists table
ALTER TABLE packing_lists
ADD COLUMN IF NOT EXISTS invoice_no text,
ADD COLUMN IF NOT EXISTS bill_to_name text,
ADD COLUMN IF NOT EXISTS bill_to_address text,
ADD COLUMN IF NOT EXISTS bill_to_ntn text,
ADD COLUMN IF NOT EXISTS bill_to_phone text,
ADD COLUMN IF NOT EXISTS bill_to_email text,
ADD COLUMN IF NOT EXISTS ship_to_name text,
ADD COLUMN IF NOT EXISTS ship_to_address text,
ADD COLUMN IF NOT EXISTS ship_to_ntn text,
ADD COLUMN IF NOT EXISTS ship_to_phone text,
ADD COLUMN IF NOT EXISTS ship_to_email text,
ADD COLUMN IF NOT EXISTS payment_terms text,
ADD COLUMN IF NOT EXISTS shipped_via text,
ADD COLUMN IF NOT EXISTS coo text,
ADD COLUMN IF NOT EXISTS port_loading text,
ADD COLUMN IF NOT EXISTS port_discharge text,
ADD COLUMN IF NOT EXISTS shipping_terms text;

-- Keep existing columns for backward compatibility
-- build_to and ship_to are kept but can be migrated to bill_to_name and ship_to_name
