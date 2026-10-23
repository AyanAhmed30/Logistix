-- STEP 045 — Soft-delete mobile application users
-- Admin can delete Application Users; deleted accounts cannot login
-- and existing session tokens are rejected.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

alter table public.users
  add column if not exists deleted_at timestamptz null;

comment on column public.users.deleted_at is
  'Set when an admin deletes the mobile application user. Non-null blocks login and sessions.';

create index if not exists users_active_created_at_idx
  on public.users (created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Session resolution: reject tokens for deleted users
-- ---------------------------------------------------------------------------
create or replace function public._resolve_session_user_id(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_session_token is null or length(trim(p_session_token)) < 32 then
    raise exception 'invalid_session' using errcode = '42501';
  end if;

  select s.user_id
  into v_user_id
  from public.user_sessions s
  join public.users u on u.id = s.user_id
  where s.token = trim(p_session_token)
    and s.revoked_at is null
    and s.expires_at > now()
    and u.deleted_at is null
  limit 1;

  if v_user_id is null then
    raise exception 'invalid_session' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

revoke all on function public._resolve_session_user_id(text) from public;

-- ---------------------------------------------------------------------------
-- Login: exclude soft-deleted accounts (same error as bad credentials)
-- ---------------------------------------------------------------------------
create or replace function public.login_user(p_phone text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.users%rowtype;
  v_session record;
begin
  select * into v_user
  from public.users u
  where u.deleted_at is null
    and (
      public.phones_match(u.phone, trim(p_phone))
      or u.phone = trim(p_phone)
    )
  order by case when u.phone = trim(p_phone) then 0 else 1 end, u.created_at asc
  limit 1;

  if not found then
    raise exception 'invalid_credentials';
  end if;

  if v_user.password_hash is distinct from extensions.crypt(p_password, v_user.password_hash) then
    raise exception 'invalid_credentials';
  end if;

  select * into v_session from public._issue_user_session(v_user.id);

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'email', v_user.email,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'created_at', v_user.created_at
    ),
    'session_token', v_session.session_token,
    'expires_at', v_session.expires_at
  );
end;
$$;

revoke all on function public.login_user(text, text) from public;
grant execute on function public.login_user(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Validate session: also reject if user became deleted after token issued
-- ---------------------------------------------------------------------------
create or replace function public.validate_user_session(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_expires timestamptz;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select s.expires_at into v_expires
  from public.user_sessions s
  where s.token = trim(p_session_token)
    and s.revoked_at is null
  limit 1;

  select * into v_user
  from public.users
  where id = v_user_id
    and deleted_at is null;

  if not found then
    raise exception 'invalid_session' using errcode = '42501';
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
    'session_token', trim(p_session_token),
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.validate_user_session(text) from public;
grant execute on function public.validate_user_session(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Password reset request: ignore deleted users (anti-enumeration preserved)
-- ---------------------------------------------------------------------------
create or replace function public.request_password_reset(
  p_phone text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.users%rowtype;
  v_token text;
  v_expires timestamptz;
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));

  -- Anti-enumeration: always succeed from the client's perspective when inputs
  -- are well-formed; only issue a token when phone+email match an active account.
  if p_phone is null or length(trim(p_phone)) < 7 or v_email = '' then
    return jsonb_build_object(
      'ok', true,
      'reset_token', encode(extensions.gen_random_bytes(32), 'hex'),
      'expires_at', now() + interval '20 minutes'
    );
  end if;

  select * into v_user
  from public.users
  where phone = trim(p_phone)
    and email = v_email
    and deleted_at is null
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'reset_token', encode(extensions.gen_random_bytes(32), 'hex'),
      'expires_at', now() + interval '20 minutes'
    );
  end if;

  update public.password_reset_tokens
  set used_at = now()
  where user_id = v_user.id
    and used_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + interval '20 minutes';

  insert into public.password_reset_tokens (user_id, token, expires_at)
  values (v_user.id, v_token, v_expires);

  return jsonb_build_object(
    'ok', true,
    'reset_token', v_token,
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.request_password_reset(text, text) from public;
grant execute on function public.request_password_reset(text, text) to anon, authenticated, service_role;
