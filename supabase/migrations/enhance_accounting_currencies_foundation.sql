-- =====================================================
-- Accounting Foundation — Multi-Currency Engine (Odoo-style)
-- Extends currencies + exchange_rates. Idempotent.
-- Single source of truth for rates, precision, org defaults.
-- =====================================================

-- Ensure master tables exist (safe if earlier migration already created them)
CREATE TABLE IF NOT EXISTS public.currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT '',
  is_base BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT currencies_code_uppercase CHECK (code = upper(code))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_currencies_single_base
  ON public.currencies (is_base)
  WHERE is_base = true;

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_id UUID NOT NULL REFERENCES public.currencies(id) ON DELETE CASCADE,
  rate_date DATE NOT NULL,
  rate_to_base NUMERIC(18, 8) NOT NULL CHECK (rate_to_base > 0),
  source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rates_unique_per_day UNIQUE (currency_id, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_date
  ON public.exchange_rates (currency_id, rate_date DESC);

-- ---- Currency master enhancements (Odoo res.currency fields) ----
ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS decimal_places INTEGER NOT NULL DEFAULT 2;

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS rounding NUMERIC(18, 8) NOT NULL DEFAULT 0.01;

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS symbol_position TEXT NOT NULL DEFAULT 'before';

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 100;

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Optional FX P&L accounts (resolved by code if null)
ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS unrealized_gain_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS unrealized_loss_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.currencies
    DROP CONSTRAINT IF EXISTS currencies_decimal_places_check;
  ALTER TABLE public.currencies
    ADD CONSTRAINT currencies_decimal_places_check
    CHECK (decimal_places >= 0 AND decimal_places <= 6);

  ALTER TABLE public.currencies
    DROP CONSTRAINT IF EXISTS currencies_rounding_check;
  ALTER TABLE public.currencies
    ADD CONSTRAINT currencies_rounding_check
    CHECK (rounding > 0);

  ALTER TABLE public.currencies
    DROP CONSTRAINT IF EXISTS currencies_symbol_position_check;
  ALTER TABLE public.currencies
    ADD CONSTRAINT currencies_symbol_position_check
    CHECK (symbol_position IN ('before', 'after'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'currencies check constraints: %', SQLERRM;
END
$$;

-- ---- Exchange rate enhancements (manual + future API sync) ----
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS rate_type TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

DO $$
BEGIN
  ALTER TABLE public.exchange_rates
    DROP CONSTRAINT IF EXISTS exchange_rates_rate_type_check;
  ALTER TABLE public.exchange_rates
    ADD CONSTRAINT exchange_rates_rate_type_check
    CHECK (rate_type IN ('manual', 'api', 'bank', 'import'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'exchange_rates rate_type check: %', SQLERRM;
END
$$;

CREATE INDEX IF NOT EXISTS idx_currencies_active_sequence
  ON public.currencies (is_active, sequence, code);

-- ---- Organization company currency (Odoo res.company.currency_id) ----
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS currency_id UUID
    REFERENCES public.currencies(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_organizations_currency_id
  ON public.organizations (currency_id);

-- ---- Document-level currency (amounts stay in document currency;
--      company_amount_* stores converted company/base amounts for GL/reporting) ----
ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS currency_id UUID
    REFERENCES public.currencies(id) ON DELETE RESTRICT;

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS currency_code TEXT;

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8);

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS amount_total_company NUMERIC(18, 2);

ALTER TABLE public.accounting_vendor_bills
  ADD COLUMN IF NOT EXISTS currency_id UUID
    REFERENCES public.currencies(id) ON DELETE RESTRICT;

ALTER TABLE public.accounting_vendor_bills
  ADD COLUMN IF NOT EXISTS currency_code TEXT;

ALTER TABLE public.accounting_vendor_bills
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8);

ALTER TABLE public.accounting_vendor_bills
  ADD COLUMN IF NOT EXISTS amount_total_company NUMERIC(18, 2);

-- Partner preferred currency (Odoo res.partner.currency_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) THEN
    ALTER TABLE public.contacts
      ADD COLUMN IF NOT EXISTS currency_id UUID
        REFERENCES public.currencies(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_contacts_currency_id
      ON public.contacts (currency_id);
  END IF;
END
$$;

-- Credit notes / payments if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounting_credit_notes'
  ) THEN
    ALTER TABLE public.accounting_credit_notes
      ADD COLUMN IF NOT EXISTS currency_id UUID
        REFERENCES public.currencies(id) ON DELETE RESTRICT;
    ALTER TABLE public.accounting_credit_notes
      ADD COLUMN IF NOT EXISTS currency_code TEXT;
    ALTER TABLE public.accounting_credit_notes
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8);
    ALTER TABLE public.accounting_credit_notes
      ADD COLUMN IF NOT EXISTS amount_total_company NUMERIC(18, 2);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounting_customer_payments'
  ) THEN
    ALTER TABLE public.accounting_customer_payments
      ADD COLUMN IF NOT EXISTS currency_id UUID
        REFERENCES public.currencies(id) ON DELETE RESTRICT;
    ALTER TABLE public.accounting_customer_payments
      ADD COLUMN IF NOT EXISTS currency_code TEXT;
    ALTER TABLE public.accounting_customer_payments
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8);
    ALTER TABLE public.accounting_customer_payments
      ADD COLUMN IF NOT EXISTS amount_company NUMERIC(18, 2);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounting_vendor_payments'
  ) THEN
    ALTER TABLE public.accounting_vendor_payments
      ADD COLUMN IF NOT EXISTS currency_id UUID
        REFERENCES public.currencies(id) ON DELETE RESTRICT;
    ALTER TABLE public.accounting_vendor_payments
      ADD COLUMN IF NOT EXISTS currency_code TEXT;
    ALTER TABLE public.accounting_vendor_payments
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8);
    ALTER TABLE public.accounting_vendor_payments
      ADD COLUMN IF NOT EXISTS amount_company NUMERIC(18, 2);
  END IF;
END
$$;

-- Journals: optional FK alongside text currency code (keep text for compat)
ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS currency_id UUID
    REFERENCES public.currencies(id) ON DELETE SET NULL;

-- ERP journal entries header already has currency text; add rate + company link
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounting_journal_entries'
  ) THEN
    ALTER TABLE public.accounting_journal_entries
      ADD COLUMN IF NOT EXISTS currency_id UUID
        REFERENCES public.currencies(id) ON DELETE SET NULL;
    ALTER TABLE public.accounting_journal_entries
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8);
  END IF;
END
$$;

-- RLS (service-role friendly, matches other accounting foundations)
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.currencies;
CREATE POLICY "Full access for service role"
  ON public.currencies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Full access for service role" ON public.exchange_rates;
CREATE POLICY "Full access for service role"
  ON public.exchange_rates FOR ALL USING (true) WITH CHECK (true);

-- Seed core currencies (administrators can add more without code changes)
INSERT INTO public.currencies (code, name, symbol, is_base, is_active, decimal_places, rounding, symbol_position, sequence)
VALUES
  ('PKR', 'Pakistani Rupee', 'Rs', true,  true, 2, 0.01, 'before', 10),
  ('USD', 'US Dollar',       '$',  false, true, 2, 0.01, 'before', 20),
  ('AED', 'UAE Dirham',      'د.إ', false, true, 2, 0.01, 'before', 30),
  ('SAR', 'Saudi Riyal',     '﷼',  false, true, 2, 0.01, 'before', 40),
  ('EUR', 'Euro',            '€',  false, true, 2, 0.01, 'before', 50),
  ('GBP', 'British Pound',   '£',  false, true, 2, 0.01, 'before', 60),
  ('RMB', 'Chinese Yuan',    '¥',  false, true, 2, 0.01, 'before', 70)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  symbol = COALESCE(NULLIF(public.currencies.symbol, ''), EXCLUDED.symbol),
  is_active = true,
  decimal_places = COALESCE(public.currencies.decimal_places, EXCLUDED.decimal_places),
  rounding = COALESCE(public.currencies.rounding, EXCLUDED.rounding),
  symbol_position = COALESCE(public.currencies.symbol_position, EXCLUDED.symbol_position),
  sequence = LEAST(public.currencies.sequence, EXCLUDED.sequence),
  updated_at = now();

-- Ensure exactly one base (PKR) if none / multiple
UPDATE public.currencies SET is_base = false WHERE code <> 'PKR' AND is_base = true;
UPDATE public.currencies SET is_base = true  WHERE code = 'PKR';

-- Seed starter rates (manual placeholders; admins update in Configuration)
INSERT INTO public.exchange_rates (currency_id, rate_date, rate_to_base, source, rate_type)
SELECT c.id, CURRENT_DATE, v.rate, 'seed', 'manual'
FROM (VALUES
  ('USD', 278.00000000),
  ('AED',  75.70000000),
  ('SAR',  74.10000000),
  ('EUR', 300.00000000),
  ('GBP', 350.00000000),
  ('RMB',  38.50000000)
) AS v(code, rate)
JOIN public.currencies c ON c.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.exchange_rates er
  WHERE er.currency_id = c.id AND er.rate_date = CURRENT_DATE
);

-- Backfill organization company currency → PKR (base)
UPDATE public.organizations o
SET currency_id = c.id
FROM public.currencies c
WHERE c.code = 'PKR'
  AND o.currency_id IS NULL;

-- Backfill document currency_code from company / base when null
UPDATE public.accounting_customer_invoices i
SET
  currency_id = COALESCE(i.currency_id, o.currency_id, c.id),
  currency_code = COALESCE(NULLIF(i.currency_code, ''), bc.code, 'PKR'),
  exchange_rate = COALESCE(i.exchange_rate, 1),
  amount_total_company = COALESCE(i.amount_total_company, i.total_amount)
FROM public.organizations o
LEFT JOIN public.currencies c ON c.id = o.currency_id
CROSS JOIN LATERAL (
  SELECT code FROM public.currencies WHERE is_base = true LIMIT 1
) bc
WHERE i.organization_id = o.id
  AND (i.currency_id IS NULL OR i.currency_code IS NULL);

UPDATE public.accounting_vendor_bills b
SET
  currency_id = COALESCE(b.currency_id, o.currency_id, c.id),
  currency_code = COALESCE(NULLIF(b.currency_code, ''), bc.code, 'PKR'),
  exchange_rate = COALESCE(b.exchange_rate, 1),
  amount_total_company = COALESCE(b.amount_total_company, b.total_amount)
FROM public.organizations o
LEFT JOIN public.currencies c ON c.id = o.currency_id
CROSS JOIN LATERAL (
  SELECT code FROM public.currencies WHERE is_base = true LIMIT 1
) bc
WHERE b.organization_id = o.id
  AND (b.currency_id IS NULL OR b.currency_code IS NULL);

-- Link journals.currency text → currency_id (only if text column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'journals'
      AND column_name = 'currency'
  ) THEN
    UPDATE public.journals j
    SET currency_id = c.id
    FROM public.currencies c
    WHERE upper(j.currency) = c.code
      AND j.currency_id IS NULL;
  END IF;
END
$$;

-- Seed FX gain/loss CoA accounts when chart exists (codes used by multiCurrency.ts)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chart_of_accounts'
  ) THEN
    INSERT INTO public.chart_of_accounts (code, name, type, account_type, is_active)
    SELECT v.code, v.name, v.type, v.account_type, true
    FROM (VALUES
      ('4008', 'Foreign Exchange Gain', 'income', 'income'),
      ('5008', 'Foreign Exchange Loss', 'expense', 'expense')
    ) AS v(code, name, type, account_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts ca WHERE ca.code = v.code
    );
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'FX gain/loss CoA seed skipped: %', SQLERRM;
END
$$;

-- Rate helpers (refresh for precision + convert_between)
CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_currency_code text,
  p_rate_date date DEFAULT current_date
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base_code text;
  _code text;
  _rate numeric(18, 8);
BEGIN
  _code := upper(coalesce(p_currency_code, ''));
  IF _code = '' THEN
    RAISE EXCEPTION 'Currency code is required.';
  END IF;

  SELECT code INTO _base_code
  FROM public.currencies
  WHERE is_base = true
  LIMIT 1;

  IF _base_code IS NULL THEN
    RAISE EXCEPTION 'Base currency is not configured.';
  END IF;

  IF _code = _base_code THEN
    RETURN 1;
  END IF;

  SELECT er.rate_to_base INTO _rate
  FROM public.exchange_rates er
  JOIN public.currencies c ON c.id = er.currency_id
  WHERE c.code = _code
    AND c.is_active = true
    AND er.rate_date <= coalesce(p_rate_date, current_date)
  ORDER BY er.rate_date DESC
  LIMIT 1;

  IF _rate IS NULL THEN
    RAISE EXCEPTION 'Exchange rate not found for % on or before %.', _code, coalesce(p_rate_date, current_date);
  END IF;

  RETURN _rate;
END
$$;

CREATE OR REPLACE FUNCTION public.convert_to_base(
  p_foreign_amount numeric,
  p_rate_to_base numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_foreign_amount IS NULL THEN
    RETURN 0;
  END IF;
  IF p_rate_to_base IS NULL OR p_rate_to_base <= 0 THEN
    RAISE EXCEPTION 'Exchange rate must be greater than zero.';
  END IF;
  RETURN round(p_foreign_amount * p_rate_to_base, 2);
END
$$;

-- Convert between any two currencies via base triangulation
CREATE OR REPLACE FUNCTION public.convert_currency_amount(
  p_amount numeric,
  p_from_code text,
  p_to_code text,
  p_rate_date date DEFAULT current_date
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from text := upper(coalesce(p_from_code, ''));
  _to text := upper(coalesce(p_to_code, ''));
  _from_rate numeric(18, 8);
  _to_rate numeric(18, 8);
  _base_amount numeric;
  _decimals integer := 2;
BEGIN
  IF p_amount IS NULL THEN
    RETURN 0;
  END IF;
  IF _from = '' OR _to = '' THEN
    RAISE EXCEPTION 'From and to currency codes are required.';
  END IF;
  IF _from = _to THEN
    RETURN round(p_amount, 2);
  END IF;

  _from_rate := public.get_exchange_rate(_from, p_rate_date);
  _to_rate := public.get_exchange_rate(_to, p_rate_date);
  _base_amount := p_amount * _from_rate;

  SELECT COALESCE(decimal_places, 2) INTO _decimals
  FROM public.currencies WHERE code = _to LIMIT 1;

  RETURN round(_base_amount / _to_rate, COALESCE(_decimals, 2));
END
$$;

GRANT EXECUTE ON FUNCTION public.get_exchange_rate(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_to_base(numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_currency_amount(numeric, text, text, date) TO authenticated, service_role;
