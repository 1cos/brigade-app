-- APP01 — Brigade new app: reserved access (Max + Pablo), own sessions, sandboxed events.
-- Additive only: three NEW tables and one NEW function. No existing table, policy or function is changed.
-- None of these objects is reachable with the public anon key: RLS on with no policies, grants revoked.
-- Only the edge function brigade-app-api (service role) uses them.
--
-- ROLLBACK (Brigade attuale non ne dipende):
--   drop function if exists public.app_login(text, text);
--   drop table if exists public.app_events, public.app_sessions, public.app_access;

create table if not exists public.app_access (
  user_id   bigint primary key references public.users(id),
  app_role  text not null check (app_role in ('chef', 'staff')),
  note      text,
  added_at  timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             bigint not null references public.users(id),
  token_hash          text not null unique,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  expires_at          timestamptz not null,           -- sliding: 30 days from last use
  absolute_expires_at timestamptz not null,           -- hard cap: 180 days
  revoked_at          timestamptz,
  user_agent          text
);
create index if not exists app_sessions_user_idx on public.app_sessions(user_id) where revoked_at is null;

-- Everything the new app writes in R1 lives here, marked as test, until Chef authorises operational writes.
create table if not exists public.app_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       bigint not null references public.users(id),   -- set by the server from the session, never by the phone
  kind          text not null check (kind in ('prep_start', 'prep_done', 'count', 'report', 'chef_message', 'message_read', 'report_read')),
  prep_task_id  bigint,
  recipe_id     uuid,
  qty           numeric,
  unit          text,
  text          text,
  to_user_id    bigint,          -- chef_message: null = everyone
  ref_id        uuid,            -- message_read / report_read: the event read
  mode          text not null default 'test' check (mode in ('test', 'live')),
  client_key    uuid unique      -- idempotency: a double tap writes once
);
create index if not exists app_events_kind_idx on public.app_events(kind, created_at desc);

alter table public.app_access   enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_events   enable row level security;
revoke all on public.app_access, public.app_sessions, public.app_events from anon, authenticated;

insert into public.app_access (user_id, app_role, note) values
  (1,  'chef',  'Max — Executive Chef'),
  (38, 'staff', 'Pablo — dummy staff used only by Max')
on conflict (user_id) do nothing;

-- PIN check restricted to the reserved users. Does NOT touch brigade_sessions,
-- so logging in here never logs anybody out of the current Brigade.
create or replace function public.app_login(p_pin text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user  public.users%rowtype;
  v_role  text;
  v_token text;
  v_now   timestamptz := now();
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return jsonb_build_object('ok', false);
  end if;

  select u.* into v_user
  from public.users u join public.app_access a on a.user_id = u.id
  where u.active = true and u.pin_hash is not null and u.pin_hash = crypt(p_pin, u.pin_hash)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  select app_role into v_role from public.app_access where user_id = v_user.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token_hash, expires_at, absolute_expires_at, user_agent)
  values (v_user.id, encode(digest(v_token, 'sha256'), 'hex'), v_now + interval '30 days', v_now + interval '180 days', left(p_user_agent, 300));

  return jsonb_build_object('ok', true, 'token', v_token,
    'user', jsonb_build_object('id', v_user.id, 'name', v_user.name, 'lang', v_user.lang,
                               'station', v_user.default_station, 'role', v_role));
end;
$$;
revoke all on function public.app_login(text, text) from public, anon, authenticated;
grant execute on function public.app_login(text, text) to service_role;
