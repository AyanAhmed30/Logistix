-- STEP 054 — Record when Operations and Admin first open an inquiry
-- Prerequisite: 051 (inquiry_workflow_events).
--
-- Adds two event types so the Analytics timeline can show when Operations opened
-- an inquiry and when Admin started reviewing it. Only the allowed-values check on
-- the analytics events table changes. No rows or business tables are touched.
-- Past inquiries have no such events and stay blank; nothing is estimated.
-- Idempotent. Safe to run multiple times.

ALTER TABLE public.inquiry_workflow_events
  DROP CONSTRAINT IF EXISTS inquiry_workflow_events_event_type_check;

ALTER TABLE public.inquiry_workflow_events
  ADD CONSTRAINT inquiry_workflow_events_event_type_check
  CHECK (event_type IN (
    'submitted',
    'resubmitted',
    'operations_opened',
    'operations_submitted',
    'admin_calculated',
    'admin_review_opened',
    'approved',
    'rejected',
    'flagged'
  ));

NOTIFY pgrst, 'reload schema';
