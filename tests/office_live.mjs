// B-25 module 1 — live check of the 'office' op on the real Brigade 2.0 API (read only: this op has no write path).
// Usage: node tests/office_live.mjs <chefTokenFile> <staffTokenFile> <anonKeyFile> <snap_clean.json taken just before>
import fs from 'node:fs'
import * as O from '../supabase/functions/_shared/office_core.js'
const [tc, ts, ak, SNAP] = process.argv.slice(2)
const API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim(), anon: fs.readFileSync(ak, 'utf8').trim(), fake: 'f'.repeat(64) }
let pass = 0, fail = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
async function call(who, op, body = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://1cos.github.io', ...(who ? { Authorization: 'Bearer ' + TOK[who] } : {}) }, body: JSON.stringify({ op, ...body }) })
  let j = null; try { j = await r.json() } catch (e) {}
  return { status: r.status, j }
}
let r = await call(null, 'ping'); ok(r.j && /^api-r1\.[4-9]/.test(r.j.build), `ping: build ${r.j && r.j.build}`)
r = await call(null, 'office'); ok(r.status === 401, `senza sessione: rifiutato (HTTP ${r.status})`)
r = await call('fake', 'office'); ok(r.status === 401, `token inventato: rifiutato (HTTP ${r.status})`)
r = await call('anon', 'office'); ok(r.status === 401, `chiave pubblica di Brigade: rifiutata (HTTP ${r.status})`)
r = await call('staff', 'office'); ok(r.status === 403 && !r.j.decisions, `cuoco: rifiutato, nessun dato (HTTP ${r.status})`)
const t0 = Date.now(); r = await call('chef', 'office'); const ms = Date.now() - t0
ok(r.status === 200 && Array.isArray(r.j.decisions), `Chef: risposta in ${ms} ms`)
const L = r.j
const s = JSON.stringify(L)
ok(!/"(price|unit_price|cost|amount|total|body|summary|pin)"\s*:/.test(s), 'Chef: la risposta non contiene prezzi, importi né testi grezzi dell\'Ufficio')
// same engine on a read-only dump taken just before: same picture
const D = JSON.parse(fs.readFileSync(SNAP))
const rids = new Set(D.attention.map(a => a.recipe_id).filter(Boolean)), titles = {}; D.recipes.forEach(x => { if (rids.has(x.id)) titles[x.id] = x.title })
const bomN = {}; D.bom.forEach(b => { bomN[b.parent_recipe_id] = b.n }); const yields = {}; D.yields.forEach(y => { yields[y.id] = y })
const E = O.triage({ attention: D.attention, office: D.office, invwarn: D.invwarn, docs: D.docs, titles, bomN, yields })
const pick = x => ({ dec: x.decisions.map(d => d.key + ':' + d.sev + ':' + d.cls), hist: x.history.length, stale: x.stale.length, comp: x.completeness.length, inv: [x.invoices.needs.length, x.invoices.queue.length, x.invoices.info.length, x.invoices.excluded, x.invoices.warnings, x.invoices.invoices] })
ok(JSON.stringify(pick(L)) === JSON.stringify(pick(E)), `stesso quadro della lettura diretta: ${L.decisions.length} decisioni (${L.decisions.filter(d => d.today).length} oggi), storico ${L.history.length}, fatture ${JSON.stringify(pick(L).inv)}, documenti ${L.invoices.docs.length}`)
// the rest of Brigade 2.0 keeps working
r = await call('chef', 'me'); ok(r.j && r.j.user && r.j.user.role === 'chef', 'me (Chef) ok')
r = await call('chef', 'recipes'); ok(r.j && r.j.recipes && r.j.recipes.length > 100, `ricette ok (${r.j && r.j.recipes && r.j.recipes.length})`)
r = await call('chef', 'shift'); ok(r.status === 200 && r.j.items, 'Il mio turno ok')
r = await call('chef', 'mre_list'); ok(r.status === 200 && r.j.recipes.filter(x => x.pilot).length === 20, 'Bibbia ricette B-49: 20 pilota ok')
r = await call('staff', 'shift'); ok(r.status === 200 && !r.j.reports, 'Il mio turno del cuoco ok')
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
