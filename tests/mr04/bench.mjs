// MR-04 bench: the REAL server module (brigade-app-api/mre.ts) + the REAL lab migrations (mre01, mre02, mre03 «Pubblica») on a
// throwaway local Postgres (port 18493) holding a read-only copy of Brigade's official recipe tables (recipes, recipe_bom,
// recipe_steps, prep_tasks) and FC05's yield rule (food_cost.recipe_yield + unit_info, definitions read from production).
// FC05's full food cost (food_cost.recipe_breakdown) is a stub the test controls. Nothing touches Supabase.
// Usage: node tests/mr04/bench.mjs <official_dump.json> <bench_facts.json> <dir with fc_recipe_yield.sql, fc_unit_info.sql>
import EmbeddedPostgres from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/embedded-postgres/dist/index.js'
import pg from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/pg/lib/index.js'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'
const [DUMP, FACTS, DDIR] = process.argv.slice(2), ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const D = JSON.parse(fs.readFileSync(DUMP, 'utf8')), F = JSON.parse(fs.readFileSync(FACTS, 'utf8'))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgmr04_')), PORT = 18493
const P = new EmbeddedPostgres({ databaseDir: dir, port: PORT, user: 'postgres', password: 'prova', persistent: false, onLog: () => {} })
await P.initialise(); await P.start()
const a = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'prova', database: 'postgres' }); await a.connect()
let code = 1
try {
  await a.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; set check_function_bodies = off;`)
  // ---- official tables (same columns and constraints as production for what «Pubblica» touches)
  const rcols = Object.keys(D.recipes[0])
  const ty = { ingredients: 'jsonb', base_weight: 'numeric', base_servings: 'integer', selling_price: 'numeric', food_cost_pct: 'numeric', base_weight_g: 'numeric', serving_weight_g: 'numeric', serving_qty: 'numeric', prep_time_minutes: 'integer', prep_frequency_days: 'integer', shelf_life_days: 'integer', created_at: 'timestamptz', id: 'uuid' }
  await a.query(`create table public.recipes (${rcols.map(c => `"${c}" ${ty[c] || 'text'}`).join(', ')}, primary key (id), unique (title))`)
  await a.query(`create table public.ingredients (id uuid primary key, name text, active boolean default true, base_unit text);
    create table public.prep_tasks (id bigint primary key, name text, unit text, recipe_id uuid references public.recipes(id), prep_type text, stock_role text, archived boolean);
    create table public.recipe_bom (bom_id serial primary key, parent_recipe_id uuid references public.recipes(id) on delete cascade, component_type text check (component_type in ('ITEM','RECIPE')),
      item_id uuid references public.ingredients(id), sub_recipe_id uuid references public.recipes(id), quantity numeric, unit text, notes text, prep_task_id bigint references public.prep_tasks(id), sort_order integer,
      constraint check_component check ((component_type = 'ITEM' and item_id is not null and sub_recipe_id is null) or (component_type = 'RECIPE' and sub_recipe_id is not null and item_id is null)));
    create table public.recipe_steps (id uuid primary key, recipe_id uuid references public.recipes(id) on delete cascade, step_number integer, title text, instruction_en text, instruction_it text, instruction_es text, timer_seconds integer, created_at timestamptz default now(), title_it text, title_es text, unique (recipe_id, step_number));`)
  for (const r of D.recipes) await a.query(`insert into public.recipes (${rcols.map(c => `"${c}"`).join(',')}) values (${rcols.map((_, i) => '$' + (i + 1)).join(',')})`, rcols.map(c => c === 'ingredients' && r[c] != null ? JSON.stringify(r[c]) : r[c]))
  const ingIds = new Set([...D.bom.filter(b => b.item_id).map(b => b.item_id), ...Object.keys(F.facts)])
  for (const id of ingIds) { const f = F.facts[id] || {}, b = D.bom.find(x => x.item_id === id) || {}; await a.query('insert into public.ingredients values ($1,$2,$3,$4)', [id, f.name || b.ing_name || '?', f.active !== false, f.base_unit || b.ing_base || 'g']) }
  for (const p of D.preps) await a.query('insert into public.prep_tasks values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing', [p.id, p.name, p.unit, p.recipe_id, p.prep_type, p.stock_role, p.archived])
  for (const b of D.bom) await a.query('insert into public.recipe_bom (bom_id,parent_recipe_id,component_type,item_id,sub_recipe_id,quantity,unit,notes,prep_task_id,sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [b.bom_id, b.parent_recipe_id, b.component_type, b.item_id, b.sub_recipe_id, b.quantity, b.unit, b.notes, D.preps.some(p => p.id === b.prep_task_id) ? b.prep_task_id : null, b.sort_order])
  await a.query(`select setval('public.recipe_bom_bom_id_seq', (select max(bom_id) from public.recipe_bom))`)
  for (const s of D.steps) await a.query('insert into public.recipe_steps (id,recipe_id,step_number,title,instruction_en,instruction_it,instruction_es,timer_seconds,title_it,title_es) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [s.id, s.recipe_id, s.step_number, s.title, s.instruction_en, s.instruction_it, s.instruction_es, s.timer_seconds, s.title_it, s.title_es])
  // ---- FC05: the real yield rule; the full food cost is a stub controlled by the test (before / after this transaction's write)
  await a.query('create schema food_cost')
  await a.query(fs.readFileSync(path.join(DDIR, 'fc_unit_info.sql'), 'utf8'))
  await a.query(fs.readFileSync(path.join(DDIR, 'fc_recipe_yield.sql'), 'utf8'))
  await a.query(`create view public.recipe_yield as select r.id, r.title, (x.y->>'portions')::numeric as portions, x.y->>'portions_source' as portions_source, (x.y->>'yield_qty')::numeric as yield_qty,
      x.y->>'yield_dim' as yield_dim, x.y->>'yield_source' as yield_source, (x.y->>'text_portions')::numeric as text_portions, x.y->>'conflict' as conflict, (x.y->>'has_yield')::boolean as has_yield
      from public.recipes r cross join lateral (select food_cost.recipe_yield(r.*) as y) x;
    create schema bench; create table bench.fc05 (recipe_id uuid primary key, before numeric, after numeric);
    create or replace function food_cost.recipe_breakdown(p_id uuid) returns jsonb language sql stable as $$
      select jsonb_build_object('semaforo', jsonb_build_object('costo_noto',
        case when (select xmin::text from public.recipes where id = p_id) = (txid_current() % 4294967296)::text then f.after else f.before end))
      from (select * from bench.fc05 where recipe_id = p_id union all select p_id, null, null limit 1) f $$;`)
  // ---- the lab: the real migrations, with the read-only helpers answering from the facts snapshot (as in step A)
  for (const m of ['20261015_mre01_master_recipe_engine_lab.sql', '20261021_mre02_match_decisions.sql']) await a.query(fs.readFileSync(`${ROOT}/supabase/migrations/${m}`, 'utf8'))
  await a.query(`create table bench.facts (id uuid primary key, f jsonb not null); create table bench.measures (m jsonb);
    create or replace function mre.ingredient_facts(p_ids uuid[]) returns jsonb language sql stable security definer as $$
      select coalesce(jsonb_object_agg(f.id, f.f || jsonb_build_object('active', i.active)), '{}'::jsonb) from bench.facts f join public.ingredients i on i.id = f.id where f.id = any(p_ids) $$;
    create or replace function mre.kitchen_measures() returns jsonb language sql stable security definer as $$ select m from bench.measures limit 1 $$;
    create or replace function mre.ingredient_search(p_q text) returns jsonb language sql stable security definer as $$ select '[]'::jsonb $$;
    grant execute on function mre.ingredient_facts(uuid[]), mre.kitchen_measures(), mre.ingredient_search(text) to mre_app;`)
  for (const [id, f] of Object.entries(F.facts)) if (f) await a.query('insert into bench.facts values ($1, $2) on conflict do nothing', [id, f])
  await a.query('insert into bench.measures values ($1)', [F.measures || {}])
  await a.query(fs.readFileSync(`${ROOT}/supabase/migrations/20261022_mre03_pubblica.sql`, 'utf8'))
  await a.query(fs.readFileSync(`${ROOT}/supabase/migrations/20261022_c62_lettura_unica.sql`, 'utf8'))      // T.E.C. single read (C-62, live)
  await a.query(fs.readFileSync(`${ROOT}/supabase/migrations/20261022_mre04_liquidi.sql`, 'utf8'))         // MR-05 liquids (lab)
  // the real function reads Brigade's food_cost helpers: in the bench the facts come from the snapshot, with the REAL liquids list
  await a.query(`create or replace function mre.ingredient_facts(p_ids uuid[]) returns jsonb language sql stable security definer as $$
      select coalesce(jsonb_object_agg(f.id, f.f || jsonb_build_object('active', i.active, 'liquid', exists (select 1 from mre.liquid_ingredients l where l.ingredient_id = f.id))), '{}'::jsonb)
      from bench.facts f join public.ingredients i on i.id = f.id where f.id = any(p_ids) $$;`)
  const r = spawnSync('deno', ['test', '-A', '--no-check', `${ROOT}/tests/mr04/mr04_publish.test.ts`], { env: Object.assign({}, process.env, { SUPABASE_DB_URL: `postgres://postgres:prova@127.0.0.1:${PORT}/postgres`, DUMP }), encoding: 'utf8' })
  process.stdout.write(r.stdout); process.stderr.write(r.stderr.split('\n').filter(l => !/^(Download|Check)/.test(l)).join('\n'))
  code = r.status
} finally { await a.end(); await P.stop(); fs.rmSync(dir, { recursive: true, force: true }); console.log('banco spento e cancellato (porta ' + PORT + ')') }
process.exit(code)
