// B-51 phase 1 — live check of 'knowledge' / 'knowledge_gaps' on the real Brigade 2.0 API (read-only ops),
// compared with the same engine run on read-only dumps taken just before (tests/knowledge_dump.mjs).
// Usage: node tests/knowledge_live.mjs <chefTokenFile> <staffTokenFile>
import fs from 'node:fs'
import { load, cardFor } from './knowledge_dump.mjs'
import { gaps } from '../supabase/functions/_shared/knowledge_core.js'
const [tc, ts] = process.argv.slice(2)
const API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim() }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
async function call(who, op, body = {}) {
  const t0 = Date.now()
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + TOK[who] } : {}) }, body: JSON.stringify({ op, ...body }) })
  let j = null; try { j = await r.json() } catch (e) {}; return { status: r.status, j, ms: Date.now() - t0 }
}
const strip = c => JSON.parse(JSON.stringify(c, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))
const A = load(), today = new Date().toISOString().slice(0, 10), by = n => A.ingredients.find(i => i.name === n)
let r = await call(null, 'ping'); ok(/^api-r1\.(8|9)/.test(r.j.build), `ping: ${r.j.build}`)
r = await call(null, 'knowledge', { id: by('Artichokes').id }); ok(r.status === 401, 'knowledge senza sessione: 401')
r = await call(null, 'knowledge_gaps'); ok(r.status === 401, 'knowledge_gaps senza sessione: 401')
r = await call('staff', 'knowledge_gaps'); ok(r.status === 403, `cuoco → Ingredients to complete: ${r.status}`)
r = await call('chef', 'knowledge', { id: 'not-a-uuid' }); ok(r.status === 400, `id non valido: ${r.status}`)
// same card as the engine on the dumps, Chef and staff (invoices: compare the 8 shown)
const names = ['Artichokes', 'Lobster Tail', 'Canned Tomatoes', 'Flour', 'Shrimp', 'Heavy Cream', 'Butter', 'Parsley', 'Burrata', 'Lemon', 'Eggs', 'Parmesan Cheese']
const times = []
for (const n of names) {
  const ing = by(n); if (!ing) { console.log('   (non trovato:', n + ')'); continue }
  for (const who of ['chef', 'staff']) {
    const g = await call(who, 'knowledge', { id: ing.id }); times.push(g.ms)
    const e = strip(cardFor(A, ing.id, who === 'chef', today)), got = strip(g.j)
    const same = g.status === 200 && JSON.stringify({ ...got, invoices: undefined }) === JSON.stringify({ ...e, invoices: undefined }) && JSON.stringify((got.invoices || []).slice(0, 8)) === JSON.stringify((e.invoices || []).slice(0, 8))
    if (!same && g.status === 200) { for (const k of Object.keys(e)) if (JSON.stringify(e[k]) !== JSON.stringify(got[k]) && k !== 'invoices') console.log('   diff', n, who, k, JSON.stringify(got[k]).slice(0, 200), '| atteso', JSON.stringify(e[k]).slice(0, 200)) }
    ok(same, `${n} · ${who === 'chef' ? 'Chef' : 'cuoco'}: dal vivo = motore sui dati appena letti (${g.ms} ms)`)
    if (who === 'staff') ok(!g.j.vendors && !g.j.vendors_k && !g.j.invoices && !g.j.price && !g.j.bought && !g.j.aliases && !/\$|unit_price|price_each/.test(JSON.stringify(g.j)), `${n} · cuoco: nessun fornitore, fattura o prezzo nella risposta`)
  }
}
const art = (await call('chef', 'knowledge', { id: by('Artichokes').id })).j, v = art.vendors_k[0]
ok(v.pack.s === 'verified' && v.pack_total.qty === 80 && v.pack_total.outer === 4 && v.pack_total.inner === 20 && v.sku === '23386', `Artichokes dal vivo: ${v.vendor} #${v.sku}, ${v.pack.v} (Verified)`)
ok(v.price_each.s === 'verified' && art.conversions.piece_g.s === 'estimated' && art.conversions.piece_g.v === 128 && art.price.per_g_status === 'estimated', `Artichokes: $${v.price_each.v} al pezzo Verified; 128 g Estimated (non approvato); prezzo/g Estimated`)
ok(art.theoretical.s === 'calculated' && art.bought.s === 'verified' && v.vendor === "Chef's Warehouse" && art.conversions.needed.piece === false, `Artichokes: usage ${art.theoretical.v} ${art.theoretical.unit} Calculated, purchase ${art.bought.v} ${art.bought.unit} Verified, vendor Chef's Warehouse, piece weight not asked`)
const t0 = Date.now(); r = await call('chef', 'knowledge_gaps'); const gms = Date.now() - t0
const G = gaps({ ingredients: A.ingredients, bom: A.bom, vendors: A.vendors, facts: A.facts, recipes: A.recipes, posFood: Object.entries(A.sales.filter(s => s.kind === 'item').reduce((m, s) => (m[s.name] = (m[s.name] || 0) + Number(s.qty), m), {})).map(([name, qty]) => ({ name, qty })) })
const cnt = L => Object.fromEntries(Object.entries(L).map(([k, l]) => [k, l.length]))
ok(r.status === 200 && JSON.stringify(cnt(r.j.lists)) === JSON.stringify(cnt(G.lists)) && r.j.pos_unmapped.length === G.pos_unmapped.length, `Chef → Ingredients to complete = motore (${Object.entries(cnt(r.j.lists)).map(([k, n]) => k + ' ' + n).join(', ')}; POS ${r.j.pos_unmapped.length}; ${gms} ms)`)
times.sort((a, b) => a - b)
console.log(`\nTEMPI server (scheda): mediana ${times[Math.floor(times.length / 2)]} ms, max ${times[times.length - 1]} ms · Ingredients to complete ${gms} ms`)
console.log(`RISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
