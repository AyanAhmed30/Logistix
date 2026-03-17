-- =====================================================
-- Migration: Create Inquiry Confirmations table
-- Purpose: Allow Operations to submit filled inquiry forms
--          for Admin approval/rejection
-- Flow: Operations fills Lead Management Form → Sends for Confirmation
--        → Admin Approves or Rejects → Status updates in Operations
-- =====================================================

CREATE TABLE IF NOT EXISTS inquiry_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES lead_inquiries(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lead_number TEXT NOT NULL,            -- The 6-digit lead_id_formatted entered
  product_name TEXT NOT NULL DEFAULT '',
  total_weight TEXT DEFAULT '',
  cbm TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  original_image_url TEXT,              -- Read-only image from original inquiry
  additional_image_1_url TEXT,          -- First additional uploaded image
  additional_image_2_url TEXT,          -- Second additional uploaded image
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_inquiry_id ON inquiry_confirmations(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_lead_id ON inquiry_confirmations(lead_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_status ON inquiry_confirmations(status);
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_lead_number ON inquiry_confirmations(lead_number);

-- Enable RLS
ALTER TABLE inquiry_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Full access for service role"
ON inquiry_confirmations
FOR ALL
USING (true)
WITH CHECK (true);
