// MR-05 «regola semplice» (Chef Max 22/10/2026 21:31Z): spoken units → standard form; «se scrivo grammi, sono grammi»;
// «oz» stays a weight; weight ↔ volume without a density: 1 ml = 1 g, no block, listed only in the technical info.
// Usage: node tests/mr05/units.test.mjs <official_dump.json> <dir with mre_recipe answers (mr01/data/r)>
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const D = JSON.parse(fs.readFileSync(process.argv[2])), RDIR = process.argv[3]
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
for (const [u, w] of [['once', 'oz'], ['oncia', 'oz'], ['onza', 'oz'], ['libbre', 'lb'], ['chili', 'kg'], ['cucchiaio', 'tbsp'], ['cucchiaino', 'tsp'], ['tazza', 'cup'], ['cucharadas', 'tbsp'], ['Oncia fluida', 'fl_oz']])
  ok(E.standardUnit(u) === w, `«${u}» → ${w}`)
ok(E.standardUnit('oz') === 'oz' && E.dimOf('oz') === 'm', '«oz» resta peso (28,35 g), anche sul rum')
ok(E.standardUnit('g') === 'g' && E.standardUnit('ml') === 'ml' && E.standardUnit('nests') === 'nests', 'se scrivo grammi sono grammi: le unità scritte non cambiano')
let same = 0; for (const b of D.bom) if (E.standardUnit(b.unit) === b.unit || b.unit == null) same++
ok(same === D.bom.length, `righe ufficiali con l'unità invariata: ${same}/${D.bom.length} (Bourbon e Tiramisu compresi)`)
// 1 ml = 1 g without a density
const a = E.ingredientAmount(30, 'ml', { density: null }, {}), s = E.ingredientAmount(30, 'ml', { density: null }, {}, true)
ok(a.g === 30 && a.status === 'ok' && a.d1, '30 ml senza densità = 30 g, nessun blocco (segnato per le Info tecniche)')
ok(s.g === null && s.status === 'densita_mancante', 'lettura rigorosa (solo per il confronto con FC05): come prima')
const dn = E.ingredientAmount(100, 'ml', { density: { v: 0.92 } }, {})
ok(Math.abs(dn.g - 92) < 1e-9 && !dn.d1, 'con una densità vera vale quella (100 ml d\'olio = 92 g)')
// the Wheel Pasta rum: 30 ml on an article counted in grams, Chef's price 25 $ per 750 ml → it now gives a cost
const facts = { name: 'Rum', base_unit: 'g', price: null, density: null }
const leaf = { kind: 'ingredient', dim: 'v', g: 30, ml: 30, d1: true, status: 'ok', est: { usd: 25, qty: 750, unit: 'ml' } }
const c = E.leafCostEst(leaf, facts, {})
ok(c.status === 'stima_chef' && Math.abs(c.cost - 1) < 1e-9, 'rum 30 ml con prezzo di fiducia $25/750 ml = $1,00 (prima: «densità mancante»)')
const leafG = { kind: 'ingredient', dim: 'm', g: 30, ml: 30, d1: true, status: 'ok', est: { usd: 25, qty: 750, unit: 'ml' } }
ok(Math.abs(E.leafCostEst(leafG, facts, {}).cost - 1) < 1e-9, '«i 30 ml valgono 30 g»: la riga in grammi con prezzo a bottiglia dà lo stesso $1,00')
// every official recipe: what changes with the rule (strict = the reading of today)
const changed = [], d1 = []
for (const f of fs.readdirSync(RDIR)) { const d = JSON.parse(fs.readFileSync(`${RDIR}/${f}`)); if (!d.doc || d.source === 'lab') continue
  const id = f.replace('.json', ''), docs = Object.assign({}, d.docs, { [id]: d.doc }), ctx = { doc: x => docs[x], facts: x => d.facts[x], measures: d.measures }
  const n = E.cost(id, 1, ctx), o = E.cost(id, 1, Object.assign({}, ctx, { strictDensity: true }))
  if (Math.abs(n.food + n.pack - o.food - o.pack) > 1e-9 || n.missing !== o.missing) changed.push(`${d.doc.title}: $${(o.food + o.pack).toFixed(3)} (${o.missing} mancanti) → $${(n.food + n.pack).toFixed(3)} (${n.missing})`)
  if (n.d1_lines) d1.push(d.doc.title) }
fs.writeFileSync(process.env.OUT || 'mr05_changed.json', JSON.stringify({ changed, d1 }, null, 1))
console.log('  ricette il cui food cost cambia con 1 ml = 1 g: ' + changed.length); for (const x of changed) console.log('   · ' + x)
ok(changed.every(x => !/→ \$0\.000/.test(x)), 'nessun costo diventa zero')
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
