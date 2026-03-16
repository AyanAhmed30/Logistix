-- =====================================================
-- Migration: Replace Sales Agent Code system with Random 6-digit Lead IDs
-- 1. Add lead_id_formatted to leads table
-- 2. Make sales_agents.code optional (no longer required)
-- 3. Backfill existing leads with random 6-digit unique IDs
-- 4. Update customer_id_formatted for converted leads to match
-- =====================================================

-- STEP 1: Add lead_id_formatted column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_id_formatted TEXT;

-- Create unique index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_lead_id_formatted_key'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_lead_id_formatted_key UNIQUE (lead_id_formatted);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_lead_id_formatted ON leads(lead_id_formatted);

-- STEP 2: Drop the NOT NULL / unique constraint on sales_agents.code if it exists
-- (allow code to be NULL for new agents created without a code)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_agents_code_key'
  ) THEN
    ALTER TABLE sales_agents DROP CONSTRAINT sales_agents_code_key;
  END IF;
END $$;

-- STEP 3: Assign random 6-digit unique IDs to existing leads that don't have one
DO $$
DECLARE
  lead_record RECORD;
  new_id TEXT;
  id_exists BOOLEAN;
BEGIN
  FOR lead_record IN
    SELECT id FROM leads WHERE lead_id_formatted IS NULL ORDER BY created_at ASC
  LOOP
    LOOP
      -- Generate a random 6-digit number (100000–999999)
      new_id := LPAD((100000 + floor(random() * 900000))::TEXT, 6, '0');
      -- Check uniqueness
      SELECT EXISTS(SELECT 1 FROM leads WHERE lead_id_formatted = new_id) INTO id_exists;
      EXIT WHEN NOT id_exists;
    END LOOP;

    UPDATE leads SET lead_id_formatted = new_id WHERE id = lead_record.id;
  END LOOP;
END $$;

-- STEP 4: Update customer_id_formatted for converted leads
-- Set customer_id_formatted = lead's lead_id_formatted
UPDATE customers c
SET customer_id_formatted = l.lead_id_formatted
FROM leads l
WHERE c.lead_id = l.id
  AND l.lead_id_formatted IS NOT NULL;
