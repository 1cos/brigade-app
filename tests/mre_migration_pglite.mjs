// Offline test of MRE01 + import in PGlite (in-memory Postgres). No connection to the real database.
// Proves: migration applies; import writes only mre.*; role mre_app CANNOT write public tables; published versions are frozen.
import { PGlite } from '/Users/massimilianozubboli/brigade-audit-work/incident/testenv/node_modules/@electric-sql/pglite/dist/index.js'
import fs from 'node:fs'
const [mig, imp] = process.argv.slice(2)
const db = new PGlite()
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.ingredients (id uuid primary key, name text, name_it text, name_es text, category text, base_unit text, active boolean default true);
create table public.recipes (id uuid primary key, title text);
create schema food_cost;
create table food_cost.ingredient_policy (ingredient_id uuid, policy text);
create table food_cost.misure_cucina (unita text, grammi numeric, fonte text);
insert into food_cost.misure_cucina values ('pinch',0.5,'x');
create function food_cost.conv_for(p uuid, t text, out valore numeric, out stato text, out fonte text) language sql as $$ select 55::numeric, 'approvata', 'test' where t='peso_pezzo' $$;
create function food_cost.price_for(p uuid, s uuid) returns table(candidate_id uuid, vendor text, price_class text, basis_dim text, cost_per_base numeric, cost_per_each numeric, last_invoice_date date, invoice_number text, pack_description text, conflicts text[], warnings text[], cost_per_ml numeric)
  language sql as $$ select null::uuid,'V','A','mass',0.001,null::numeric,current_date,null,'1#',array[]::text[],array[]::text[],null::numeric $$;
insert into public.ingredients (id,name) values ('91f8d7f2-5594-4308-b9d7-68e04b276faf','Eggs');
insert into public.recipes values ('11111111-1111-4111-8111-111111111111','Official recipe');
`)
const migSql = fs.readFileSync(mig, 'utf8').replace('grant mre_app to postgres;', 'grant mre_app to current_user;')
await db.exec(migSql); ok(true, 'migrazione MRE01 applicata')
const before = (await db.query(`select md5(string_agg(t::text, ',' order by t::text)) h from (select * from public.ingredients union all select id,title,null,null,null,null,null from public.recipes) t`)).rows[0].h
await db.exec(fs.readFileSync(imp, 'utf8'))
const n = (await db.query('select count(*)::int n, count(*) filter (where pilot)::int p from mre.recipes')).rows[0]
ok(n.n === 59 && n.p === 20, `import: ${n.n} ricette (58 + 1 esempio tecnico), ${n.p} pilota`)
const v = (await db.query(`select count(*)::int n from mre.versions where state='importata'`)).rows[0].n; ok(v === 58, `versioni importate ${v}`)
const after = (await db.query(`select md5(string_agg(t::text, ',' order by t::text)) h from (select * from public.ingredients union all select id,title,null,null,null,null,null from public.recipes) t`)).rows[0].h
ok(before === after, 'tabelle di Brigade identiche prima e dopo')
for (const [what, q] of [['scrivere public.recipes', `update public.recipes set title='x'`], ['inserire public.ingredients', `insert into public.ingredients(id,name) values (gen_random_uuid(),'x')`], ['leggere public.recipes', `select * from public.recipes`], ['scrivere food_cost', `insert into food_cost.ingredient_policy values (gen_random_uuid(),'x')`]]) {
  let refused = false; try { await db.exec(`begin; set local role mre_app; ${q}; commit;`) } catch (e) { refused = /permission denied/.test(e.message); await db.exec('rollback') }
  ok(refused, `ruolo mre_app NON può ${what}`)
}
let frozen = false; try { await db.exec(`begin; set local role mre_app; update mre.versions set doc='{}' where version=1; commit;`) } catch (e) { frozen = /cannot be changed/.test(e.message); await db.exec('rollback') }
ok(frozen, 'versione importata non modificabile')
const fr = await db.exec(`begin; set local role mre_app; select mre.ingredient_facts(array['91f8d7f2-5594-4308-b9d7-68e04b276faf'::uuid]) f; commit;`)
const f = fr.find(r => r.rows && r.rows[0] && 'f' in r.rows[0]).rows[0].f
const egg = f['91f8d7f2-5594-4308-b9d7-68e04b276faf']
ok(egg && egg.name === 'Eggs' && egg.piece_g.v == 55 && egg.price.basis_dim === 'mass', 'facts letti dal ruolo mre_app attraverso la funzione in sola lettura')
const anon = await db.query(`select has_schema_privilege('anon','mre','usage') a, has_table_privilege('anon','mre.recipes','select') b`); ok(!anon.rows[0].a && !anon.rows[0].b, 'chiave pubblica (anon) senza accesso a mre')
