// MR-12: installation and undo of «Pubblica una ricetta nuova» on a throwaway Postgres (port 18495), on top of MR-04 as it is live:
// install → only the server can call it → the server now reads the publications (RETTIFICA MR-04) → undo → install again.
// Usage: node tests/mr12/migration_rollback.mjs
import EmbeddedPostgres from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/embedded-postgres/dist/index.js'
import pg from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/pg/lib/index.js'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), MG = f => fs.readFileSync(`${ROOT}/supabase/migrations/${f}`, 'utf8')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgmr12m_')), PORT = 18495
const P = new EmbeddedPostgres({ databaseDir: dir, port: PORT, user: 'postgres', password: 'prova', persistent: false, onLog: () => {} })
await P.initialise(); await P.start()
const a = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'prova', database: 'postgres' }); await a.connect()
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const fns = async () => (await a.query(`select count(*)::int n from pg_proc where pronamespace = 'mre'::regnamespace and proname in ('publish_create','publish_withdraw')`)).rows[0].n
const old = async () => (await a.query(`select count(*)::int n from pg_proc where pronamespace = 'mre'::regnamespace and proname in ('official_rows','official_fp','official_fc05','publish_write','publish_restore')`)).rows[0].n
const pols = async () => (await a.query(`select count(*)::int n from pg_policies where schemaname = 'mre' and tablename = 'publications'`)).rows[0].n
// what mre_app sees, as mre_app (the server's role)
const asApp = async q => { await a.query('set role mre_app'); try { return (await a.query(q)).rows } finally { await a.query('reset role') } }
try {
  await a.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; set check_function_bodies = off;
    create table public.recipes (id uuid primary key, title text unique not null, ingredients jsonb default '[]'); create table public.recipe_bom (bom_id int);
    create table public.recipe_steps (id uuid); create schema food_cost;`)
  await a.query(MG('20261015_mre01_master_recipe_engine_lab.sql')); await a.query(MG('20261021_mre02_match_decisions.sql'))
  await a.query(MG('20261022_mre03_pubblica.sql'))
  await a.query(`insert into mre.publications (recipe_id, fp_before, before, plan) values (gen_random_uuid(), 'x', '{}', '{}')`)
  ok((await asApp('select count(*)::int n from mre.publications'))[0].n === 0, 'PRIMA (com\'è online): il server non vede le pubblicazioni (difetto MR-04)')
  await a.query(MG('20261023_mr12_ricetta_nuova.sql'))
  ok(await fns() === 2 && await old() === 5, 'installazione: 2 funzioni nuove, le 5 di Pubblica intatte')
  ok((await asApp('select count(*)::int n from mre.publications'))[0].n === 1, 'DOPO: il server vede le pubblicazioni (elenco e Ripristina nell\'app)')
  await asApp(`update mre.publications set checks = '{"ok":true}'`)
  ok((await a.query(`select checks->>'ok' v from mre.publications`)).rows[0].v === 'true', 'il server salva i controlli dopo la scrittura')
  const e = await asApp(`update mre.publications set plan = '{}'`).then(() => null, x => x.message)
  ok(/permission denied/.test(e || ''), 'ma non può cambiare nient\'altro della copia di sicurezza (' + e + ')')
  const g = (await a.query(`select has_function_privilege('anon', 'mre.publish_create(uuid,text,jsonb,bigint,int)', 'execute') an,
    has_function_privilege('authenticated', 'mre.publish_withdraw(bigint,bigint)', 'execute') au, has_function_privilege('mre_app', 'mre.publish_create(uuid,text,jsonb,bigint,int)', 'execute') ma`)).rows[0]
  ok(!g.an && !g.au && g.ma, 'solo il server (mre_app) crea e ritira; anon/authenticated no')
  const nc = (await a.query(`select count(*)::int n from mre.publications where created`)).rows[0].n
  ok(nc === 0, 'le pubblicazioni di prima restano «non create»')
  await a.query(MG('20261023_mr12_ricetta_nuova_rollback.sql'))
  ok(await fns() === 0 && await old() === 5 && await pols() === 0, 'ritorno indietro: tolte le 2 funzioni e le 2 regole; Pubblica com\'era')
  ok((await a.query(`select count(*)::int n from mre.publications`)).rows[0].n === 1, 'le copie di sicurezza restano')
  await a.query(MG('20261023_mr12_ricetta_nuova.sql'))
  ok(await fns() === 2 && await pols() === 2, 'reinstallazione dopo il ritorno indietro: ok')
} finally { await a.end(); await P.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
