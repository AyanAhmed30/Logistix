-- =====================================================
-- Migration: Fix Existing Leads Status
-- Purpose: Set default status for existing leads that don't have a status
-- Related Functionality: Fix constraint violation errors for existing leads
-- =====================================================

-- Update any leads that don't have a status to 'Leads' (default)
update leads 
set status = 'Leads' 
where status is null or status = '';

-- Ensure all leads have a valid status
-- This handles any edge cases where status might be empty string
update leads 
set status = 'Leads' 
where status not in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win');
