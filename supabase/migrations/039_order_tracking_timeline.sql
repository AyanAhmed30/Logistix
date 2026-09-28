-- STEP 039 — Order tracking timeline fields for customer order detail
-- Extends get_customer_order with inquiry request timestamp for tracking UI.
-- Prerequisites: 038_quotation_shipment_acceptance.sql

create or replace function public.get_customer_order(
  p_session_token text,
  p_quotation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_portal jsonb;
  v_inquiry_ids uuid[];
  v_row record;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select u.phone into v_phone
  from public.users u
  where u.id = v_user_id;

  if v_phone is null then
    raise exception 'unauthorized_user' using errcode = '42501';
  end if;

  v_portal := public._customer_portal_for_user_phone(v_phone);

  select coalesce(array_agg((elem->>'id')::uuid), array[]::uuid[])
  into v_inquiry_ids
  from jsonb_array_elements(coalesce(v_portal->'inquiries', '[]'::jsonb)) elem
  where nullif(elem->>'id', '') is not null;

  select
    q.id as order_id,
    q.id as quotation_id,
    q.quotation_number,
    q.linked_inquiry_id as inquiry_id,
    q.customer_name,
    q.product_service,
    q.total_amount,
    q.customer_pdf_url as pdf_url,
    q.status as quotation_db_status,
    q.negotiation_status,
    q.sent_to_customer_at as quotation_sent_at,
    q.customer_accepted_at as accepted_at,
    q.shipment_tracking_number,
    q.shipment_tracking_added_at,
    q.shipment_parcel_photo_url,
    q.shipment_parcel_photo_uploaded_at,
    q.shipment_info_updated_at,
    q.shipment_info_updated_by,
    q.shipment_info_updated_by_role,
    sa.name as salesperson_name,
    public._quotation_shipment_status(
      q.customer_accepted_at,
      q.shipment_tracking_number,
      q.shipment_parcel_photo_url,
      q.sent_to_customer_at
    ) as shipment_status,
    q.updated_at,
    q.created_at,
    coalesce(li.sent_at, li.created_at) as inquiry_requested_at,
    li.created_at as inquiry_created_at,
    li.sent_at as inquiry_sent_at,
    li.customer_submitted as inquiry_customer_submitted
  into v_row
  from public.quotations q
  left join public.sales_agents sa on sa.id = q.salesperson_id
  left join public.lead_inquiries li on li.id = q.linked_inquiry_id
  where q.id = p_quotation_id
    and q.customer_accepted_at is not null
    and q.linked_inquiry_id = any (v_inquiry_ids);

  if not found then
    raise exception 'order_not_found' using errcode = '42501';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.get_customer_order(text, uuid) from public;
grant execute on function public.get_customer_order(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
