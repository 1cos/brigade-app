-- MR-05 «unità libere» (Chef Max 22/10/2026: GO per dizionario e lista dei liquidi; la LISTA si installa solo dopo l'approvazione).
-- NON ESEGUITO sul database vero senza il GO di installazione, approvato a mano.
-- Aggiunge, solo nel laboratorio (schema mre): la lista dei liquidi approvati dallo Chef e il campo «liquid» nei fatti degli
-- ingredienti, così sulle righe di liquidi «oz» si salva come «fl oz». Niente cambia nelle tabelle di Brigade.
begin;
create table if not exists mre.liquid_ingredients (
  ingredient_id uuid primary key,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  note text
);
alter table mre.liquid_ingredients enable row level security;
revoke all on mre.liquid_ingredients from public, anon, authenticated;
grant select on mre.liquid_ingredients to mre_app;
grant select, insert, update, delete on mre.liquid_ingredients to service_role;
CREATE OR REPLACE FUNCTION mre.ingredient_facts(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select coalesce(jsonb_object_agg(i.id, jsonb_build_object(
    'id', i.id, 'name', i.name, 'name_it', i.name_it, 'name_es', i.name_es,
    'category', i.category, 'base_unit', i.base_unit, 'active', i.active,
    'piece_g', (select case when c.valore is not null then jsonb_build_object('v', c.valore, 'stato', c.stato, 'fonte', c.fonte) end from food_cost.conv_for(i.id, 'peso_pezzo') c),
    'density', (select case when c.valore is not null then jsonb_build_object('v', c.valore, 'stato', c.stato, 'fonte', c.fonte) end from food_cost.conv_for(i.id, 'densita') c),
    'policy', (select p.policy from food_cost.ingredient_policy p where p.ingredient_id = i.id),
    'liquid', exists (select 1 from mre.liquid_ingredients l where l.ingredient_id = i.id),
    'price', (select to_jsonb(x) - 'conflicts' - 'candidate_id' || jsonb_build_object('conflicts', coalesce(array_length(x.conflicts, 1), 0))
              from food_cost.price_for(i.id, null) x limit 1)
  )), '{}'::jsonb)
  from public.ingredients i
  where i.id = any(p_ids)
$function$;
commit;
