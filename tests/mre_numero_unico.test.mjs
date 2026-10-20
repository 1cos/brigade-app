// B-49 "one number" demonstration (Chef 20/10): Butter Spinach from the OFFICIAL Brigade rows (read-only snapshot),
// converted by the shared lab converter (no saved copy), then sale / production / cancellation / partial lot / food cost /
// preview — all from the same engine and the same version. Nothing is written anywhere.
// Run: SNAP=<snap_parsed.json> BOTS=<spinach_bots.json> node --test tests/mre_numero_unico.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as E from '../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../supabase/functions/_shared/mre_import.js'

const S = JSON.parse(fs.readFileSync(process.env.SNAP, 'utf8'))
const BOTS = process.env.BOTS ? JSON.parse(fs.readFileSync(process.env.BOTS, 'utf8')) : null
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r]))
const Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const build = id => buildLabDoc({ id, r: byId[id], rows: S.bom.filter(b => b.parent_recipe_id === id), stepRows: S.steps.filter(s => s.recipe_id === id),
  prepRows: S.prep.filter(p => p.recipe_id === id && !p.archived), y: Y[id], byId, importedAt: 'snapshot' }).doc
const docs = Object.fromEntries(S.recipes.map(r => [r.id, build(r.id)]))
const ctxOf = dd => ({ doc: id => dd[id], facts: id => S.facts[id], measures: S.measures })
const ctx = ctxOf(docs)

const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a'
const ING = n => Object.values(S.facts).find(f => f.name === n).id
const FRESH = ING('Fresh Spinach'), BUTTER = ING('Butter'), CUPS = ING('Alluminium Cups'), SALT = ING('Salt'), PEPPER = ING('White Pepper'), NUT = ING('Nutmeg')
const r3 = x => Math.round(x * 1000) / 1000
const tot = (list, k) => E.sumMovements(list)[k] || { g: 0, ml: 0, count: 0, portions: 0 }
const LB = 453.592
export const REPORT = []
const note = (t, o) => REPORT.push({ t, o })

test('1-3. una ricetta, una resa, ingredienti una volta (dati ufficiali, decisione CD-027)', () => {
  const d = docs[SPIN]
  assert.equal(d.yield.portions, 15); assert.equal(d.yield.g, 1200)
  const q = Object.fromEntries(d.lines.map(l => [l.id, [l.qty, l.unit]]))
  assert.deepEqual(q.b1752, [4, 'lb']); assert.deepEqual(q.b1753, [440, 'g']); assert.deepEqual(q.b1757, [75, 'g'])
  assert.equal(new Set(d.lines.map(l => l.ref)).size, d.lines.length, 'nessun ingrediente ripetuto')
  assert.equal(d.has_stock, true); assert.deepEqual(d.stock.map(s => s.prep_task_id), [318])
  note('ricetta', { porzioni: d.yield.portions, resa_g: d.yield.g, righe: d.lines.map(l => `${l.qty} ${l.unit} ${l.kind === 'recipe' ? byId[l.ref].title : S.facts[l.ref].name}`) })
})

test('4. vendita di 1 porzione: 1/15 del lotto, cioè 1 porzione dalla prep Spinach — mai il lotto, mai il parmigiano di nuovo', () => {
  const m = E.movements({ kind: 'vendita', recipe: SPIN, version: 1, portions: 1 }, ctx)
  assert.deepEqual(m.errors, [])
  assert.equal(r3(m.lots), r3(1 / 15))
  assert.equal(m.rows.length, 1)
  assert.equal(m.rows[0].target, 'prep'); assert.equal(m.rows[0].ref, SPIN)
  assert.equal(r3(m.rows[0].portions), -1); assert.equal(r3(m.rows[0].g), -80)
  note('vendita_1', m.rows.map(r => ({ cosa: r.target, porzioni: r3(r.portions), g: r3(r.g) })))
})

test('4b. stesso motore senza scorta: 1 porzione = 1/15 di OGNI riga (parmigiano 5 g, non 75 g)', () => {
  const dd = Object.assign({}, docs, { [SPIN]: Object.assign({}, docs[SPIN], { has_stock: false }) })
  const m = E.movements({ kind: 'vendita', recipe: SPIN, portions: 1 }, ctxOf(dd))
  const t = E.sumMovements([m])
  assert.equal(r3(t['prep:' + PARM].g), -5)
  assert.equal(r3(t['ingrediente:' + BUTTER].g), r3(-440 / 15))
  assert.equal(r3(t['ingrediente:' + FRESH].g), r3(-4 * LB / 15))
})

test('5. produzione di 1 lotto: spinaci, burro, parmigiano escono UNA volta; nascono 15 porzioni', () => {
  const m = E.movements({ kind: 'produzione', recipe: SPIN, version: 1, lots: 1 }, ctx)
  const t = E.sumMovements([m])
  assert.equal(r3(t['ingrediente:' + FRESH].g), r3(-4 * LB))   // 1814,368 g
  assert.equal(r3(t['ingrediente:' + BUTTER].g), -440)
  assert.equal(r3(t['prep:' + PARM].g), -75)                       // Parmesan Grated has its own prep (#439)
  assert.equal(r3(t['ingrediente:' + SALT].g), -10); assert.equal(r3(t['ingrediente:' + PEPPER].g), -3); assert.equal(r3(t['ingrediente:' + NUT].g), -1)
  assert.equal(r3(t['ingrediente:' + CUPS].count), -22)
  assert.equal(r3(t['prep:' + SPIN].portions), 15); assert.equal(r3(t['prep:' + SPIN].g), 1200)
  note('produzione_1_lotto', Object.values(t).map(o => ({ cosa: o.target === 'prep' ? byId[o.ref].title : S.facts[o.ref].name, g: r3(o.g), pz: r3(o.count), porzioni: r3(o.portions) })))
})

test('5b. 1 lotto prodotto + 15 porzioni vendute: ogni ingrediente contato una sola volta, prep Spinach torna a zero', () => {
  const list = [E.movements({ kind: 'produzione', recipe: SPIN, version: 1, lots: 1 }, ctx)]
  for (let i = 0; i < 15; i++) list.push(E.movements({ kind: 'vendita', recipe: SPIN, version: 1, portions: 1 }, ctx))
  assert.equal(r3(tot(list, 'prep:' + SPIN).portions), 0)
  assert.equal(r3(tot(list, 'prep:' + SPIN).g), 0)
  assert.equal(r3(tot(list, 'ingrediente:' + FRESH).g), r3(-4 * LB))
  assert.equal(r3(tot(list, 'ingrediente:' + BUTTER).g), -440)
  assert.equal(r3(tot(list, 'prep:' + PARM).g), -75)
})

test('8a. annullamento di una vendita: torna esattamente la porzione, nient\'altro', () => {
  const s = E.movements({ kind: 'vendita', recipe: SPIN, version: 1, portions: 2 }, ctx)
  const v = E.reverseMovements(s, 'void POS')
  const t = E.sumMovements([s, v])
  for (const o of Object.values(t)) for (const f of ['g', 'ml', 'count', 'portions']) assert.equal(r3(o[f]), 0)
  assert.equal(v.event.kind, 'annullamento'); assert.equal(v.version, 1)
})

test('8b. annullamento dopo una modifica della ricetta: si annulla la versione usata (v1), non quella nuova', () => {
  const p1 = E.movements({ kind: 'produzione', recipe: SPIN, version: 1, lots: 1 }, ctx)
  const v2 = Object.assign({}, docs[SPIN], { lines: docs[SPIN].lines.map(l => l.id === 'b1757' ? Object.assign({}, l, { qty: 90 }) : l) })
  const ctx2 = ctxOf(Object.assign({}, docs, { [SPIN]: v2 }))
  const p2 = E.movements({ kind: 'produzione', recipe: SPIN, version: 2, lots: 1 }, ctx2)
  assert.equal(r3(tot([p2], 'prep:' + PARM).g), -90)
  const undo1 = E.reverseMovements(p1, 'errore di registrazione')
  assert.equal(r3(tot([undo1], 'prep:' + PARM).g), 75, 'restituisce 75 g (v1), non 90')
  assert.equal(r3(tot([p1, undo1], 'ingrediente:' + FRESH).g), 0)
})

test('8c. lotto parziale: mezzo lotto = 7,5 porzioni, metà di ogni riga', () => {
  const m = E.movements({ kind: 'produzione', recipe: SPIN, version: 1, lots: 0.5 }, ctx)
  const t = E.sumMovements([m])
  assert.equal(r3(t['prep:' + SPIN].portions), 7.5)
  assert.equal(r3(t['ingrediente:' + FRESH].g), r3(-2 * LB)); assert.equal(r3(t['ingrediente:' + BUTTER].g), -220); assert.equal(r3(t['prep:' + PARM].g), -37.5)
  assert.equal(r3(t['ingrediente:' + CUPS].count), -11)
  const s = E.movements({ kind: 'vendita', recipe: SPIN, portions: 3 }, ctx)
  assert.equal(r3(E.sumMovements([s])['prep:' + SPIN].g), -240)
})

test('6. food cost dagli stessi ingredienti = food cost ufficiale FC05', () => {
  const c = E.cost(SPIN, 1, ctx), fc = S.fc[SPIN]
  assert.ok(Math.abs(c.food - fc.totals.known) < 0.005, `motore ${c.food} vs FC05 ${fc.totals.known}`)
  assert.equal(c.missing, 1, 'White Pepper senza prezzo: contato come mancante, mai zero')
  note('food_cost', { lotto: r3(c.food), porzione: r3(c.per_portion), mancanti: c.missing, fc05_noto: r3(fc.totals.known), fc05_stato: fc.status })
  // the same leaves: cost of 1 lot = sum of production movements priced (for ingredients) + the parmesan share
  const parmPerG = E.cost(PARM, 1, ctx).food / docs[PARM].yield.g
  const m = E.movements({ kind: 'produzione', recipe: SPIN, lots: 1 }, ctx)
  let fromMoves = 0
  for (const r of m.rows) {
    if (r.target === 'ingrediente') { const lc = E.leafCost({ dim: r.count != null ? 'c' : 'm', g: -r.g, count: r.count != null ? -r.count : null, ml: null, status: 'ok' }, S.facts[r.ref]); if (lc.cost != null) fromMoves += lc.cost }
    if (r.target === 'prep' && r.ref === PARM) fromMoves += -r.g * parmPerG
  }
  assert.ok(Math.abs(fromMoves - c.food) < 1e-6, 'costo = movimenti di produzione prezzati')
})

test('9. anteprima prima di pubblicare: parmigiano 75 → 90 g', () => {
  const v2 = Object.assign({}, docs[SPIN], { lines: docs[SPIN].lines.map(l => l.id === 'b1757' ? Object.assign({}, l, { qty: 90 }) : l) })
  const c = E.consequences(SPIN, ctx, ctxOf(Object.assign({}, docs, { [SPIN]: v2 })))
  assert.equal(c.sale.length, 0, 'la vendita resta 1 porzione dalla prep: nessun cambiamento')
  assert.equal(c.production.length, 1); assert.equal(c.production[0].key, 'prep:' + PARM)
  assert.equal(r3(c.production[0].before.g), -75); assert.equal(r3(c.production[0].after.g), -90)
  assert.ok(c.cost.portion_after > c.cost.portion_before)
  note('anteprima_75_90', { vendita: c.sale, produzione: c.production.map(x => ({ cosa: byId[x.ref] ? byId[x.ref].title : S.facts[x.ref].name, prima_g: r3(x.before.g), dopo_g: r3(x.after.g) })), costo_porzione: [r3(c.cost.portion_before), r3(c.cost.portion_after)] })
})

test('9b. anteprima di una resa cambiata (15 → 16 porzioni): cambia la porzione venduta, nient\'altro da toccare a mano', () => {
  const v2 = Object.assign({}, docs[SPIN], { yield: Object.assign({}, docs[SPIN].yield, { portions: 16 }) })
  const c = E.consequences(SPIN, ctx, ctxOf(Object.assign({}, docs, { [SPIN]: v2 })))
  assert.equal(c.sale.length, 1); assert.equal(r3(c.sale[0].after.g), -75)
  assert.equal(c.production.length, 1)   // the made lot now counts 16 portions
})

test('7. nessuna quantità indipendente: elenco delle copie scritte a mano che oggi esistono per gli spinaci', () => {
  if (!BOTS) return
  const rules = BOTS.other.filter(x => x.k === 'modrule')
  note('copie_a_mano', rules.map(r => ({ modifier: r.modifier_canonical, qty: r.qty_per_modifier, unit: r.unit, prep: r.linked_prep_task_id })))
  // with the engine the modifier is "1 portion of Butter Spinach": the number comes from the recipe yield
  const m = E.movements({ kind: 'vendita', recipe: SPIN, portions: 1 }, ctx)
  assert.equal(r3(-m.rows[0].g), r3(docs[SPIN].yield.g / docs[SPIN].yield.portions))
})

test('confronto con i bot di oggi (vendite reali 30/09 → 19/10)', () => {
  if (!BOTS) return
  const ded = BOTS.deductions_since_0930.filter(r => r.pos_item_name === 'Sauteed Spinach')
  const days = [...new Set(ded.map(r => r.business_date))]
  const sold = days.reduce((a, d) => a + Number((ded.find(r => r.business_date === d) || {}).p || 0), 0)
  const parmBots = ded.reduce((a, r) => a + (r.target_name === 'Parmesan Grated' ? Number(r.q) : 0), 0)
  const spinBots = ded.filter(r => /Fresh Spinach|Butter/.test(r.target_name)).length
  const prep318 = ded.filter(r => r.target_name === 'Spinach').length
  const engine = E.sumMovements(Array.from({ length: sold }, () => E.movements({ kind: 'vendita', recipe: SPIN, portions: 1 }, ctx)))
  const prod = BOTS.other.filter(x => x.k === 'preplog' && x.prep_task_id === 318).length
  note('confronto_bot', { piatti_venduti: sold, bot_parmigiano_g: parmBots, bot_righe_spinaci_burro: spinBots, bot_prep_spinach: prep318,
    motore_prep_spinach_porzioni: r3(-engine['prep:' + SPIN].portions), motore_parmigiano_alla_vendita_g: 0, produzioni_spinach_registrate: prod,
    motore_spinaci_burro_se_prodotto: { lotti: r3(sold / 15), spinaci_g: r3(sold / 15 * 4 * LB), burro_g: r3(sold / 15 * 440), parmigiano_g: r3(sold / 15 * 75) } })
  assert.ok(parmBots > 0 && sold > 0)
})

test.after(() => { if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(REPORT, null, 1)) })
