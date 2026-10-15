-- MRE01 — B-49 Master Recipe Engine, test environment for Brigade 2.0 (Chef Max GO 15/10/2026).
--
-- ISOLATION (the point of this migration):
--   * Everything lives in the NEW schema "mre". No existing table, view, function, policy, trigger or cron is changed.
--   * No foreign key points from mre to public: deleting or editing anything in main Brigade is never blocked or cascaded.
--   * Recipe and ingredient identities are REUSED (mre.recipes.id = public.recipes.id, lines carry public.ingredients.id),
--     but only as plain uuid values read by the server.
--   * The only functions that look outside mre are STABLE read-only helpers (prices, conversions, kitchen measures)
--     that call the existing FC05 functions; they write nothing.
--   * RLS on, no policies, all grants revoked from anon/authenticated: only the edge function brigade-app-api
--     (service role) can reach these objects. Main Brigade, bots, POS, stock and recipes never read or write here.
--
-- ROLLBACK (main Brigade does not depend on any of this):
--   drop schema if exists mre cascade; drop owned by mre_app; drop role if exists mre_app;

create schema if not exists mre;
revoke all on schema mre from public, anon, authenticated;
grant usage on schema mre to service_role;

-- One row per recipe in the lab. id = public.recipes.id (same identity, no copy of the id space).
create table mre.recipes (
  id               uuid primary key,
  pilot            boolean not null default false,       -- true = one of the 20 pilot dishes; false = sub-recipe pulled in
  is_test          boolean not null default false,       -- technical example recipe (Chef's 7-egg sponge), not an official recipe; tests write only here
  current_version  integer not null,
  imported_at      timestamptz not null default now(),
  source           jsonb not null,                      -- frozen snapshot of what Brigade had at import (text, BOM, steps, yields)
  diffs            jsonb not null default '[]'::jsonb,  -- text vs BOM differences found at import: never resolved automatically
  diffs_checked_by bigint,
  diffs_checked_at timestamptz
);

-- Versions. 'importata' = converted from Brigade, waiting for Chef; 'pubblicata' = official in the lab; 'bozza' = Chef draft.
create table mre.versions (
  recipe_id     uuid not null references mre.recipes(id),
  version       integer not null check (version >= 1),
  state         text not null check (state in ('importata', 'bozza', 'pubblicata')),
  doc           jsonb not null,
  reason        text,
  created_by    bigint,
  created_at    timestamptz not null default now(),
  published_by  bigint,
  published_at  timestamptz,
  primary key (recipe_id, version)
);
create unique index versions_one_draft on mre.versions(recipe_id) where state = 'bozza';

-- A published or imported version can never change (TRUST: history is immutable).
create function mre.versions_freeze() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.state <> 'bozza' then raise exception 'mre: published versions cannot be deleted'; end if;
  if tg_op = 'UPDATE' and old.state <> 'bozza' then raise exception 'mre: published versions cannot be changed'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger versions_freeze before update or delete on mre.versions for each row execute function mre.versions_freeze();

-- Production actually done (plan vs real). Lab only: never touches prep_log, stock or deductions.
create table mre.productions (
  id            uuid primary key default gen_random_uuid(),
  client_key    uuid unique,                              -- a double tap writes once
  recipe_id     uuid not null references mre.recipes(id),
  version       integer not null,
  factor        numeric not null check (factor > 0),
  reference     text,                                     -- what the cook scaled from ("uova 5 pz", "3,7 lotti")
  yield_planned_g numeric,
  yield_real_g  numeric,
  changed       jsonb not null default '[]'::jsonb,       -- only the lines the cook changed: planned vs real
  note          text,
  user_id       bigint not null,
  created_at    timestamptz not null default now(),
  foreign key (recipe_id, version) references mre.versions(recipe_id, version)
);

-- Staff suggestions. Approving never changes a recipe: only the Chef edits and publishes.
create table mre.suggestions (
  id          uuid primary key default gen_random_uuid(),
  client_key  uuid unique,
  recipe_id   uuid not null references mre.recipes(id),
  version     integer not null,
  user_id     bigint not null,
  text        text not null check (length(text) between 2 and 2000),
  status      text not null default 'in attesa' check (status in ('in attesa', 'approvato', 'rifiutato', 'in sospeso')),
  created_at  timestamptz not null default now(),
  decided_by  bigint,
  decided_at  timestamptz,
  chef_note   text
);

-- Every write in the lab, who and when.
create table mre.audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    bigint,
  op         text not null,
  recipe_id  uuid,
  detail     jsonb
);

alter table mre.recipes     enable row level security;
alter table mre.versions    enable row level security;
alter table mre.productions enable row level security;
alter table mre.suggestions enable row level security;
alter table mre.audit       enable row level security;
revoke all on all tables in schema mre from public, anon, authenticated;
revoke all on all sequences in schema mre from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema mre to service_role;
grant usage, select on all sequences in schema mre to service_role;

-- Read-only facts the engine needs for each ingredient, from the EXISTING single sources:
-- names (public.ingredients), price (food_cost.price_for = FC05 choice), density and piece weight
-- (food_cost.conv_for = approved conversions first), non-food policy. Nothing is copied or stored.
create function mre.ingredient_facts(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(jsonb_object_agg(i.id, jsonb_build_object(
    'id', i.id, 'name', i.name, 'name_it', i.name_it, 'name_es', i.name_es,
    'category', i.category, 'base_unit', i.base_unit, 'active', i.active,
    'piece_g', (select case when c.valore is not null then jsonb_build_object('v', c.valore, 'stato', c.stato, 'fonte', c.fonte) end from food_cost.conv_for(i.id, 'peso_pezzo') c),
    'density', (select case when c.valore is not null then jsonb_build_object('v', c.valore, 'stato', c.stato, 'fonte', c.fonte) end from food_cost.conv_for(i.id, 'densita') c),
    'policy', (select p.policy from food_cost.ingredient_policy p where p.ingredient_id = i.id),
    'price', (select to_jsonb(x) - 'conflicts' - 'candidate_id' || jsonb_build_object('conflicts', coalesce(array_length(x.conflicts, 1), 0))
              from food_cost.price_for(i.id, null) x limit 1)
  )), '{}'::jsonb)
  from public.ingredients i
  where i.id = any(p_ids)
$$;

create function mre.kitchen_measures()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$ select coalesce(jsonb_object_agg(lower(unita), grammi), '{}'::jsonb) from food_cost.misure_cucina $$;

-- Ingredient search for the Chef editor (active ingredients only, names only).
create function mre.ingredient_search(p_q text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'name_it', name_it, 'base_unit', base_unit) order by name), '[]'::jsonb)
  from (select id, name, name_it, base_unit from public.ingredients
        where active is not false and length(coalesce(p_q, '')) >= 2
          and (name ilike '%' || p_q || '%' or name_it ilike '%' || p_q || '%')
        order by name limit 30) s
$$;

revoke all on function mre.ingredient_facts(uuid[]), mre.kitchen_measures(), mre.ingredient_search(text), mre.versions_freeze() from public, anon, authenticated;
grant execute on function mre.ingredient_facts(uuid[]), mre.kitchen_measures(), mre.ingredient_search(text) to service_role;

-- DATABASE-LEVEL GUARANTEE: the lab code runs every statement under this role (SET LOCAL ROLE mre_app).
-- mre_app has rights ONLY inside schema mre (+ the three read-only helpers above). It has no right on any
-- public / food_cost table: even a bug in the lab code cannot write to main Brigade — Postgres refuses it.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mre_app') then create role mre_app nologin noinherit; end if;
end $$;
grant usage on schema mre to mre_app;
grant select, insert, update on mre.recipes, mre.versions, mre.productions, mre.suggestions to mre_app;
grant delete on mre.versions to mre_app;          -- drafts only (the trigger refuses published/imported versions)
grant insert, select on mre.audit to mre_app;
grant usage, select on all sequences in schema mre to mre_app;
grant execute on function mre.ingredient_facts(uuid[]), mre.kitchen_measures(), mre.ingredient_search(text) to mre_app;
create policy mre_app_all on mre.recipes     to mre_app using (true) with check (true);
create policy mre_app_all on mre.versions    to mre_app using (true) with check (true);
create policy mre_app_all on mre.productions to mre_app using (true) with check (true);
create policy mre_app_all on mre.suggestions to mre_app using (true) with check (true);
create policy mre_app_all on mre.audit       to mre_app using (true) with check (true);
grant mre_app to postgres;                        -- lets the edge function connection SET ROLE mre_app
-- ROLLBACK addendum: drop schema mre cascade; drop owned by mre_app; drop role mre_app;
