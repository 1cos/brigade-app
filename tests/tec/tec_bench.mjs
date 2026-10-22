// B-63 bench (T.E.C. in bozza), copia del banco STEP A: the REAL lab server module (brigade-app-api/mre.ts) against a throwaway local Postgres
// with the lab schema (same migration as production) and Brigade's official rows from a read-only snapshot served by a mock
// that only knows SELECT. Nothing touches Supabase. Port 18485 (not a forbidden port). Usage: node tests/stepA/bench.mjs <snap2_parsed.json>
import EmbeddedPostgres from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/embedded-postgres/dist/index.js'
import pg from '/Users/massimilianozubboli/brigade-audit-work/sec54/pgreal/node_modules/pg/lib/index.js'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'
const SNAP = process.argv[2], ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const S = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgtec_')), PORT = 18486
const P = new EmbeddedPostgres({ databaseDir: dir, port: PORT, user: 'postgres', password: 'prova', persistent: false, onLog: () => {} })
await P.initialise(); await P.start()
const a = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'prova', database: 'postgres' }); await a.connect()
let code = 1
try {
  await a.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; set check_function_bodies = off;`)
  await a.query(fs.readFileSync(`${ROOT}/supabase/migrations/20261015_mre01_master_recipe_engine_lab.sql`, 'utf8'))
  await a.query(fs.readFileSync(`${ROOT}/supabase/migrations/20261021_mre02_match_decisions.sql`, 'utf8'))      // R1.15
  // read-only helpers: same signatures, answers from the snapshot (production reads public.ingredients / FC05)
  await a.query(`create schema bench; create table bench.facts (id uuid primary key, f jsonb not null); create table bench.measures (m jsonb);
    create or replace function mre.ingredient_facts(p_ids uuid[]) returns jsonb language sql stable security definer as $$ select coalesce(jsonb_object_agg(id, f), '{}'::jsonb) from bench.facts where id = any(p_ids) $$;
    create or replace function mre.kitchen_measures() returns jsonb language sql stable security definer as $$ select m from bench.measures limit 1 $$;
    create or replace function mre.ingredient_search(p_q text) returns jsonb language sql stable security definer as $$ select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', f->>'name')), '[]'::jsonb) from bench.facts where f->>'name' ilike '%' || p_q || '%' $$;
    grant execute on function mre.ingredient_facts(uuid[]), mre.kitchen_measures(), mre.ingredient_search(text) to mre_app;`)
  const CWF = process.env.CW ? JSON.parse(fs.readFileSync(process.env.CW, 'utf8')) : {}
  for (const [id, f] of Object.entries(Object.assign({}, S.facts, CWF))) if (f) await a.query('insert into bench.facts values ($1, $2) on conflict do nothing', [id, f])
  await a.query('insert into bench.measures values ($1)', [S.measures])
  // lab content like production: one pilot with its 15/10 copy (Wheel Pasta) + the Chef's test example
  const WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', TEST = '00000000-b490-4000-8000-000000000001'
  await a.query(`insert into mre.recipes (id, pilot, current_version, source) values ($1, true, 1, '{"at":"2026-10-15"}'), ($2, false, 1, '{"note":"esempio"}')`, [WHEEL, TEST])
  await a.query(`update mre.recipes set is_test = true where id = $1`, [TEST])
  await a.query(`insert into mre.versions (recipe_id, version, state, doc, reason) values ($1, 1, 'importata', $2, 'copia 15/10'), ($3, 1, 'pubblicata', $4, 'esempio')`,
    [WHEEL, { schema: 1, id: WHEEL, title: 'Wheel Pasta (copia vecchia 15/10)', yield: { portions: 1 }, has_stock: false, lines: [], steps: [] }, TEST, { schema: 1, id: TEST, title: 'Esempio — Pan di Spagna (7 uova)', yield: { g: 820, portions: 12 }, has_stock: false, lines: [], steps: [] }])
  const r = spawnSync('deno', ['test', '-A', '--no-check', `${ROOT}/tests/tec/tec_api.test.ts`], { env: Object.assign({}, process.env, { MRE_TRANSLATE_STUB: '1', SUPABASE_DB_URL: `postgres://postgres:prova@127.0.0.1:${PORT}/postgres`, SNAP }), encoding: 'utf8' })
  process.stdout.write(r.stdout); process.stderr.write(r.stderr.split('\n').filter(l => !/^(Download|Check)/.test(l)).join('\n'))
  code = r.status
} finally { await a.end(); await P.stop(); fs.rmSync(dir, { recursive: true, force: true }); console.log('banco spento e cancellato (porta ' + PORT + ')') }
process.exit(code)
