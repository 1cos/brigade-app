-- MR-05 ritorno indietro: la funzione dei fatti torna IDENTICA a quella in produzione il 22/10/2026; la lista si toglie.
begin;
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
    'price', (select to_jsonb(x) - 'conflicts' - 'candidate_id' || jsonb_build_object('conflicts', coalesce(array_length(x.conflicts, 1), 0))
              from food_cost.price_for(i.id, null) x limit 1)
  )), '{}'::jsonb)
  from public.ingredients i
  where i.id = any(p_ids)
$function$;
drop table if exists mre.liquid_ingredients;
commit;
