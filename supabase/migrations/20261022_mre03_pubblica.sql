-- MR-04 «Pubblica ricetta per ricetta» (Chef Max 22/10/2026: GO per costruirla in LABORATORIO; l'installazione è un GO a parte,
-- approvato a mano). NON ESEGUITO sul database vero finché lo Chef non lo approva.
--
-- Cosa aggiunge (solo nello schema mre, il laboratorio):
--   * mre.publications: per ogni pubblicazione la copia di sicurezza delle righe ufficiali PRIMA e DOPO, il piano scritto,
--     chi e quando; il ripristino si segna qui.
--   * mre.official_rows(id) / mre.official_fp(id): le righe ufficiali di UNA ricetta (solo le colonne che «Pubblica» legge e
--     scrive: Brigade 1 riscrive da solo food_cost_pct quando apre una ricetta, e questo non deve bloccare niente) e la loro impronta.
--   * mre.publish_write(...): UN passaggio, tutto o niente. Controlla l'impronta (nessuno ha cambiato la ricetta dopo l'anteprima),
--     salva la copia, scrive solo le colonne e le righe elencate, restituisce le righe rilette e FC05 dopo la scrittura.
--   * mre.publish_restore(...): rimette la ricetta com'era prima di quella pubblicazione, solo se dopo nessuno l'ha cambiata.
-- Le funzioni girano come proprietario (security definer) e le può chiamare solo il ruolo del laboratorio mre_app (cioè il server
-- dell'app, che le chiama solo per lo Chef). Nessun accesso per anon/authenticated. I bot e FC05 non cambiano: leggono le stesse tabelle.

begin;

create table mre.publications (
  id bigserial primary key,
  recipe_id uuid not null,
  draft_version int,
  at timestamptz not null default now(),
  by_user bigint,
  fp_before text not null,
  fp_after text,
  before jsonb not null,
  after jsonb,
  plan jsonb not null,
  checks jsonb,
  restored_at timestamptz,
  restored_by bigint
);
create index on mre.publications (recipe_id, at desc);
alter table mre.publications enable row level security;
revoke all on mre.publications from public, anon, authenticated;
grant select on mre.publications to mre_app;
grant update (checks) on mre.publications to mre_app;          -- the server writes the result of its checks after reading back
grant select, insert, update, delete on mre.publications to service_role;
grant usage, select on sequence mre.publications_id_seq to service_role;

-- the official rows of ONE recipe, only the columns «Pubblica» reads and writes
create or replace function mre.official_rows(p_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'r', (select jsonb_build_object('id', r.id, 'title', r.title, 'category', r.category, 'yield_text', r.yield_text, 'base_weight', r.base_weight,
            'weight_unit', r.weight_unit, 'base_servings', r.base_servings, 'base_weight_g', r.base_weight_g, 'serving_weight_g', r.serving_weight_g,
            'serving_qty', r.serving_qty, 'serving_unit', r.serving_unit, 'procedure', r.procedure, 'procedure_en', r.procedure_en,
            'procedure_es', r.procedure_es, 'ingredients', r.ingredients) from public.recipes r where r.id = p_id),
    'bom', coalesce((select jsonb_agg(to_jsonb(b) order by b.bom_id) from public.recipe_bom b where b.parent_recipe_id = p_id), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(to_jsonb(s) - 'created_at' order by s.step_number) from public.recipe_steps s where s.recipe_id = p_id), '[]'::jsonb))
$$;
create or replace function mre.official_fp(p_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$ select md5(mre.official_rows(p_id)::text) $$;

create or replace function mre.publish_write(p_id uuid, p_fp text, p_plan jsonb, p_user bigint, p_version int) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  ch jsonb := p_plan->'changes'; rc jsonb := coalesce(p_plan->'changes'->'recipe', '{}'::jsonb);
  k text; e jsonb; n int; nid int; ids jsonb := '{}'::jsonb; pub bigint; fc jsonb;
  allowed_r text[] := array['title','category','yield_text','base_weight','base_servings','base_weight_g','serving_weight_g','serving_qty','serving_unit','procedure','procedure_en','procedure_es','ingredients'];
  allowed_b text[] := array['component_type','item_id','sub_recipe_id','quantity','unit','notes','sort_order'];
begin
  perform 1 from public.recipes where id = p_id for update;
  if not found then raise exception 'mr04:ricetta_sconosciuta'; end if;
  if mre.official_fp(p_id) is distinct from p_fp then raise exception 'mr04:ricetta_cambiata'; end if;
  for k in select jsonb_object_keys(rc) loop if not k = any(allowed_r) then raise exception 'mr04:colonna_non_ammessa %', k; end if; end loop;

  insert into mre.publications (recipe_id, draft_version, by_user, fp_before, before, plan)
    values (p_id, p_version, p_user, p_fp, mre.official_rows(p_id), p_plan) returning id into pub;

  -- recipes: only the listed columns
  update public.recipes r set
    title = case when rc ? 'title' then rc->>'title' else r.title end,
    category = case when rc ? 'category' then rc->>'category' else r.category end,
    yield_text = case when rc ? 'yield_text' then rc->>'yield_text' else r.yield_text end,
    base_weight = case when rc ? 'base_weight' then (rc->>'base_weight')::numeric else r.base_weight end,
    base_servings = case when rc ? 'base_servings' then (rc->>'base_servings')::numeric::int else r.base_servings end,
    base_weight_g = case when rc ? 'base_weight_g' then (rc->>'base_weight_g')::numeric else r.base_weight_g end,
    serving_weight_g = case when rc ? 'serving_weight_g' then (rc->>'serving_weight_g')::numeric else r.serving_weight_g end,
    serving_qty = case when rc ? 'serving_qty' then (rc->>'serving_qty')::numeric else r.serving_qty end,
    serving_unit = case when rc ? 'serving_unit' then rc->>'serving_unit' else r.serving_unit end,
    procedure = case when rc ? 'procedure' then rc->>'procedure' else r.procedure end,
    procedure_en = case when rc ? 'procedure_en' then rc->>'procedure_en' else r.procedure_en end,
    procedure_es = case when rc ? 'procedure_es' then rc->>'procedure_es' else r.procedure_es end,
    ingredients = case when rc ? 'ingredients' then rc->'ingredients' else r.ingredients end
  where r.id = p_id;

  -- recipe_bom: delete / update / insert, every row must belong to this recipe
  for e in select * from jsonb_array_elements(coalesce(ch->'bom'->'delete', '[]'::jsonb)) loop
    delete from public.recipe_bom where bom_id = (e#>>'{}')::int and parent_recipe_id = p_id;
    get diagnostics n = row_count; if n <> 1 then raise exception 'mr04:riga_da_togliere_assente %', e; end if;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(ch->'bom'->'update', '[]'::jsonb)) loop
    for k in select jsonb_object_keys(e->'set') loop if not k = any(allowed_b) then raise exception 'mr04:colonna_non_ammessa %', k; end if; end loop;
    update public.recipe_bom b set
      component_type = case when e->'set' ? 'component_type' then e->'set'->>'component_type' else b.component_type end,
      item_id = case when e->'set' ? 'item_id' then (e->'set'->>'item_id')::uuid else b.item_id end,
      sub_recipe_id = case when e->'set' ? 'sub_recipe_id' then (e->'set'->>'sub_recipe_id')::uuid else b.sub_recipe_id end,
      quantity = case when e->'set' ? 'quantity' then (e->'set'->>'quantity')::numeric else b.quantity end,
      unit = case when e->'set' ? 'unit' then e->'set'->>'unit' else b.unit end,
      notes = case when e->'set' ? 'notes' then e->'set'->>'notes' else b.notes end,
      sort_order = case when e->'set' ? 'sort_order' then (e->'set'->>'sort_order')::int else b.sort_order end
    where b.bom_id = (e->>'bom_id')::int and b.parent_recipe_id = p_id;
    get diagnostics n = row_count; if n <> 1 then raise exception 'mr04:riga_da_cambiare_assente %', e->>'bom_id'; end if;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(ch->'bom'->'insert', '[]'::jsonb)) loop
    insert into public.recipe_bom (parent_recipe_id, component_type, item_id, sub_recipe_id, quantity, unit, notes, prep_task_id, sort_order)
      values (p_id, e->'row'->>'component_type', (e->'row'->>'item_id')::uuid, (e->'row'->>'sub_recipe_id')::uuid, (e->'row'->>'quantity')::numeric,
              e->'row'->>'unit', e->'row'->>'notes', null, (e->'row'->>'sort_order')::int)
      returning bom_id into nid;
    ids := ids || jsonb_build_object(e->>'line', nid);
  end loop;

  -- steps: replaced as a whole when the procedure changed (nothing references recipe_steps)
  if jsonb_typeof(ch->'steps') = 'object' then
    delete from public.recipe_steps where recipe_id = p_id;
    insert into public.recipe_steps (id, recipe_id, step_number, title, title_it, title_es, instruction_it, instruction_en, instruction_es, timer_seconds)
      select gen_random_uuid(), p_id, (s->>'step_number')::int, s->>'title', s->>'title_it', s->>'title_es', s->>'instruction_it', s->>'instruction_en', s->>'instruction_es', (s->>'timer_seconds')::int
      from jsonb_array_elements(ch->'steps'->'rows') s;
  end if;

  select to_jsonb(y) into fc from public.recipe_yield y where y.id = p_id;
  update mre.publications set after = mre.official_rows(p_id), fp_after = mre.official_fp(p_id) where id = pub;
  return jsonb_build_object('publication', pub, 'new_ids', ids, 'after', mre.official_rows(p_id), 'yield', fc, 'fp_after', mre.official_fp(p_id),
                            'fc05', food_cost.recipe_breakdown(p_id));
end $$;

-- FC05 «before», read in the same way for the preview
create or replace function mre.official_fc05(p_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$ select food_cost.recipe_breakdown(p_id) $$;

create or replace function mre.publish_restore(p_pub bigint, p_user bigint) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare p record; b jsonb; s jsonb; r jsonb; n int;
begin
  select * into p from mre.publications where id = p_pub for update;
  if not found then raise exception 'mr04:pubblicazione_sconosciuta'; end if;
  if p.restored_at is not null then raise exception 'mr04:gia_ripristinata'; end if;
  perform 1 from public.recipes where id = p.recipe_id for update;
  if mre.official_fp(p.recipe_id) is distinct from p.fp_after then raise exception 'mr04:cambiata_dopo_la_pubblicazione'; end if;
  r := p.before->'r';
  update public.recipes x set title = r->>'title', category = r->>'category', yield_text = r->>'yield_text', base_weight = (r->>'base_weight')::numeric,
    weight_unit = r->>'weight_unit', base_servings = (r->>'base_servings')::numeric::int, base_weight_g = (r->>'base_weight_g')::numeric,
    serving_weight_g = (r->>'serving_weight_g')::numeric, serving_qty = (r->>'serving_qty')::numeric, serving_unit = r->>'serving_unit',
    procedure = r->>'procedure', procedure_en = r->>'procedure_en', procedure_es = r->>'procedure_es', ingredients = r->'ingredients'
  where x.id = p.recipe_id;
  -- BOM: only the rows the publication touched (rows untouched keep their links, e.g. the Chef AI history)
  delete from public.recipe_bom where parent_recipe_id = p.recipe_id
    and bom_id not in (select (x->>'bom_id')::int from jsonb_array_elements(p.before->'bom') x);
  for b in select * from jsonb_array_elements(p.before->'bom') loop
    update public.recipe_bom x set component_type = b->>'component_type', item_id = (b->>'item_id')::uuid, sub_recipe_id = (b->>'sub_recipe_id')::uuid,
      quantity = (b->>'quantity')::numeric, unit = b->>'unit', notes = b->>'notes', prep_task_id = (b->>'prep_task_id')::bigint, sort_order = (b->>'sort_order')::int
    where x.bom_id = (b->>'bom_id')::int and x.parent_recipe_id = p.recipe_id;
    get diagnostics n = row_count;
    if n = 0 then
      insert into public.recipe_bom (bom_id, parent_recipe_id, component_type, item_id, sub_recipe_id, quantity, unit, notes, prep_task_id, sort_order)
        values ((b->>'bom_id')::int, p.recipe_id, b->>'component_type', (b->>'item_id')::uuid, (b->>'sub_recipe_id')::uuid, (b->>'quantity')::numeric,
                b->>'unit', b->>'notes', (b->>'prep_task_id')::bigint, (b->>'sort_order')::int);
    end if;
  end loop;
  if (p.plan->'changes'->'steps') is not null and jsonb_typeof(p.plan->'changes'->'steps') = 'object' then
    delete from public.recipe_steps where recipe_id = p.recipe_id;
    for s in select * from jsonb_array_elements(p.before->'steps') loop
      insert into public.recipe_steps (id, recipe_id, step_number, title, title_it, title_es, instruction_it, instruction_en, instruction_es, timer_seconds)
        values ((s->>'id')::uuid, p.recipe_id, (s->>'step_number')::int, s->>'title', s->>'title_it', s->>'title_es', s->>'instruction_it', s->>'instruction_en', s->>'instruction_es', (s->>'timer_seconds')::int);
    end loop;
  end if;
  if mre.official_fp(p.recipe_id) is distinct from p.fp_before then raise exception 'mr04:ripristino_non_identico'; end if;
  update mre.publications set restored_at = now(), restored_by = p_user where id = p_pub;
  return jsonb_build_object('ok', true, 'recipe', p.recipe_id, 'fp', p.fp_before);
end $$;

revoke all on function mre.official_rows(uuid), mre.official_fp(uuid), mre.official_fc05(uuid), mre.publish_write(uuid, text, jsonb, bigint, int), mre.publish_restore(bigint, bigint) from public, anon, authenticated;
grant execute on function mre.official_rows(uuid), mre.official_fp(uuid), mre.official_fc05(uuid), mre.publish_write(uuid, text, jsonb, bigint, int), mre.publish_restore(bigint, bigint) to mre_app;

commit;
