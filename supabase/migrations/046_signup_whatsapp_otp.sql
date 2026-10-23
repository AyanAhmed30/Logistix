-- STEP 046 — WhatsApp OTP verification for mobile signup
-- Tables + RPCs for OTP send/verify; register_user requires signup proof.
-- OTP plaintext is returned only to service_role callers (Next.js API), never to anon.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.signup_phone_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  phone_key text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  consumed_at timestamptz null,
  invalidated_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists signup_phone_otps_phone_key_active_idx
  on public.signup_phone_otps (phone_key, created_at desc)
  where consumed_at is null and invalidated_at is null;

create table if not exists public.signup_phone_proofs (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  phone_key text not null,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint signup_phone_proofs_token_len check (length(token) >= 32)
);

create index if not exists signup_phone_proofs_token_idx
  on public.signup_phone_proofs (token)
  where used_at is null;

alter table public.signup_phone_otps enable row level security;
alter table public.signup_phone_proofs enable row level security;
revoke all on public.signup_phone_otps from anon, authenticated;
revoke all on public.signup_phone_proofs from anon, authenticated;
grant all on public.signup_phone_otps to service_role;
grant all on public.signup_phone_proofs to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._signup_phone_key(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  d := public.normalize_phone_digits(p_phone);
  if d is null or d = '' then
    return '';
  end if;
  if length(d) = 11 and left(d, 1) = '0' then
    return '92' || substr(d, 2);
  end if;
  if length(d) = 10 and left(d, 1) = '3' then
    return '92' || d;
  end if;
  if left(d, 2) = '92' then
    return d;
  end if;
  return d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create OTP (service_role only). Returns plaintext code once for WhatsApp send.
-- ---------------------------------------------------------------------------
create or replace function public.create_signup_otp(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text;
  v_key text;
  v_code text;
  v_expires timestamptz;
  v_cooldown_seconds integer := 60;
  v_last_created timestamptz;
  v_wait integer;
begin
  v_phone := trim(coalesce(p_phone, ''));
  v_key := public._signup_phone_key(v_phone);

  if v_key = '' or length(v_key) < 11 then
    raise exception 'invalid_phone';
  end if;

  -- Canonical store as +92…
  if left(v_key, 2) = '92' then
    v_phone := '+' || v_key;
  end if;

  if exists (
    select 1 from public.users u
    where u.deleted_at is null
      and public.phones_match(u.phone, v_phone)
  ) then
    raise exception 'duplicate_phone';
  end if;

  select o.created_at into v_last_created
  from public.signup_phone_otps o
  where o.phone_key = v_key
  order by o.created_at desc
  limit 1;

  if v_last_created is not null then
    v_wait := v_cooldown_seconds - floor(extract(epoch from (now() - v_last_created)))::integer;
    if v_wait > 0 then
      raise exception 'otp_cooldown:%', v_wait;
    end if;
  end if;

  -- Invalidate previous active OTPs for this phone
  update public.signup_phone_otps
  set invalidated_at = now()
  where phone_key = v_key
    and consumed_at is null
    and invalidated_at is null;

  -- Cryptographically strong 4-digit OTP (0000–9999), zero-padded
  v_code := lpad(
    (('x' || encode(extensions.gen_random_bytes(2), 'hex'))::bit(16)::int % 10000)::text,
    4,
    '0'
  );
  v_expires := now() + interval '10 minutes';

  insert into public.signup_phone_otps (phone, phone_key, code_hash, expires_at)
  values (
    v_phone,
    v_key,
    extensions.crypt(v_code, extensions.gen_salt('bf'::text)),
    v_expires
  );

  -- Returned only to the service-role API that will send WhatsApp.
  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'phone', v_phone,
    'expires_at', v_expires,
    'cooldown_seconds', v_cooldown_seconds
  );
end;
$$;

revoke all on function public.create_signup_otp(text) from public;
grant execute on function public.create_signup_otp(text) to service_role;

-- ---------------------------------------------------------------------------
-- Verify OTP → issue signup proof token (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.verify_signup_otp(p_phone text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone text;
  v_key text;
  v_code text;
  v_otp public.signup_phone_otps%rowtype;
  v_token text;
  v_expires timestamptz;
begin
  v_phone := trim(coalesce(p_phone, ''));
  v_key := public._signup_phone_key(v_phone);
  v_code := trim(coalesce(p_code, ''));

  if v_key = '' or length(v_key) < 11 then
    raise exception 'invalid_phone';
  end if;

  if v_code !~ '^\d{4}$' then
    raise exception 'otp_invalid';
  end if;

  if left(v_key, 2) = '92' then
    v_phone := '+' || v_key;
  end if;

  select * into v_otp
  from public.signup_phone_otps o
  where o.phone_key = v_key
    and o.consumed_at is null
    and o.invalidated_at is null
  order by o.created_at desc
  limit 1;

  if not found then
    raise exception 'otp_invalid';
  end if;

  if v_otp.expires_at <= now() then
    update public.signup_phone_otps
    set invalidated_at = coalesce(invalidated_at, now())
    where id = v_otp.id;
    raise exception 'otp_expired';
  end if;

  if v_otp.attempt_count >= v_otp.max_attempts then
    raise exception 'otp_locked';
  end if;

  if v_otp.code_hash is distinct from extensions.crypt(v_code, v_otp.code_hash) then
    update public.signup_phone_otps
    set attempt_count = attempt_count + 1
    where id = v_otp.id;

    if v_otp.attempt_count + 1 >= v_otp.max_attempts then
      raise exception 'otp_locked';
    end if;
    raise exception 'otp_invalid';
  end if;

  update public.signup_phone_otps
  set consumed_at = now()
  where id = v_otp.id;

  -- Invalidate any other lingering OTPs
  update public.signup_phone_otps
  set invalidated_at = now()
  where phone_key = v_key
    and id <> v_otp.id
    and consumed_at is null
    and invalidated_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + interval '30 minutes';

  insert into public.signup_phone_proofs (phone, phone_key, token, expires_at)
  values (v_phone, v_key, v_token, v_expires);

  return jsonb_build_object(
    'ok', true,
    'signup_proof_token', v_token,
    'expires_at', v_expires,
    'phone', v_phone
  );
end;
$$;

revoke all on function public.verify_signup_otp(text, text) from public;
grant execute on function public.verify_signup_otp(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- register_user: require unused signup proof matching phone
-- ---------------------------------------------------------------------------
drop function if exists public.register_user(text, text, text, text, text);
drop function if exists public.register_user(text, text, text, text, text, text);

create or replace function public.register_user(
  p_phone text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_password text,
  p_signup_proof text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.users%rowtype;
  v_phone text;
  v_contact public.contacts%rowtype;
  v_agent_id uuid;
  v_agent_username text;
  v_org_id uuid;
  v_display_name text;
  v_lead_id text;
  v_created_contact boolean := false;
  v_assigned_now boolean := false;
  v_proof public.signup_phone_proofs%rowtype;
  v_proof_token text;
begin
  v_phone := trim(coalesce(p_phone, ''));
  v_proof_token := trim(coalesce(p_signup_proof, ''));

  if length(v_phone) < 7
     or public.normalize_phone_digits(v_phone) is null
     or length(public.normalize_phone_digits(v_phone)) < 7 then
    raise exception 'invalid_phone';
  end if;

  if length(v_proof_token) < 32 then
    raise exception 'phone_not_verified';
  end if;

  select * into v_proof
  from public.signup_phone_proofs p
  where p.token = v_proof_token
    and p.used_at is null
    and p.expires_at > now()
  limit 1;

  if not found then
    raise exception 'phone_not_verified';
  end if;

  if not public.phones_match(v_proof.phone, v_phone)
     and public._signup_phone_key(v_proof.phone) is distinct from public._signup_phone_key(v_phone) then
    raise exception 'phone_not_verified';
  end if;

  if length(coalesce(p_password, '')) < 8 then
    raise exception 'weak_password';
  end if;

  if exists (
    select 1
    from public.users u
    where u.deleted_at is null
      and public.phones_match(u.phone, v_phone)
  ) then
    raise exception 'duplicate_phone';
  end if;

  begin
    insert into public.users (phone, email, first_name, last_name, password_hash)
    values (
      v_phone,
      lower(trim(p_email)),
      trim(p_first_name),
      trim(p_last_name),
      extensions.crypt(p_password, extensions.gen_salt('bf'::text))
    )
    returning * into v_user;
  exception
    when unique_violation then
      if SQLERRM ilike '%users_phone_key%' or SQLERRM ilike '%phone%' then
        raise exception 'duplicate_phone';
      elsif SQLERRM ilike '%users_email_key%' or SQLERRM ilike '%email%' then
        raise exception 'duplicate_email';
      else
        raise exception 'duplicate_account';
      end if;
  end;

  -- Consume proof exactly once (after user insert succeeds)
  update public.signup_phone_proofs
  set used_at = now()
  where id = v_proof.id
    and used_at is null;

  if not found then
    raise exception 'phone_not_verified';
  end if;

  v_display_name := trim(both from concat_ws(' ', trim(p_first_name), trim(p_last_name)));
  if v_display_name = '' then
    v_display_name := v_phone;
  end if;

  perform pg_advisory_xact_lock(872314001);

  select c.*
  into v_contact
  from public.contacts c
  where public.phones_match(c.phone, v_phone)
     or public.phones_match(c.mobile, v_phone)
  order by
    case when c.salesperson_id is not null then 0 else 1 end,
    c.created_at asc nulls last,
    c.id asc
  limit 1;

  if found then
    update public.contacts
    set
      mobile_registered_at = coalesce(mobile_registered_at, now()),
      mobile_user_id = coalesce(mobile_user_id, v_user.id),
      email = coalesce(nullif(btrim(email), ''), lower(trim(p_email))),
      updated_at = now()
    where id = v_contact.id
    returning * into v_contact;

    if v_contact.salesperson_id is null then
      v_agent_id := public._pick_least_loaded_sales_agent();
      if v_agent_id is null then
        raise exception 'no_active_sales_agent';
      end if;

      select sa.username into v_agent_username
      from public.sales_agents sa
      where sa.id = v_agent_id;

      v_org_id := public._organization_id_for_sales_agent(v_agent_id);

      update public.contacts
      set
        salesperson_id = v_agent_id,
        created_by = coalesce(nullif(btrim(created_by), ''), v_agent_username),
        organization_id = coalesce(v_org_id, organization_id),
        updated_at = now()
      where id = v_contact.id
      returning * into v_contact;

      update public.sales_agents
      set last_mobile_auto_assigned_at = now(), updated_at = now()
      where id = v_agent_id;

      perform public._record_contact_sales_assignment(
        v_contact.id,
        v_agent_id,
        null,
        'automatic',
        'mobile_register',
        'existing_contact_missing_salesperson'
      );
      v_assigned_now := true;
    else
      v_org_id := public._organization_id_for_sales_agent(v_contact.salesperson_id);
      if v_org_id is not null and v_contact.organization_id is distinct from v_org_id then
        update public.contacts
        set organization_id = v_org_id, updated_at = now()
        where id = v_contact.id
        returning * into v_contact;
      end if;
    end if;
  else
    v_agent_id := public._pick_least_loaded_sales_agent();
    if v_agent_id is null then
      raise exception 'no_active_sales_agent';
    end if;

    select sa.username into v_agent_username
    from public.sales_agents sa
    where sa.id = v_agent_id;

    v_org_id := coalesce(
      public._organization_id_for_sales_agent(v_agent_id),
      public._default_organization_id_for_mobile()
    );
    v_lead_id := public._allocate_contact_lead_id_safe();

    insert into public.contacts (
      contact_kind,
      company_type,
      name,
      email,
      phone,
      mobile,
      salesperson_id,
      source,
      mobile_registered_at,
      mobile_user_id,
      organization_id,
      lead_id_formatted,
      created_by,
      customer_rank,
      is_active
    ) values (
      'contact',
      'person',
      v_display_name,
      lower(trim(p_email)),
      v_phone,
      v_phone,
      v_agent_id,
      'mobile_app',
      now(),
      v_user.id,
      v_org_id,
      v_lead_id,
      v_agent_username,
      1,
      true
    )
    returning * into v_contact;

    update public.sales_agents
    set last_mobile_auto_assigned_at = now(), updated_at = now()
    where id = v_agent_id;

    perform public._record_contact_sales_assignment(
      v_contact.id,
      v_agent_id,
      null,
      'automatic',
      'mobile_register',
      'new_mobile_customer'
    );

    v_created_contact := true;
    v_assigned_now := true;
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'email', v_user.email,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'created_at', v_user.created_at
    ),
    'contact_id', v_contact.id,
    'salesperson_id', v_contact.salesperson_id,
    'created_contact', v_created_contact,
    'assigned_now', v_assigned_now
  );
end;
$$;

revoke all on function public.register_user(text, text, text, text, text, text) from public;
grant execute on function public.register_user(text, text, text, text, text, text)
  to anon, authenticated, service_role;
