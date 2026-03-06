-- Migration: Add 'printed' action to quotation_logs and invoice_logs
-- Date: 2026-01-XX
-- Purpose: Enable logging of print actions for quotations and invoices

-- =====================================================
-- Update quotation_logs table
-- =====================================================

-- Step 1: Drop the existing check constraint (if it exists)
ALTER TABLE quotation_logs 
DROP CONSTRAINT IF EXISTS quotation_logs_action_check;

-- Step 2: Add the new check constraint with 'printed' action
ALTER TABLE quotation_logs 
ADD CONSTRAINT quotation_logs_action_check 
CHECK (action IN ('created', 'updated', 'deleted', 'status_changed', 'printed'));

-- =====================================================
-- Update invoice_logs table
-- =====================================================

-- Step 1: Drop the existing check constraint (if it exists)
ALTER TABLE invoice_logs 
DROP CONSTRAINT IF EXISTS invoice_logs_action_check;

-- Step 2: Add the new check constraint with 'printed' action
ALTER TABLE invoice_logs 
ADD CONSTRAINT invoice_logs_action_check 
CHECK (action IN ('created', 'updated', 'deleted', 'status_changed', 'payment_registered', 'printed'));

-- =====================================================
-- Verification queries (optional - run to verify)
-- =====================================================

-- Check quotation_logs constraint
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'quotation_logs'::regclass
AND conname = 'quotation_logs_action_check';

-- Check invoice_logs constraint
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'invoice_logs'::regclass
AND conname = 'invoice_logs_action_check';
