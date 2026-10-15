// B-25 module 2 — parity test: Shell V020 (published code, commit 23f5616) vs Brigade 2.0 kitchen engine, on the SAME
// read-only dump of live Brigade data: recipe completeness, ingredients list, every ingredient card. Nothing is sent anywhere.
// Usage: node tests/kitchen_parity.mjs <v020 app.js> <snap2_clean.json> [out.json]
import fs from 'node:fs'
import vm from 'node:vm'
import * as K from '../supabase/functions/_shared/kitchen_core.js'
const [V020, SNAP, OUT] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(SNAP)), NOW = new Date(D.at).getTime()
let pass = 0, fail = 0; const notes = []
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const src = fs.readFileSync(V020, 'utf8')
const part = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker ' + a); return src.slice(i, j) }
const store = { recipes: D.recipes, attention: D.attention, ingredients: D.ingredients, vendors: D.vendors, bom: D.bom, prep: D.prep }
const code = 'const BRIGADE_URL = "x";\n' + part('const $ = id', '/* data gate') + part('const roNote', '\n', 0) + '\n'
  + part('/* ATTENTION01 — recipe completeness', "SCREENS['r-sales']") + part('SCREENS.ing = ', '/* ============ PREP (tab)')
  + '\n;({ SCREENS, completenessRows })'
const ctx = { BD: { peek: n => store[n], store: {}, today: () => '2026-10-15' }, SCREENS: {}, searchBind: () => {}, need: () => true, backBtn: () => '', head: (a, b, c) => `<head>${a}|${b}|${c}</head>`,
  Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(NOW) } static now() { return NOW } }, Intl, Math, String, Object, Array, Set, JSON, parseFloat, isFinite, RegExp, Number, document: {} }
const V = vm.runInNewContext(code, ctx)
const ids = (html, attr) => [...String(html).matchAll(new RegExp(attr + '="([^"]+)"', 'g'))].map(m => m[1])

/* 1. completeness */
const C = K.completeness(D.attention, D.recipes)
const vC = V.SCREENS['r-complete'].render({ m_deferred: 1, m_photo: 1, m_procedure: 1, m_portions: 1 })
const vSecs = {}; for (const m of vC.matchAll(/<h2>([^<]+)<\/h2><span>(\d+)<\/span>/g)) vSecs[m[1]] = +m[2]
const nIds = ['deferred', 'photo', 'procedure', 'portions'].flatMap(k => C.groups[k].map(x => x.id))
ok(JSON.stringify(ids(vC, 'data-r')) === JSON.stringify(nIds), `completezza: stesse ricette nello stesso ordine (${nIds.length}); V020 ${JSON.stringify(vSecs)} · Brigade 2.0 ${JSON.stringify(Object.fromEntries(Object.entries(C.groups).map(([k, v]) => [k, v.length])))}`)
ok(V.completenessRows().length === C.total, `totale completezza ${C.total}`)
/* 2. ingredients list (Chef) */
const vL = V.SCREENS['r-ing'].render({ all: 1 }), L = K.ingredientList(D.ingredients, D.vendors, true)
ok(JSON.stringify(ids(vL, 'data-id')) === JSON.stringify(L.map(x => x.id)), `elenco ingredienti: stessi ${L.length}, stesso ordine`)
const vRows = vL.split('data-a="openIng"').slice(1)
let lv = 0; vRows.forEach((h, i) => { const n = L[i], m = h.match(/(\d+) vendors?|no vendor/), vn = m ? (m[1] ? +m[1] : 0) : -1, dno = /Do not order/.test(h.split('</button>')[0]); if (vn === n.vendors && dno === n.dno) lv++; else notes.push({ ing: n.name, v020: [vn, dno], app: [n.vendors, n.dno] }) })
ok(lv === L.length, `numero fornitori e "non ordinare" uguali: ${lv}/${L.length}`)
const S = K.ingredientList(D.ingredients, D.vendors, false)
ok(S.every(x => !('vendors' in x) && !('dno' in x)), 'cuoco: l\'elenco non contiene fornitori')
/* 3. every ingredient card */
let same = 0, usedTot = 0, vendTot = 0, staffClean = 0
for (const i of D.ingredients) {
  const vh = V.SCREENS.ing.render({ id: i.id }), c = K.ingredientCard(i.id, D, true), s = K.ingredientCard(i.id, D, false)
  const vUsed = ids(vh, 'data-r'), vPrep = ids(vh, 'data-id').map(Number)
  const vPrices = [...vh.matchAll(/<span class="qty num" style="font-size:20px">([^<]*)<\/span>/g)].map(m => m[1])
  const money = v => v == null ? '' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const eq = JSON.stringify(vUsed) === JSON.stringify(c.used_in.map(x => x.id)) && JSON.stringify(vPrep) === JSON.stringify(c.preps.map(x => x.id)) && JSON.stringify(vPrices.slice().sort()) === JSON.stringify(c.vendors.map(v => money(v.unit_price)).sort())   // same vendors; V020 shows them in database order, Brigade 2.0 by name
  if (eq) same++; else notes.push({ card: i.name, v020: { vUsed: vUsed.length, vPrep, vPrices }, app: { used: c.used_in.length, preps: c.preps.map(x => x.id), prices: c.vendors.map(v => money(v.unit_price)) } })
  usedTot += c.used_in.length; vendTot += c.vendors.length
  if (!('vendors' in s) && !/price|cost/i.test(JSON.stringify(Object.keys(s.ingredient)))) staffClean++
}
ok(same === D.ingredients.length, `schede ingrediente identiche (usato in, prep, fornitori e prezzi): ${same}/${D.ingredients.length} (${usedTot} collegamenti a ricette, ${vendTot} fornitori)`)
ok(staffClean === D.ingredients.length, `cuoco: nessuna scheda contiene fornitori o prezzi (${staffClean}/${D.ingredients.length})`)
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ pass, fail, completeness: Object.fromEntries(Object.entries(C.groups).map(([k, v]) => [k, v.length])), ingredients: L.length, used_links: usedTot, vendors: vendTot, diffs: notes }, null, 2))
if (notes.length) console.log('differenze:', JSON.stringify(notes.slice(0, 5), null, 1))
process.exitCode = fail ? 1 : 0
