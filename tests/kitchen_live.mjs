// B-25 module 2 — live check of 'completeness' / 'ingredients' / 'ingredient' on the real Brigade 2.0 API (read only ops).
// Usage: node tests/kitchen_live.mjs <chefTokenFile> <staffTokenFile> <snap2_clean.json taken just before>
import fs from 'node:fs'
import * as K from '../supabase/functions/_shared/kitchen_core.js'
const [tc, ts, SNAP] = process.argv.slice(2)
const API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim() }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
async function call(who, op, body = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + TOK[who] } : {}) }, body: JSON.stringify({ op, ...body }) })
  let j = null; try { j = await r.json() } catch (e) {}; return { status: r.status, j }
}
const D = JSON.parse(fs.readFileSync(SNAP))
let r = await call(null, 'ping'); ok(/^api-r1\.[6-9]/.test(r.j.build), `ping: ${r.j.build}`)
for (const op of ['ingredients', 'completeness']) { r = await call(null, op); ok(r.status === 401, `${op} senza sessione: 401`) }
r = await call(null, 'ingredient', { id: D.ingredients[0].id }); ok(r.status === 401, 'ingredient senza sessione: 401')
r = await call('staff', 'completeness'); ok(r.status === 403, `cuoco → completezza: ${r.status}`)
r = await call('chef', 'completeness'); const C = K.completeness(D.attention, D.recipes)
ok(r.status === 200 && JSON.stringify(r.j) === JSON.stringify(C), `Chef → completezza = lettura diretta (${r.j.total}: ${Object.entries(r.j.groups).map(([k, v]) => k + ' ' + v.length).join(', ')})`)
r = await call('chef', 'ingredients'); const LC = K.ingredientList(D.ingredients, D.vendors, true)
ok(JSON.stringify(r.j.ingredients) === JSON.stringify(LC), `Chef → elenco ingredienti = lettura diretta (${r.j.ingredients.length})`)
r = await call('staff', 'ingredients'); ok(r.j.ingredients.length === LC.length && r.j.ingredients.every(x => !('vendors' in x) && !('dno' in x)), 'cuoco → elenco senza fornitori')
const sample = D.ingredients.filter(i => D.vendors.some(v => v.ingredient_id === i.id)).slice(0, 15).concat(D.ingredients.slice(0, 5))
let same = 0, staffClean = 0
for (const i of sample) {
  const a = await call('chef', 'ingredient', { id: i.id }), b = await call('staff', 'ingredient', { id: i.id }), e = K.ingredientCard(i.id, D, true)
  if (a.status === 200 && JSON.stringify(a.j) === JSON.stringify(e)) same++; else console.log('   diff', i.name)
  const bj = b.j ? Object.assign({}, b.j, { can_price: undefined }) : {}
  if (b.status === 200 && !('vendors' in b.j) && !/price|\$/.test(JSON.stringify(bj)) && b.j.can_price === false) staffClean++
}
ok(same === sample.length, `Chef → schede ingrediente = lettura diretta: ${same}/${sample.length}`)
ok(staffClean === sample.length, `cuoco → schede senza fornitori né prezzi: ${staffClean}/${sample.length}`)
r = await call('chef', 'ingredient', { id: 'nope' }); ok(r.status === 400, `id non valido: ${r.status}`)
r = await call('chef', 'office'); ok(r.status === 200 && r.j.decisions.length > 0, 'Ufficio (modulo 1) ok')
r = await call('chef', 'mre_list'); ok(r.status === 200, 'Bibbia ricette ok')
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
