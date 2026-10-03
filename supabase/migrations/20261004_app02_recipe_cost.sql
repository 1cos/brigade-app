-- APP02 — recipe cost for the Brigade 2.0 server (Chef only, enforced in brigade-app-api).
-- Same engine as Brigade (food_cost.recipe_breakdown, the one fc_costo_ricetta uses): no second cost logic.
-- Callable only with the service role. Read-only (STABLE).
-- ROLLBACK: drop function if exists public.app_recipe_cost(uuid);
create or replace function public.app_recipe_cost(p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$ select food_cost.recipe_breakdown(p_recipe_id) $$;
revoke all on function public.app_recipe_cost(uuid) from public, anon, authenticated;
grant execute on function public.app_recipe_cost(uuid) to service_role;
