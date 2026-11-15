-- User accounts for Groundwork. Reachable only through the app-key RPCs below; anon has no table access.
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  name text,
  password_hash text not null,
  role text not null default 'member' check (role in ('admin','member')),
  is_initial boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  pw_changed_at timestamptz not null default now(),
  constraint app_users_username_fmt check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);
create unique index if not exists app_users_username_key on public.app_users (username);
create unique index if not exists app_users_one_initial on public.app_users (is_initial) where is_initial;
alter table public.app_users enable row level security;
revoke all on public.app_users from anon, authenticated;

create or replace function public.app_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_key is not null and exists (
    select 1 from public.app_access a
    where a.key_hash = encode(sha256(convert_to(p_key,'UTF8')),'hex'));
$$;
revoke all on function public.app_key_ok(text) from public, anon, authenticated;

create or replace function public.app_user_row(u public.app_users) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',u.id,'username',u.username,'name',u.name,'role',u.role,
    'is_initial',u.is_initial,'active',u.active,'created_at',u.created_at,
    'last_login_at',u.last_login_at,'pw_changed_at',u.pw_changed_at);
$$;
revoke all on function public.app_user_row(public.app_users) from public, anon, authenticated;

create or replace function public.app_user_login_get(p_key text, p_username text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  select * into u from public.app_users where username = lower(p_username);
  if not found then return null; end if;
  return public.app_user_row(u) || jsonb_build_object('password_hash', u.password_hash);
end $$;

create or replace function public.app_user_get(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  select * into u from public.app_users where id = p_id;
  if not found then return null; end if;
  return public.app_user_row(u);
end $$;

create or replace function public.app_user_hash(p_key text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  select password_hash into h from public.app_users where id = p_id and active;
  return h;
end $$;

create or replace function public.app_user_bootstrap(p_key text, p_username text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  select * into u from public.app_users where is_initial;
  if found then return public.app_user_row(u); end if;
  insert into public.app_users (username, name, password_hash, role, is_initial)
    values (lower(p_username), 'Administrator', p_hash, 'admin', true)
    on conflict do nothing;
  select * into u from public.app_users where is_initial;
  return case when found then public.app_user_row(u) else null end;
end $$;

create or replace function public.app_users_list(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  return coalesce((select jsonb_agg(public.app_user_row(u) order by u.is_initial desc, u.created_at) from public.app_users u), '[]'::jsonb);
end $$;

create or replace function public.app_user_create(p_key text, p_username text, p_name text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  begin
    insert into public.app_users (username, name, password_hash, role)
      values (lower(p_username), nullif(trim(p_name),''), p_hash, 'member') returning * into u;
  exception when unique_violation then return jsonb_build_object('error','duplicate');
           when check_violation then return jsonb_build_object('error','invalid');
  end;
  return public.app_user_row(u);
end $$;

create or replace function public.app_user_update(p_key text, p_id uuid, p_name text, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  select * into u from public.app_users where id = p_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if u.is_initial and p_active is false then return jsonb_build_object('error','protected'); end if;
  update public.app_users set name = coalesce(nullif(trim(p_name),''), name), active = coalesce(p_active, active)
    where id = p_id returning * into u;
  return public.app_user_row(u);
end $$;

create or replace function public.app_user_set_hash(p_key text, p_id uuid, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  update public.app_users set password_hash = p_hash, pw_changed_at = now() where id = p_id returning * into u;
  if not found then return jsonb_build_object('error','not_found'); end if;
  return public.app_user_row(u);
end $$;

create or replace function public.app_user_delete(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.app_users;
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  select * into u from public.app_users where id = p_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if u.is_initial then return jsonb_build_object('error','protected'); end if;
  delete from public.app_users where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_user_touch(p_key text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_key_ok(p_key) then raise exception 'unauthorized' using errcode='28000'; end if;
  update public.app_users set last_login_at = now() where id = p_id;
end $$;

grant execute on function
  public.app_user_login_get(text,text), public.app_user_get(text,uuid), public.app_user_hash(text,uuid),
  public.app_user_bootstrap(text,text,text), public.app_users_list(text),
  public.app_user_create(text,text,text,text), public.app_user_update(text,uuid,text,boolean),
  public.app_user_set_hash(text,uuid,text), public.app_user_delete(text,uuid), public.app_user_touch(text,uuid)
  to anon, authenticated;
