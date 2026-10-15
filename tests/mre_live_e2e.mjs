// Live end-to-end test of the MRE lab through the real Brigade 2.0 API (B-49).
// Writes ONLY to the technical example recipe (is_test) in schema mre. Reads the 20 pilots and compares costs with FC05.
// Usage: node tests/mre_live_e2e.mjs <chefTokenFile> <staffTokenFile> <fc_pilots.json>
import fs from 'node:fs'
const [tc, ts, fcPath] = process.argv.slice(2)
const API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim() }
const TEST = '00000000-b490-4000-8000-000000000001'
let pass = 0, fail = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
async function call(who, op, body = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://1cos.github.io', ...(who ? { Authorization: 'Bearer ' + TOK[who] } : {}) }, body: JSON.stringify({ op, ...body }) })
  let j = null; try { j = await r.json() } catch (e) {}
  return { status: r.status, j }
}
const uuid = () => crypto.randomUUID()

// 0) the existing Brigade 2.0 keeps working
let r = await call(null, 'ping'); ok(r.j && r.j.build === 'api-r1.3-mre', `ping: build ${r.j && r.j.build}`)
r = await call('chef', 'me'); ok(r.j && r.j.user && r.j.user.role === 'chef', 'me (Chef) ok')
r = await call('chef', 'recipes'); ok(r.j && r.j.recipes && r.j.recipes.length > 100, `recipes ok (${r.j && r.j.recipes && r.j.recipes.length})`)
r = await call('chef', 'shift'); ok(r.status === 200 && r.j.items, 'shift (Il mio turno) ok')
r = await call('chef', 'recipe', { id: '5c3cc880-baa9-48aa-b280-6de57001578f' }); ok(r.status === 200 && r.j.recipe, 'vecchia scheda ricetta ok')

// 1) list
r = await call('chef', 'mre_list'); const L = r.j
ok(L && L.recipes.filter(x => x.pilot).length === 20 && L.recipes.some(x => x.is_test), `mre_list: 20 pilota + esempio (motore ${L && L.engine})`)

// 2) every pilot opens; server cost = FC05
const fc = (x => Array.isArray(x) ? x : x.rows)(JSON.parse(fs.readFileSync(fcPath)))
let same = 0
for (const row of fc) {
  const bd = typeof row.bd === 'string' ? JSON.parse(row.bd) : row.bd
  const x = await call('chef', 'mre_recipe', { id: row.id })
  if (x.status !== 200) { ok(false, `apertura ${bd.title}: ${x.status} ${x.j && x.j.error}`); continue }
  const a = x.j.cost.food, b = bd.semaforo ? bd.semaforo.costo_noto : bd.totals.known
  if (Math.abs(a - b) <= Math.max(0.01, 0.005 * b)) same++; else console.log('   diff', bd.title, a, b)
}
ok(same === fc.length, `food cost dal server = FC05 su ${same}/${fc.length} ricette pilota`)

// 3) staff never receives prices or cost, cannot edit
r = await call('staff', 'mre_recipe', { id: TEST })
ok(r.status === 200 && !r.j.cost && Object.values(r.j.facts).every(f => !('price' in f)) && !('draft' in r.j), 'cuoco: nessun prezzo, nessun costo, nessuna bozza nella risposta')
r = await call('staff', 'mre_save_draft', { id: TEST, doc: {} }); ok(r.status === 403, `cuoco non può modificare (HTTP ${r.status})`)
r = await call('staff', 'mre_publish', { id: TEST }); ok(r.status === 403, `cuoco non può pubblicare (HTTP ${r.status})`)
r = await call('staff', 'mre_decide', { suggestion_id: uuid(), status: 'approvato' }); ok(r.status === 403, `cuoco non può approvare (HTTP ${r.status})`)
r = await call(null, 'mre_list'); ok(r.status === 401, `senza sessione: rifiutato (HTTP ${r.status})`)

// 4) Chef: draft → publish v(n+1) → restore → history
r = await call('chef', 'mre_recipe', { id: TEST }); const base = r.j.recipe.current_version, doc = JSON.parse(JSON.stringify(r.j.doc))
const costBefore = r.j.cost.food
doc.lines.find(l => l.id === 't4').qty = 160
r = await call('chef', 'mre_save_draft', { id: TEST, doc, base }); ok(r.status === 200 && r.j.cost.food > costBefore, `bozza salvata: food cost ${costBefore.toFixed(3)} → ${r.j && r.j.cost && r.j.cost.food.toFixed(3)}`)
r = await call('chef', 'mre_recipe', { id: TEST }); ok(r.j.draft && r.j.doc.lines.find(l => l.id === 't4').qty === 140, 'la bozza NON cambia la versione in uso (resta 140 g)')
r = await call('chef', 'mre_publish', { id: TEST, reason: 'Test automatico B-49: burro 160 g', base: base + 5 }); ok(r.status === 409, `pubblicazione su versione superata rifiutata (HTTP ${r.status})`)
r = await call('chef', 'mre_publish', { id: TEST, reason: 'Test automatico B-49: burro 160 g', base }); const v2 = r.j && r.j.version
ok(r.status === 200 && v2 === base + 1, `pubblicata v${v2}`)
r = await call('chef', 'mre_recipe', { id: TEST }); ok(r.j.doc.lines.find(l => l.id === 't4').qty === 160 && r.j.recipe.current_version === v2, 'versione in uso aggiornata: burro 160 g')
r = await call('chef', 'mre_restore', { id: TEST, version: base }); ok(r.status === 200 && r.j.version === v2 + 1, `ripristino v${base} come v${r.j && r.j.version}`)
r = await call('chef', 'mre_recipe', { id: TEST }); ok(r.j.doc.lines.find(l => l.id === 't4').qty === 140 && r.j.versions.length >= 3, `storico: ${r.j.versions.map(v => 'v' + v.version + ' ' + v.state).join(', ')}`)

// 5) production (plan vs real) — idempotent
const key = uuid()
const prod = { id: TEST, version: r.j.recipe.current_version, factor: 5 / 7, reference: 'uova 5 pz (test)', yield_planned_g: 585.7, yield_real_g: 560, changed: [{ line: 't4', name: 'Burro', planned: 100, real: 110, unit: 'g' }], note: 'test automatico', client_key: key }
r = await call('staff', 'mre_production', prod); ok(r.status === 200 && r.j.production, 'produzione registrata (cuoco)')
r = await call('staff', 'mre_production', prod); ok(r.status === 200 && r.j.repeated, 'stessa produzione inviata due volte = una sola riga')
r = await call('chef', 'mre_recipe', { id: TEST }); ok(r.j.productions.some(p => p.client_key === undefined || true) && r.j.productions[0].yield_real_g == 560 && r.j.doc.lines.find(l => l.id === 't4').qty === 140, 'produzione visibile allo Chef, ricetta ufficiale invariata')

// 6) suggestion → Chef approves → recipe unchanged
r = await call('staff', 'mre_suggest', { id: TEST, text: 'Test automatico: proverei 160 g di burro.', client_key: uuid() }); ok(r.status === 200 && r.j.suggestion, 'suggerimento inviato (cuoco)')
const sid = r.j.suggestion.id
r = await call('chef', 'mre_list'); ok(r.j.pending >= 1, `Chef: ${r.j.pending} suggerimenti in attesa (avviso)`)
r = await call('chef', 'mre_decide', { suggestion_id: sid, status: 'approvato' }); ok(r.status === 200, 'Chef approva')
r = await call('chef', 'mre_recipe', { id: TEST }); ok(r.j.suggestions.find(s => s.id === sid).status === 'approvato' && r.j.doc.lines.find(l => l.id === 't4').qty === 140, 'approvato, ma la ricetta NON cambia')

// 7) invalid data is refused, never stored
r = await call('chef', 'mre_save_draft', { id: TEST, doc: Object.assign({}, doc, { lines: [{ id: 'x', kind: 'ingredient', ref: '11111111-1111-4111-8111-111111111111', qty: 1, unit: 'g', role: 'produzione' }] }), base: r.j.recipe.current_version })
ok(r.status === 400 && /ingrediente_sconosciuto/.test(r.j.error), `ingrediente inesistente rifiutato (${r.j && r.j.error})`)
r = await call('chef', 'mre_discard', { id: TEST }); ok(r.status === 200, 'bozza annullata')
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
