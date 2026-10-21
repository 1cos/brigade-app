-- B-49 R1.15 (Chef GO 21/10/2026): the Chef's decisions on suggested purchase matches — LAB ONLY (schema mre).
-- One row per (ingredient, purchased article): 'collega' (linked in a recipe draft) or 'non_corrisponde' (never proposed again).
-- Nothing here changes an official recipe, ingredient, vendor, price or invoice: those tables are only read.
-- ROLLBACK: drop table mre.match_decisions;
create table if not exists mre.match_decisions (
  ingredient_id   uuid not null,
  candidate_key   text not null,
  decision        text not null check (decision in ('collega', 'non_corrisponde')),
  target_ingredient_id uuid,                       -- the canonical Brigade article that receives the invoices
  candidate       jsonb not null default '{}'::jsonb,
  recipe_id       uuid,                            -- draft where it was linked (collega)
  line_id         text,
  source          text,                            -- 'chef_app' | 'B-59 CD-xxx'
  decided_by      bigint,
  decided_at      timestamptz not null default now(),
  primary key (ingredient_id, candidate_key)
);
alter table mre.match_decisions enable row level security;
revoke all on mre.match_decisions from public, anon, authenticated;
grant select, insert, update, delete on mre.match_decisions to mre_app;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'mre' and tablename = 'match_decisions' and policyname = 'mre_app_all') then
    create policy mre_app_all on mre.match_decisions to mre_app using (true) with check (true);
  end if;
end $$;
