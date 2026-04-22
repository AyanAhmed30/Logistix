-- =====================================================
-- Contacts module: additional Sales & Purchase fields
-- Adds the fields required by the Odoo-style
-- Sales & Purchase tab:
--   SALES:    Payment Method, Incoterm, Incoterm Location
--   PURCHASE: Group RFQ, Buyer, Payment Terms, Payment Method,
--             Receipt Reminder
-- Safe to run multiple times (uses "if not exists").
-- =====================================================

alter table public.contacts
  add column if not exists sales_payment_method text,
  add column if not exists incoterm text,
  add column if not exists incoterm_location text,
  add column if not exists group_rfq text default 'On Order',
  add column if not exists buyer text,
  add column if not exists purchase_payment_terms text,
  add column if not exists purchase_payment_method text,
  add column if not exists receipt_reminder boolean not null default false;
