// MR-04: the installation and its undo, on a throwaway Postgres (port 18494): install → undo → install again; undo keeps the
// publications table when it holds backups. Usage: node tests/mr04/migration_rollback.mjs
import EmbeddedPostgres from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/embedded-postgres/dist/index.js'
import pg from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/pg/lib/index.js'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), MG = f => fs.readFileSync(`${ROOT}/supabase/migrations/${f}`, 'utf8')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgmr04m_')), PORT = 18494
const P = new EmbeddedPostgres({ databaseDir: dir, port: PORT, user: 'postgres', password: 'prova', persistent: false, onLog: () => {} })
await P.initialise(); await P.start()
const a = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'prova', database: 'postgres' }); await a.connect()
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const fns = async () => (await a.query(`select count(*)::int n from pg_proc where pronamespace = 'mre'::regnamespace and proname in ('official_rows','official_fp','official_fc05','publish_write','publish_restore')`)).rows[0].n
const tbl = async () => (await a.query(`select to_regclass('mre.publications') is not null t`)).rows[0].t
try {
  await a.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; set check_function_bodies = off;
    create table public.recipes (id uuid primary key); create table public.recipe_bom (bom_id int); create table public.recipe_steps (id uuid); create schema food_cost;`)
  await a.query(MG('20261015_mre01_master_recipe_engine_lab.sql')); await a.query(MG('20261021_mre02_match_decisions.sql'))
  await a.query(MG('20261022_mre03_pubblica.sql'))
  ok(await fns() === 5 && await tbl(), 'installazione: 5 funzioni + tabella pubblicazioni')
  const g = (await a.query(`select has_function_privilege('anon', 'mre.publish_write(uuid,text,jsonb,bigint,int)', 'execute') an, has_function_privilege('authenticated', 'mre.publish_write(uuid,text,jsonb,bigint,int)', 'execute') au, has_function_privilege('mre_app', 'mre.publish_write(uuid,text,jsonb,bigint,int)', 'execute') ma`)).rows[0]
  ok(!g.an && !g.au && g.ma, 'solo il server (mre_app) può chiamare la scrittura; anon/authenticated no')
  await a.query(MG('20261022_mre03_pubblica_rollback.sql'))
  ok(await fns() === 0 && !(await tbl()), 'ritorno indietro: tutto tolto (tabella vuota)')
  await a.query(MG('20261022_mre03_pubblica.sql'))
  ok(await fns() === 5, 'reinstallazione dopo il ritorno indietro: ok')
  await a.query(`insert into mre.publications (recipe_id, fp_before, before, plan) values (gen_random_uuid(), 'x', '{}', '{}')`)
  await a.query(MG('20261022_mre03_pubblica_rollback.sql'))
  ok(await fns() === 0 && await tbl(), 'ritorno indietro con copie di sicurezza dentro: funzioni tolte, copie TENUTE')
  // MR-05 liquids: install over the production function, undo gives back EXACTLY the production function
  await a.query(MG('20261022_mre03_pubblica.sql'))
  await a.query(`create table if not exists public.ingredients (id uuid primary key, name text, name_it text, name_es text, category text, base_unit text, active boolean)`)
  await a.query(fs.readFileSync(path.join(ROOT, '..', 'data', 'live_ingredient_facts.sql'), 'utf8'))
  const def = async () => (await a.query(`select pg_get_functiondef('mre.ingredient_facts(uuid[])'::regprocedure) d`)).rows[0].d
  const D0 = await def()
  await a.query(MG('20261022_mre04_liquidi.sql'))
  ok(/liquid_ingredients/.test(await def()) && (await a.query(`select to_regclass('mre.liquid_ingredients') is not null t`)).rows[0].t, 'liquidi: tabella + campo «liquid» nei fatti')
  ok(!(await a.query(`select has_table_privilege('anon', 'mre.liquid_ingredients', 'select') x`)).rows[0].x, 'lista dei liquidi chiusa a anon')
  await a.query(MG('20261022_mre04_liquidi_rollback.sql'))
  ok((await def()) === D0 && !(await a.query(`select to_regclass('mre.liquid_ingredients') is not null t`)).rows[0].t, 'ritorno indietro: funzione IDENTICA a quella di produzione, lista tolta')
} finally { await a.end(); await P.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
