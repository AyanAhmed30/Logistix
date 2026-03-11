-- Migration: Add 'log_note' and 'activity' actions to quotation_logs
-- Date: 2026-03-11
-- Purpose: Enable internal log notes and activity reminders for quotations

-- =====================================================
-- Update quotation_logs table
-- =====================================================

-- Step 1: Drop the existing check constraint
ALTER TABLE quotation_logs 
DROP CONSTRAINT IF EXISTS quotation_logs_action_check;

-- Step 2: Add the new check constraint with 'log_note' and 'activity' actions
ALTER TABLE quotation_logs 
ADD CONSTRAINT quotation_logs_action_check 
CHECK (action IN ('created', 'updated', 'deleted', 'status_changed', 'printed', 'log_note', 'activity'));
