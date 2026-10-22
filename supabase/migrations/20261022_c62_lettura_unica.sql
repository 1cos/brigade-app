-- C-62 (CASA, Max GO laboratorio 22/10 17:44Z): le bozze di T.E.C. erano lente perché ogni operazione leggeva la ricetta ufficiale
-- con 12–23 richieste separate (una dopo l'altra) più 10–14 istruzioni SQL. Questa funzione dà TUTTO in UNA sola richiesta:
-- ricette dell'albero (radici + sottoricette fino a 8 livelli), righe della distinta con nome e unità dell'ingrediente, passi,
-- prep attive, rese, fatti degli ingredienti (mre.ingredient_facts) e misure da cucina (mre.kitchen_measures).
-- SOLA LETTURA (stable): le stesse righe che il server leggeva prima con la chiave di servizio. Nessuna tabella nuova.
-- RITORNO INDIETRO: 20261022_c62_lettura_unica_rollback.sql (il server torna da solo alla strada vecchia se la funzione non c'è).
create or replace function mre.official_bundle(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with recursive albero(id, livello) as (
    select r.id, 0 from public.recipes r where r.id = any(p_ids)
    union
    select b.sub_recipe_id, a.livello + 1 from albero a join public.recipe_bom b on b.parent_recipe_id = a.id
     where b.component_type = 'RECIPE' and b.sub_recipe_id is not null and a.livello < 7),
  ids as (select distinct a.id from albero a join public.recipes r on r.id = a.id),
  righe as (select b.*, i.name as ing_name, i.base_unit as ing_base from public.recipe_bom b left join public.ingredients i on i.id = b.item_id
             where b.parent_recipe_id in (select id from ids))
  select jsonb_build_object(
    'recipes', coalesce((select jsonb_agg(to_jsonb(r)) from public.recipes r where r.id in (select id from ids)), '[]'::jsonb),
    'bom',     coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order nulls last, x.bom_id) from righe x), '[]'::jsonb),
    'steps',   coalesce((select jsonb_agg(to_jsonb(s) order by s.step_number) from public.recipe_steps s where s.recipe_id in (select id from ids)), '[]'::jsonb),
    'preps',   coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'unit', p.unit, 'recipe_id', p.recipe_id, 'prep_type', p.prep_type,
                         'stock_role', p.stock_role, 'archived', p.archived)) from public.prep_tasks p where p.recipe_id in (select id from ids) and p.archived is not true), '[]'::jsonb),
    'yields',  coalesce((select jsonb_agg(to_jsonb(y)) from public.recipe_yield y where y.id in (select id from ids)), '[]'::jsonb),
    'facts',   mre.ingredient_facts(coalesce((select array_agg(distinct x.item_id) from righe x where x.item_id is not null), '{}'::uuid[])),
    'measures', mre.kitchen_measures())
$$;
revoke all on function mre.official_bundle(uuid[]) from public, anon, authenticated;
grant execute on function mre.official_bundle(uuid[]) to mre_app, service_role;
