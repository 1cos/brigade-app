// CD-066 (Chef 20/10, approved principle): ONE source of truth, PREP and POS ITEM linked by ID.
// Part A — the official example (CD-067): PREP Spinach Cup (22 containers, no parmesan) + POS ITEM Butter Spinach / Sautéed Spinach
//          (1 Spinach Cup + parmesan 5 g at service). Built IN MEMORY from today's official rows: nothing saved, nothing written.
// Part B — the same model on Ragù, Arrabbiata, Gnocchi, Meatballs, Calamari (official rows, read-only snapshot).
// Run: SNAP=<snap2_parsed.json> [REPORT=<out.json>] node --test tests/mre_principio_cd066.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as E from '../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../supabase/functions/_shared/mre_import.js'

const S = JSON.parse(fs.readFileSync(process.env.SNAP, 'utf8'))
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const build = id => buildLabDoc({ id, r: byId[id], rows: S.bom.filter(b => b.parent_recipe_id === id), stepRows: S.steps.filter(s => s.recipe_id === id),
  prepRows: S.prep.filter(p => p.recipe_id === id && !p.archived), y: Y[id], byId, importedAt: 'snapshot' }).doc
const OFFICIAL = Object.fromEntries(S.recipes.map(r => [r.id, build(r.id)]))
const ctxOf = dd => ({ doc: id => dd[id], facts: id => S.facts[id], measures: S.measures })
const id = t => S.recipes.find(r => r.title === t).id
const ING = n => Object.values(S.facts).find(f => f.name === n).id
const r3 = x => Math.round(x * 1000) / 1000, LB = 453.592
const REPORT = {}

// ---------- Part A: CD-067 proposal in memory ----------
const SPIN = id('BUTTER SPINACH'), PARM = id('Parmesan Grated')
const POS = 'b0490000-0000-4000-8000-0000000000a1'          // demo id of the POS ITEM (not in Brigade)
const PREP = Object.assign({}, OFFICIAL[SPIN], { title: 'Spinach Cup', yield: Object.assign({}, OFFICIAL[SPIN].yield, { portions: 22 }),
  lines: OFFICIAL[SPIN].lines.filter(l => l.id !== 'b1757'), pos_names: [] })
const POSDOC = { schema: 1, id: POS, title: 'Butter Spinach / Sautéed Spinach', category: 'Contorni', yield: { g: null, portions: 1, label: '1 porzione' }, has_stock: false, stock: [],
  pos_names: ['Butter Spinach', 'Sauteed Spinach', 'Sautéed Spinach', 'Spinach'],
  lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 1, unit: 'portion', role: 'produzione', note: '1 Spinach Cup', group: null },
    { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto', note: 'Parmigiano al servizio — 5 g da verificare (CD-067)', group: null }], steps: [], notes: null }
const NEW = Object.assign({}, OFFICIAL, { [SPIN]: PREP, [POS]: POSDOC })
const ctxNew = ctxOf(NEW), ctxOld = ctxOf(OFFICIAL)
const FRESH = ING('Fresh Spinach'), BUTTER = ING('Butter'), CUPS = ING('Alluminium Cups'), PARMRAW = (() => { const l = OFFICIAL[PARM].lines.find(l => l.kind === 'ingredient'); return l.ref })()
const posOf = name => Object.values(NEW).filter(d => (d.pos_names || []).includes(name)).map(d => d.id)

test('A1. una PREP e un POS ITEM collegati per ID; due nomi commerciali = una sola distinta', () => {
  assert.ok(!PREP.lines.some(l => l.ref === PARM), 'nessun parmigiano nella prep')
  assert.equal(PREP.yield.portions, 22)
  assert.equal(r3(PREP.lines.find(l => l.ref === CUPS).qty), 22)
  assert.deepEqual(POSDOC.lines.map(l => [l.kind, l.ref, l.qty, l.unit, l.role]), [['recipe', SPIN, 1, 'portion', 'produzione'], ['recipe', PARM, 5, 'g', 'al_piatto']])
  assert.deepEqual(posOf('Butter Spinach'), [POS]); assert.deepEqual(posOf('Sautéed Spinach'), [POS])
  assert.deepEqual(E.validate(POSDOC, ctxNew, true), []); assert.deepEqual(E.validate(Object.assign({}, PREP, { id: SPIN }), ctxNew, true), [])
  assert.deepEqual(E.modelCheck(POS, ctxNew, { sold: true }), [], 'POS ITEM conforme al principio')
})

test('A2. food cost del piatto per espansione (regola 4), senza nessuna produzione registrata', () => {
  const c = E.cost(POS, 1, ctxNew), prep = E.cost(SPIN, 1, ctxNew), parm = E.cost(PARM, 1, ctxNew)
  const expect = prep.food / 22 + parm.food * 5 / OFFICIAL[PARM].yield.g
  assert.ok(Math.abs(c.food - expect) < 1e-9)
  REPORT.food_cost = { pos_porzione: r3(c.food), prep_lotto: r3(prep.food), prep_porzione: r3(prep.food / 22), parmigiano_5g: r3(parm.food * 5 / OFFICIAL[PARM].yield.g), mancanti: c.missing,
    oggi_porzione: r3(E.cost(SPIN, 1, ctxOld).per_portion) }
})

test('A3. vendita: 1 Spinach Cup dalla prep + parmigiano al servizio; nessuna materia prima della prep di nuovo (regole 8–9)', () => {
  const m = E.movements({ kind: 'vendita', recipe: POS, version: 1, portions: 1 }, ctxNew)
  const t = E.sumMovements([m])
  assert.deepEqual(m.errors, [])
  assert.equal(r3(t['prep:' + SPIN].portions), -1)
  assert.equal(r3(t['prep:' + PARM].g), -5)
  assert.equal(Object.keys(t).length, 2, 'niente spinaci o burro alla vendita: sono nella prep')
  REPORT.vendita_1 = Object.values(t).map(o => ({ cosa: NEW[o.ref].title, porzioni: r3(o.portions), g: r3(o.g) }))
})

test('A4. consumo teorico completo di 1 porzione venduta (regola 5)', () => {
  const th = E.theoretical(POS, 1, ctxNew), t = E.sumMovements([th])
  assert.equal(r3(t['ingrediente:' + FRESH].g), r3(-4 * LB / 22))
  assert.equal(r3(t['ingrediente:' + BUTTER].g), r3(-440 / 22))
  assert.equal(r3(t['ingrediente:' + CUPS].count), -1)
  assert.ok(t['ingrediente:' + PARMRAW].g < 0, 'parmigiano aperto fino alla materia prima')
  REPORT.teorico_1 = Object.values(t).map(o => ({ cosa: S.facts[o.ref].name, g: r3(o.g), pz: r3(o.count) }))
})

test('A5. 22 vendite senza produzione registrata: consumo teorico sì, giacenza inventata no (regole 5 e 7)', () => {
  const R = E.reconcile({ sales: [{ recipe: POS, portions: 22 }] }, ctxNew)
  const p = R.preps.find(x => x.prep === SPIN)
  assert.equal(r3(p.sold_portions), 22); assert.equal(r3(p.produced_portions), 0); assert.equal(r3(p.uncovered_portions), 22)
  assert.equal(p.stock_known, false); assert.equal(p.end_portions, null, 'senza conteggio la scorta resta sconosciuta')
  assert.equal(r3(R.uncovered_theoretical['ingrediente:' + FRESH].g), r3(-4 * LB)); assert.equal(r3(R.uncovered_theoretical['ingrediente:' + BUTTER].g), -440)
  assert.equal(Object.keys(R.registered).length, 0)
  REPORT.senza_produzione = { vendute: 22, prodotte: 0, non_coperte: 22, spinaci_teorici_g: r3(-R.uncovered_theoretical['ingrediente:' + FRESH].g), burro_teorico_g: r3(-R.uncovered_theoretical['ingrediente:' + BUTTER].g), scorta: 'sconosciuta (nessun conteggio)' }
})

test('A6. 22 vendite + 1 lotto registrato: materie prime una volta sola, dalla produzione (regola 6)', () => {
  const R = E.reconcile({ sales: [{ recipe: POS, portions: 22 }], productions: [{ recipe: SPIN, lots: 1, version: 1 }] }, ctxNew)
  const p = R.preps.find(x => x.prep === SPIN)
  assert.equal(r3(p.uncovered_portions), 0); assert.equal(r3(p.covered_portions), 22)
  assert.equal(r3(R.registered['ingrediente:' + FRESH].g), r3(-4 * LB)); assert.equal(r3(R.registered['ingrediente:' + BUTTER].g), -440)
  assert.equal(R.uncovered_theoretical['ingrediente:' + FRESH], undefined, 'nessun secondo scarico teorico')
  assert.equal(r3(R.theoretical['ingrediente:' + FRESH].g), r3(R.registered['ingrediente:' + FRESH].g), 'teorico = registrato')
})

test('A7. con un conteggio iniziale: coperto, scoperto e scorta finale; un conteggio incoerente resta visibile', () => {
  const R = E.reconcile({ sales: [{ recipe: POS, portions: 30 }], productions: [{ recipe: SPIN, lots: 1 }], counts: { [SPIN]: { portions: 5 } } }, ctxNew)
  const p = R.preps.find(x => x.prep === SPIN)
  assert.equal(r3(p.covered_portions), 27); assert.equal(r3(p.uncovered_portions), 3); assert.equal(r3(p.end_portions), -3)
  REPORT.con_conteggio = { iniziale: 5, prodotte: 22, vendute: 30, coperte: 27, non_coperte: 3, finale_calcolata: -3, nota: 'finale negativa = conteggio o produzione mancante: si segnala, non si corregge' }
})

test('A8. annullamento e lotto parziale con il nuovo modello', () => {
  const s = E.movements({ kind: 'vendita', recipe: POS, version: 1, portions: 2 }, ctxNew)
  for (const o of Object.values(E.sumMovements([s, E.reverseMovements(s)]))) for (const f of ['g', 'count', 'portions']) assert.equal(r3(o[f]), 0)
  const h = E.sumMovements([E.movements({ kind: 'produzione', recipe: SPIN, lots: 0.5 }, ctxNew)])
  assert.equal(r3(h['prep:' + SPIN].portions), 11); assert.equal(r3(h['ingrediente:' + CUPS].count), -11); assert.equal(r3(h['ingrediente:' + BUTTER].g), -220)
})

test('A9. anteprima nell\'editor: ricetta ufficiale di oggi → prep Spinach Cup (CD-067)', () => {
  const c = E.consequences(SPIN, ctxOld, ctxNew)
  const prod = Object.fromEntries(c.production.map(x => [x.key, x]))
  assert.equal(r3(prod['prep:' + PARM].before.g), -75); assert.equal(r3(prod['prep:' + PARM].after.g), 0)
  assert.equal(r3(prod['prep:' + SPIN].before.portions), 15); assert.equal(r3(prod['prep:' + SPIN].after.portions), 22)
  REPORT.anteprima_prep = { produzione: c.production.map(x => ({ cosa: NEW[x.ref] ? NEW[x.ref].title : S.facts[x.ref].name, prima: x.before, dopo: x.after })), vendita: c.sale.map(x => ({ cosa: NEW[x.ref] ? NEW[x.ref].title : S.facts[x.ref].name, prima: x.before, dopo: x.after })), costo: c.cost }
})

test('A10. modifier "Sautéed Spinach": 1 Spinach Cup per ID, nessuna quantità ricopiata', () => {
  const m = E.movements({ kind: 'vendita', recipe: SPIN, portions: 1 }, ctxNew)
  assert.equal(r3(m.rows[0].portions), -1); assert.equal(m.rows[0].ref, SPIN)
})

// ---------- Part B: same model on official recipes ----------
const DISHES = ['Spaghetti Al Ragu', 'Penne Midnight', 'Chicken Parmesan', 'Shrimp Gnocchi', 'Meatball Appetizer', 'Fried calamari']
test('B. Ragù, Arrabbiata, Gnocchi, Meatballs, Calamari: stesso motore sulle ricette ufficiali', () => {
  REPORT.famiglie = []
  for (const t of DISHES) {
    const d = id(t), ctx = ctxOld
    const c = E.cost(d, 1, ctx), fc = S.fc[d]
    assert.ok(Math.abs(c.food - fc.totals.known) < 0.01, `${t}: food cost motore ${c.food} = FC05 ${fc.totals.known}`)
    const sale = E.movements({ kind: 'vendita', recipe: d, portions: 1 }, ctx)
    const R = E.reconcile({ sales: [{ recipe: d, portions: 10 }] }, ctx)
    // invariant: theoretical = raw at sale + theoretical of the preps used (nothing counted twice, nothing lost)
    const sum = {}
    for (const src of [R.at_sale, R.uncovered_theoretical]) for (const o of Object.values(src)) if (o.target === 'ingrediente') { const k = o.ref; sum[k] = sum[k] || { g: 0, count: 0, ml: 0 }; for (const f of ['g', 'count', 'ml']) sum[k][f] += o[f] }
    for (const o of Object.values(R.theoretical)) for (const f of ['g', 'count', 'ml']) assert.ok(Math.abs((sum[o.ref] || {})[f] || 0) - Math.abs(o[f]) < 1e-6 && Math.abs(((sum[o.ref] || {})[f] || 0) - o[f]) < 1e-6, `${t}: ${S.facts[o.ref] && S.facts[o.ref].name} ${f}`)
    REPORT.famiglie.push({ piatto: t, food_cost_lotto: r3(c.food), fc05: r3(fc.totals.known), completo: c.complete, mancanti: c.missing,
      vendita_1: sale.rows.map(r => `${r.target === 'prep' ? (OFFICIAL[r.ref] || {}).title + ' (prep)' : (S.facts[r.ref] || {}).name} ${r.portions != null ? r3(-r.portions) + ' porz.' : r.g != null ? r3(-r.g) + ' g' : r.count != null ? r3(-r.count) + ' pz' : '?'}`),
      errori: sale.errors, struttura: E.modelCheck(d, ctx, { sold: true }).map(x => x.code + (x.ingredient ? ':' + (S.facts[x.ingredient] || {}).name : '') + (x.ref && !x.ingredient ? ':' + ((OFFICIAL[x.ref] || {}).title || x.ref) : '')) })
  }
})

test.after(() => { if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(REPORT, null, 1)) })
