// MRE import (B-49): converts the pilot recipes from Brigade (read-only JSON dumps) into lab documents.
// Writes ONLY a SQL file of INSERTs into schema mre (never into public). Nothing is resolved automatically:
// text vs BOM differences are listed for the Chef (mre.recipes.diffs). Provisional base = the BOM (what food cost
// and deductions use today), and that choice is written in each diff.
// Usage: node tools/mre_import.mjs <dumpDir> <pilot_sets.json> <out.sql> <out_report.json>
import fs from 'node:fs'
import { buildLabDoc } from '../supabase/functions/_shared/mre_import.js'

const [dir, setsPath, outSql, outRep] = process.argv.slice(2)
const J = f => { const d = JSON.parse(fs.readFileSync(`${dir}/${f}.json`, 'utf8')); return Array.isArray(d) ? d : d.rows }
const sets = JSON.parse(fs.readFileSync(setsPath, 'utf8'))
const recipes = J('imp_recipes'), bom = J('imp_bom'), steps = J('imp_steps'), preps = J('imp_prep'), yields = J('imp_yield')
const byId = Object.fromEntries(recipes.map(r => [r.id, r]))
const Y = Object.fromEntries(yields.map(y => [y.id, y]))
const pilots = new Set(sets.pilots)

const docs = [], reps = []
for (const id of sets.closure) {
  const r = byId[id]; if (!r) { reps.push({ id, error: 'missing' }); continue }
  const out = buildLabDoc({ id, r, rows: bom.filter(b => b.parent_recipe_id === id), stepRows: steps.filter(s => s.recipe_id === id), prepRows: preps.filter(p => p.recipe_id === id), y: Y[id], byId, importedAt: process.env.MRE_IMPORTED_AT })
  const { doc, source, diffs } = out
  docs.push({ id, pilot: pilots.has(id), doc, source, diffs })
  reps.push(Object.assign({ id, title: r.title, pilot: pilots.has(id) }, out.report))
}

const q = s => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`
const j = o => `${q(JSON.stringify(o))}::jsonb`
let sql = `-- MRE import of ${docs.length} recipes (${docs.filter(d => d.pilot).length} pilots) — generated ${new Date().toISOString()}\n-- Writes ONLY to schema mre. Runs as role mre_app (no right on public).\nbegin;\nset local role mre_app;\n`
for (const d of docs) {
  sql += `insert into mre.recipes (id, pilot, current_version, source, diffs) values (${q(d.id)}, ${d.pilot}, 1, ${j(d.source)}, ${j(d.diffs)}) on conflict (id) do nothing;\n`
  sql += `insert into mre.versions (recipe_id, version, state, doc, reason, created_by) values (${q(d.id)}, 1, 'importata', ${j(d.doc)}, 'Importata da Brigade (distinta + procedimento) il 15/10/2026', null) on conflict do nothing;\n`
}
// Technical example (Chef's own numbers, 15/10): the only recipe that automatic tests write to. Not an official recipe.
const TEST_ID = '00000000-b490-4000-8000-000000000001'
const testDoc = { schema: 1, id: TEST_ID, title: 'Esempio — Pan di Spagna (7 uova)', category: 'Prova tecnica', yield: { g: 820, portions: 12, label: '1 teglia 30×40 (resa di esempio)' }, has_stock: false, stock: [],
  lines: [{ id: 't1', kind: 'ingredient', ref: '91f8d7f2-5594-4308-b9d7-68e04b276faf', qty: 7, unit: 'pz', role: 'produzione', note: null, group: null },
    { id: 't2', kind: 'ingredient', ref: 'fc253c60-03af-4210-b955-c94a9b2b5c23', qty: 210, unit: 'g', role: 'produzione', note: null, group: null },
    { id: 't3', kind: 'ingredient', ref: '043ef6c8-9367-4f75-9fd2-72c8dc735942', qty: 175, unit: 'g', role: 'produzione', note: null, group: null },
    { id: 't4', kind: 'ingredient', ref: 'fdf9aa4d-2bb0-4197-98ce-298fc7c1b52f', qty: 140, unit: 'g', role: 'produzione', note: 'fuso', group: null }],
  steps: [{ it: 'Monta {{t1}} uova con {{t2}} g di zucchero finché il composto scrive.', en: 'Whip {{t1}} eggs with {{t2}} g of sugar until the mixture ribbons.', es: 'Bate {{t1}} huevos con {{t2}} g de azúcar hasta que haga cinta.' },
    { it: 'Setaccia {{t3}} g di farina e incorporala a mano, dal basso verso l\u2019alto.', en: 'Sift {{t3}} g of flour and fold it in by hand.', es: 'Tamiza {{t3}} g de harina e incorpórala a mano.' },
    { it: 'Aggiungi {{t4}} g di burro fuso tiepido, a filo, senza smontare.', en: 'Add {{t4}} g of warm melted butter in a thin stream.', es: 'Añade {{t4}} g de mantequilla derretida tibia, en hilo.' },
    { it: 'Versa nella teglia imburrata e cuoci a 175 °C per 25 minuti.', en: 'Pour into the buttered pan and bake at 175 °C for 25 minutes.', es: 'Vierte en el molde y hornea a 175 °C durante 25 minutos.' }], notes: null }
sql += `insert into mre.recipes (id, pilot, is_test, current_version, source, diffs) values (${q(TEST_ID)}, false, true, 1, ${j({ note: 'Esempio tecnico con i numeri dello Chef (B-49). Non esiste in Brigade.' })}, '[]'::jsonb) on conflict (id) do nothing;\n`
sql += `insert into mre.versions (recipe_id, version, state, doc, reason) values (${q(TEST_ID)}, 1, 'pubblicata', ${j(testDoc)}, 'Esempio tecnico: 7 uova, 210 g zucchero, 175 g farina, 140 g burro (numeri dello Chef). Resa 820 g di esempio.') on conflict do nothing;\n`
docs.push({ id: TEST_ID, pilot: false, doc: testDoc, source: {}, diffs: [] })
sql += `insert into mre.audit (op, detail) values ('import', ${j({ recipes: docs.length, pilots: docs.filter(d => d.pilot).length })});\ncommit;\n`
fs.writeFileSync(outSql, sql)
fs.writeFileSync(outRep, JSON.stringify(reps, null, 1))
fs.writeFileSync(outSql.replace(/\.sql$/, '_docs.json'), JSON.stringify(docs.map(d => d.doc)))
console.log(`docs ${docs.length}, pilots ${docs.filter(d => d.pilot).length}, sql ${sql.length} bytes`)
