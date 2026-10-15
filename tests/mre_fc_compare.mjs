// Compares the MRE engine food cost with FC05 (food_cost.recipe_breakdown) on the 20 pilots. Read-only data.
import fs from 'node:fs'
import { cost } from '../supabase/functions/_shared/mre_engine.js'
const D = process.argv[2]
const rows = f => { const d = JSON.parse(fs.readFileSync(`${D}/${f}.json`)); return Array.isArray(d) ? d : d.rows }
const docs = JSON.parse(fs.readFileSync(`${D}/mre_import_docs.json`)), byId = Object.fromEntries(docs.map(d => [d.id, d]))
const fx = rows('facts')[0], facts = typeof fx.facts === 'string' ? JSON.parse(fx.facts) : fx.facts, measures = typeof fx.measures === 'string' ? JSON.parse(fx.measures) : fx.measures
const ctx = { doc: id => byId[id], facts: id => facts[id], measures }
const fc = Object.fromEntries(rows('fc_pilots').map(r => [r.id, typeof r.bd === 'string' ? JSON.parse(r.bd) : r.bd]))
let same = 0
for (const id of Object.keys(fc)) {
  const c = cost(id, 1, ctx), f = fc[id]
  const a = c.food, b = f.semaforo ? f.semaforo.costo_noto : f.totals.known
  const ok = Math.abs(a - b) <= Math.max(0.01, 0.005 * b)
  if (ok) same++
  console.log((ok ? 'SAME ' : 'DIFF ') + byId[id].title.slice(0, 26).padEnd(26), 'MRE', a.toFixed(3), 'mancano', c.missing, '| FC05', Number(b).toFixed(3), f.status, 'porz', f.portions && f.portions.n)
}
console.log(`identici ${same}/${Object.keys(fc).length}`)
