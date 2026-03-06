-- =====================================================
-- Migration: Add 'Follow up' and 'Lose' statuses to leads table
-- Purpose: Enable new pipeline boards for Follow up and Lose statuses
-- Related Functionality: Sales Agent Dashboard - Pipeline Tab
-- =====================================================

-- Step 1: Drop the existing check constraint
ALTER TABLE leads 
DROP CONSTRAINT IF EXISTS leads_status_check;

-- Step 2: Add the new check constraint with 'Follow up' and 'Lose' statuses
ALTER TABLE leads 
ADD CONSTRAINT leads_status_check 
CHECK (status IN ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose'));

-- =====================================================
-- Verification query (optional - run to verify)
-- =====================================================
-- SELECT 
--     conname AS constraint_name,
--     pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'leads'::regclass
-- AND conname = 'leads_status_check';
