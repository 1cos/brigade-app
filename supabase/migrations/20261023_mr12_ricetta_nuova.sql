-- MR-12 «Pubblica una ricetta nuova» (Chef Max 23/10/2026 03:35Z: GO per costruirla in LABORATORIO; l'installazione è un GO a parte,
-- approvato a mano). Serve prima del passo 2 della B-70: dopo, la chiave pubblica non crea più ricette e lo Chef non deve mai restare
-- senza un modo per crearne una.
--
-- Cosa aggiunge (solo nello schema mre; le tabelle ufficiali non cambiano struttura):
--   * mre.publications.created: la pubblicazione ha CREATO la ricetta (prima non esisteva in Brigade).
--   * mre.publish_create(...): UN passaggio, tutto o niente. La ricetta deve essere una proposta del laboratorio (mai una ricetta già
--     in Brigade), l'id e il nome non devono esistere in Brigade. Crea la riga della ricetta col solo titolo e poi scrive distinta,
--     passi e resa con mre.publish_write (stessi controlli e stessa copia di sicurezza di «Pubblica»).
--   * mre.publish_withdraw(...): «Ritira» una ricetta creata così: solo se dopo nessuno l'ha cambiata e se in Brigade niente la usa
--     ancora (prep, vendite, scarichi, altre ricette, ... : ogni tabella che punta alle ricette, letta dal catalogo). Allora la cancella
--     con distinta, passi e traduzioni. Se è già usata: rifiutato, non si tocca niente.
-- Le funzioni girano come proprietario (security definer) e le può chiamare solo mre_app (il server, solo per lo Chef).
-- RITORNO INDIETRO: 20261023_mr12_ricetta_nuova_rollback.sql

begin;

alter table mre.publications add column if not exists created boolean not null default false;

-- RETTIFICA MR-04 (trovata il 23/10 in prova): mre.publications ha la protezione delle righe accesa e nessuna regola per mre_app, quindi il
-- server non vedeva le pubblicazioni (elenco sempre vuoto, «Ripristina» non raggiungibile dall'app) e non salvava i controlli. Due regole:
-- il server legge le pubblicazioni e scrive solo la colonna checks (il permesso di colonna resta quello di MR-04).
drop policy if exists mre_app_legge on mre.publications;
drop policy if exists mre_app_controlli on mre.publications;
create policy mre_app_legge on mre.publications for select to mre_app using (true);
create policy mre_app_controlli on mre.publications for update to mre_app using (true) with check (true);

create or replace function mre.publish_create(p_id uuid, p_title text, p_plan jsonb, p_user bigint, p_version int) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare t text := btrim(coalesce(p_title, '')); w jsonb;
begin
  if length(t) < 2 then raise exception 'mr12:titolo_mancante'; end if;
  perform 1 from mre.recipes where id = p_id and coalesce((source->>'lab_only')::boolean, false) and not is_test for update;
  if not found then raise exception 'mr12:non_e_una_proposta'; end if;
  if exists (select 1 from public.recipes where id = p_id) then raise exception 'mr12:esiste_gia'; end if;
  perform pg_advisory_xact_lock(hashtext('mr12:titolo:' || lower(t)));
  if exists (select 1 from public.recipes where lower(btrim(title)) = lower(t)) then raise exception 'mr12:titolo_esistente'; end if;
  insert into public.recipes (id, title) values (p_id, t);
  w := mre.publish_write(p_id, mre.official_fp(p_id), p_plan, p_user, p_version);
  update mre.publications set created = true where id = (w->>'publication')::bigint;
  return w || jsonb_build_object('created', true);
end $$;

create or replace function mre.publish_withdraw(p_pub bigint, p_user bigint) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare p record; fk record; used text[] := '{}'; hit boolean;
begin
  select * into p from mre.publications where id = p_pub for update;
  if not found then raise exception 'mr04:pubblicazione_sconosciuta'; end if;
  if not p.created then raise exception 'mr12:non_creata_da_pubblica'; end if;
  if p.restored_at is not null then raise exception 'mr04:gia_ripristinata'; end if;
  perform 1 from public.recipes where id = p.recipe_id for update;
  if not found then raise exception 'mr12:non_esiste_piu'; end if;
  if mre.official_fp(p.recipe_id) is distinct from p.fp_after then raise exception 'mr04:cambiata_dopo_la_pubblicazione'; end if;
  -- every table that points to the recipes, from the catalog (its own BOM, steps and translations go away with it)
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.recipes'::regclass and array_length(c.conkey, 1) = 1
      and not (c.conrelid = 'public.recipe_bom'::regclass and a.attname = 'parent_recipe_id')
      and c.conrelid is distinct from to_regclass('public.recipe_steps') and c.conrelid is distinct from to_regclass('public.recipe_translations')
  loop
    execute format('select exists (select 1 from %s where %I = $1)', fk.tbl, fk.col) into hit using p.recipe_id;
    if hit then used := used || (fk.tbl || '.' || fk.col); end if;
  end loop;
  if array_length(used, 1) > 0 then raise exception 'mr12:gia_usata %', array_to_string(used, ', '); end if;
  delete from public.recipes where id = p.recipe_id;            -- cascade: recipe_bom (parent), recipe_steps, recipe_translations
  if exists (select 1 from public.recipe_bom where parent_recipe_id = p.recipe_id) or exists (select 1 from public.recipe_steps where recipe_id = p.recipe_id)
    then raise exception 'mr12:ritiro_non_completo'; end if;
  update mre.publications set restored_at = now(), restored_by = p_user where id = p_pub;
  return jsonb_build_object('ok', true, 'recipe', p.recipe_id, 'withdrawn', true);
end $$;

revoke all on function mre.publish_create(uuid, text, jsonb, bigint, int), mre.publish_withdraw(bigint, bigint) from public, anon, authenticated;
grant execute on function mre.publish_create(uuid, text, jsonb, bigint, int), mre.publish_withdraw(bigint, bigint) to mre_app;

commit;
