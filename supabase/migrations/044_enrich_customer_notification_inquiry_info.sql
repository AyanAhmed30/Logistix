-- STEP 044 — Include inquiry info in customer notification title/message
-- UI only shows title + message (not payload), so copy must carry
-- inquiry_reference, product_name, and quantity.

create or replace function public._customer_inquiry_notify_bits(p_inquiry_id uuid)
returns table (
  inquiry_reference text,
  product_name text,
  quantity text,
  label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_product text;
  v_qty text;
  v_parts text[] := array[]::text[];
begin
  if p_inquiry_id is null then
    inquiry_reference := null;
    product_name := null;
    quantity := null;
    label := 'your inquiry';
    return next;
    return;
  end if;

  select
    nullif(trim(coalesce(li.inquiry_reference, '')), ''),
    nullif(trim(coalesce(li.product_name, '')), ''),
    nullif(trim(coalesce(li.quantity, '')), '')
  into v_ref, v_product, v_qty
  from public.lead_inquiries li
  where li.id = p_inquiry_id;

  if v_ref is not null then
    v_parts := array_append(v_parts, v_ref);
  end if;
  if v_product is not null then
    v_parts := array_append(v_parts, v_product);
  end if;
  if v_qty is not null then
    v_parts := array_append(v_parts, 'qty ' || v_qty);
  end if;

  inquiry_reference := v_ref;
  product_name := v_product;
  quantity := v_qty;
  label := case
    when coalesce(array_length(v_parts, 1), 0) > 0 then array_to_string(v_parts, ' · ')
    else 'your inquiry'
  end;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Inquiry submitted
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_inquiry_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_submitted boolean;
  v_now_submitted boolean;
  v_bits record;
begin
  v_was_submitted := coalesce(TG_OP = 'UPDATE' and OLD.customer_submitted, false);
  v_now_submitted := coalesce(NEW.customer_submitted, false)
    or (
      lower(coalesce(NEW.status, '')) <> 'draft'
      and coalesce(NEW.customer_submitted, false)
    );

  if not v_now_submitted then
    return NEW;
  end if;

  if TG_OP = 'INSERT' and v_now_submitted then
    null;
  elsif TG_OP = 'UPDATE' and v_now_submitted and not v_was_submitted then
    null;
  elsif TG_OP = 'UPDATE'
    and lower(coalesce(OLD.status, '')) = 'draft'
    and lower(coalesce(NEW.status, '')) <> 'draft'
    and coalesce(NEW.customer_submitted, false)
  then
    null;
  else
    return NEW;
  end if;

  select * into v_bits from public._customer_inquiry_notify_bits(NEW.id);

  perform public._notify_customer_app(
    NEW.lead_id,
    NEW.id,
    null,
    'inquiry_submitted',
    'Inquiry submitted · ' || v_bits.label,
    'Your inquiry for ' || v_bits.label
      || ' has been submitted successfully. Our team will review it and update you shortly.',
    '/(tabs)/inquiries/' || NEW.id::text,
    'inquiry_submitted:' || NEW.id::text,
    jsonb_build_object(
      'inquiry_reference', v_bits.inquiry_reference,
      'product_name', coalesce(v_bits.product_name, NEW.product_name),
      'quantity', coalesce(v_bits.quantity, NEW.quantity)
    )
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Operations → Admin
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_ops_to_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bits record;
begin
  if NEW.event_type is distinct from 'sent_for_admin_approval' then
    return NEW;
  end if;

  select * into v_bits from public._customer_inquiry_notify_bits(NEW.inquiry_id);

  perform public._notify_customer_app(
    NEW.lead_id,
    NEW.inquiry_id,
    null,
    'inquiry_with_admin',
    'Inquiry in progress · ' || v_bits.label,
    'Your inquiry for ' || v_bits.label
      || ' is now being processed by our team. We’ll keep you updated on the next steps.',
    case
      when NEW.inquiry_id is not null then '/(tabs)/inquiries/' || NEW.inquiry_id::text
      else '/(tabs)/inquiries'
    end,
    'inquiry_with_admin:' || coalesce(NEW.inquiry_id::text, NEW.confirmation_id::text, NEW.id::text),
    jsonb_build_object(
      'confirmation_id', NEW.confirmation_id,
      'inquiry_reference', v_bits.inquiry_reference,
      'product_name', v_bits.product_name,
      'quantity', v_bits.quantity
    )
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Quotation sent
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_quotation_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_inquiry_id uuid;
  v_href text;
  v_dedupe text;
  v_bits record;
begin
  if NEW.sent_to_customer_at is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
    and OLD.sent_to_customer_at is not null
    and OLD.sent_to_customer_at is not distinct from NEW.sent_to_customer_at
  then
    return NEW;
  end if;

  v_inquiry_id := NEW.linked_inquiry_id;
  if v_inquiry_id is not null then
    select li.lead_id into v_lead_id
    from public.lead_inquiries li
    where li.id = v_inquiry_id;
  end if;

  if v_lead_id is null then
    return NEW;
  end if;

  select * into v_bits from public._customer_inquiry_notify_bits(v_inquiry_id);

  v_href := case
    when v_inquiry_id is not null then '/(tabs)/inquiries/' || v_inquiry_id::text || '/quote'
    else '/(tabs)/inquiries'
  end;

  v_dedupe := 'quotation_sent:' || NEW.id::text || ':' || NEW.sent_to_customer_at::text;

  perform public._notify_customer_app(
    v_lead_id,
    v_inquiry_id,
    NEW.id,
    'quotation_sent',
    'Quotation ready · ' || v_bits.label,
    'Your quotation for ' || v_bits.label
      || case
           when nullif(trim(coalesce(NEW.quotation_number, '')), '') is not null
             then ' (' || trim(NEW.quotation_number) || ')'
           else ''
         end
      || ' is ready. Tap to review the details.',
    v_href,
    v_dedupe,
    jsonb_build_object(
      'quotation_number', NEW.quotation_number,
      'total_amount', NEW.total_amount,
      'inquiry_reference', v_bits.inquiry_reference,
      'product_name', v_bits.product_name,
      'quantity', v_bits.quantity
    )
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4–6) Tracking / photo / warehouse
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_shipment_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_inquiry_id uuid;
  v_order_href text;
  v_docs_href text;
  v_had_tracking boolean;
  v_has_tracking boolean;
  v_had_photo boolean;
  v_has_photo boolean;
  v_actor text;
  v_bits record;
begin
  if NEW.customer_accepted_at is null then
    return NEW;
  end if;

  v_inquiry_id := NEW.linked_inquiry_id;
  if v_inquiry_id is not null then
    select li.lead_id into v_lead_id
    from public.lead_inquiries li
    where li.id = v_inquiry_id;
  end if;
  if v_lead_id is null then
    return NEW;
  end if;

  v_actor := lower(coalesce(NEW.shipment_info_updated_by_role, ''));
  if v_actor = 'customer' then
    return NEW;
  end if;

  select * into v_bits from public._customer_inquiry_notify_bits(v_inquiry_id);

  v_had_tracking := nullif(trim(coalesce(OLD.shipment_tracking_number, '')), '') is not null;
  v_has_tracking := nullif(trim(coalesce(NEW.shipment_tracking_number, '')), '') is not null;
  v_had_photo := nullif(trim(coalesce(OLD.shipment_parcel_photo_url, '')), '') is not null;
  v_has_photo := nullif(trim(coalesce(NEW.shipment_parcel_photo_url, '')), '') is not null;

  v_order_href := '/(tabs)/orders/' || NEW.id::text;
  v_docs_href := case
    when v_inquiry_id is not null then
      '/(tabs)/profile/documents/' || v_inquiry_id::text || '?source=inquiry'
    else
      '/(tabs)/profile/documents/' || NEW.id::text || '?source=order'
  end;

  if v_has_tracking and (
    not v_had_tracking
    or coalesce(OLD.shipment_tracking_number, '') is distinct from coalesce(NEW.shipment_tracking_number, '')
  ) then
    perform public._notify_customer_app(
      v_lead_id,
      v_inquiry_id,
      NEW.id,
      'tracking_available',
      'Tracking available · ' || v_bits.label,
      'Tracking for ' || v_bits.label
        || case
             when nullif(trim(coalesce(NEW.shipment_tracking_number, '')), '') is not null
               then ' (' || trim(NEW.shipment_tracking_number) || ')'
             else ''
           end
        || ' is now available. Tap to view your order status.',
      v_order_href,
      'tracking_available:' || NEW.id::text || ':' || left(coalesce(NEW.shipment_tracking_number, ''), 80),
      jsonb_build_object(
        'tracking_number', NEW.shipment_tracking_number,
        'inquiry_reference', v_bits.inquiry_reference,
        'product_name', v_bits.product_name,
        'quantity', v_bits.quantity
      )
    );
  end if;

  if v_has_photo and not v_had_photo then
    perform public._notify_customer_app(
      v_lead_id,
      v_inquiry_id,
      NEW.id,
      'shipment_photo_added',
      'Shipment photos added · ' || v_bits.label,
      'New shipment photos were added for ' || v_bits.label || '. Tap to view them.',
      v_docs_href,
      'shipment_photo_added:' || NEW.id::text,
      jsonb_build_object(
        'photo_url', NEW.shipment_parcel_photo_url,
        'inquiry_reference', v_bits.inquiry_reference,
        'product_name', v_bits.product_name,
        'quantity', v_bits.quantity
      )
    );
  end if;

  if v_has_tracking and v_has_photo and (not v_had_tracking or not v_had_photo) then
    perform public._notify_customer_app(
      v_lead_id,
      v_inquiry_id,
      NEW.id,
      'warehouse_received',
      'Received at warehouse · ' || v_bits.label,
      v_bits.label || ' has been received at our warehouse and is now being processed.',
      v_order_href,
      'warehouse_received:' || NEW.id::text,
      jsonb_build_object(
        'tracking_number', NEW.shipment_tracking_number,
        'has_photo', true,
        'inquiry_reference', v_bits.inquiry_reference,
        'product_name', v_bits.product_name,
        'quantity', v_bits.quantity
      )
    );
  end if;

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Rate approved
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_rate_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bits record;
begin
  if NEW.event_type is distinct from 'approved' then
    return NEW;
  end if;

  select * into v_bits from public._customer_inquiry_notify_bits(NEW.inquiry_id);

  perform public._notify_customer_app(
    NEW.lead_id,
    NEW.inquiry_id,
    null,
    'rate_approved',
    'Request confirmed · ' || v_bits.label,
    'Your request for ' || v_bits.label
      || ' has been confirmed by our team. A quotation will follow shortly.',
    case
      when NEW.inquiry_id is not null then '/(tabs)/inquiries/' || NEW.inquiry_id::text
      else '/(tabs)/inquiries'
    end,
    'rate_approved:' || coalesce(NEW.inquiry_id::text, NEW.confirmation_id::text, NEW.id::text),
    jsonb_build_object(
      'inquiry_reference', v_bits.inquiry_reference,
      'product_name', v_bits.product_name,
      'quantity', v_bits.quantity
    )
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;
