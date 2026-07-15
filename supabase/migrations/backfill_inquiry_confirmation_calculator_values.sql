-- Backfill inquiry_confirmations.calculator_values from lead_inquiries when
-- the confirmation snapshot is empty / non-meaningful but the inquiry still
-- has calculator data. Safe to re-run.

update public.inquiry_confirmations as ic
set
  calculator_values = li.calculator_values,
  updated_at = now()
from public.lead_inquiries as li
where ic.inquiry_id = li.id
  and li.calculator_values is not null
  and li.calculator_values::text not in ('{}', 'null', '[]')
  and (
    ic.calculator_values is null
    or ic.calculator_values::text in ('{}', 'null', '[]')
    or (
      -- confirmation only has attachment metadata / empty shell
      jsonb_typeof(ic.calculator_values) = 'object'
      and not (
        ic.calculator_values ? 'unit_value'
        or ic.calculator_values ? 'inv_value'
        or ic.calculator_values ? 'exchange_rate'
        or ic.calculator_values ? 'custom_duty_rate'
        or ic.calculator_values ? 'calculators'
      )
    )
  );
