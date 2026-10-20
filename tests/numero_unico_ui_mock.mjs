// B-49 one number (Chef 20/10): Butter Spinach + Wheel Pasta in the EXISTING Chef editor, from the official rows
// (read-only snapshot → shared converter, in memory). API answered by an in-memory mock: nothing is sent to Supabase.
// Usage: PORT=<static server port serving web/> node tests/numero_unico_ui_mock.mjs <snap_parsed.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../supabase/functions/_shared/mre_import.js'
const [SNAP, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const S = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
const byId = Object.fromEntries(S.recipes.map(r => [r.id, r])), Y = Object.fromEntries(S.yield.map(y => [y.id, y]))
const built = Object.fromEntries(S.recipes.map(r => [r.id, buildLabDoc({ id: r.id, r, rows: S.bom.filter(b => b.parent_recipe_id === r.id), stepRows: S.steps.filter(s => s.recipe_id === r.id),
  prepRows: S.prep.filter(p => p.recipe_id === r.id && !p.archived), y: Y[r.id], byId, importedAt: 'snapshot' })]))
const docs = Object.fromEntries(Object.entries(built).map(([k, v]) => [k, v.doc]))
const facts = S.facts, measures = S.measures
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d'
const LAB = {}; for (const id in docs) LAB[id] = { cur: 1, versions: [{ version: 1, state: 'importata', doc: docs[id], reason: 'Ricetta ufficiale di Brigade (lettura)', at: '2026-10-20T18:00:00Z' }], draft: null }
let role = 'chef', published = 0
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
const curDoc = id => Object.assign({}, LAB[id].versions.find(v => v.version === LAB[id].cur).doc, { id })
const tree = root => { const o = { [root.id]: root }; let fr = [root]; while (fr.length) { const nx = []; fr.forEach(x => (x.lines || []).filter(l => l.kind === 'recipe').forEach(l => { if (!o[l.ref] && LAB[l.ref]) { o[l.ref] = curDoc(l.ref); nx.push(o[l.ref]) } })); fr = nx } return o }
function api(op, b) {
  const u = user()
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-20', plan_date: '2026-10-20', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'recipes': return { recipes: [] }
    case 'mre_list': { const list = [SPIN, WHEEL].map(id => ({ id, pilot: true, is_test: false, current_version: LAB[id].cur, state: 'importata', title: curDoc(id).title, category: curDoc(id).category, diffs: built[id].diffs.length, draft: !!LAB[id].draft, pending: 0 })); return { recipes: list, pending: 0 } }
    case 'mre_recipe': { const L = LAB[b.id], root = curDoc(b.id), dd = tree(root), ctx = { doc: x => dd[x], facts: x => facts[x], measures }
      const f2 = {}; Object.keys(facts).forEach(k => { f2[k] = u.role === 'chef' ? facts[k] : (({ price, ...r }) => r)(facts[k]) })
      return { recipe: { id: b.id, current_version: L.cur }, doc: root, docs: dd, facts: f2, measures, versions: L.versions.slice().reverse().map(v => ({ version: v.version, state: v.state, reason: v.reason, by: 'Brigade', at: v.at })),
        productions: [], suggestions: [], draft: u.role === 'chef' && L.draft ? Object.assign({}, L.draft, { id: b.id }) : null, diffs: u.role === 'chef' ? built[b.id].diffs : undefined, diffs_checked: null, cost: u.role === 'chef' ? E.cost(b.id, 1, ctx) : undefined } }
    case 'mre_save_draft': LAB[b.id].draft = b.doc; return { ok: true }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': published++; return [403, 'demo_non_pubblica']
    case 'office': return [403, 'forbidden']
    case 'mre_ingredients': return { ingredients: [], recipes: [] }
  }
  return [400, 'bad_op']
}
const log = []
const ok = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const browser = await webkit.launch()
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(700)
  return pg
}
const txt = async (pg, sel) => (await pg.locator(sel).allInnerTexts()).join(' | ')
const open = async (pg, t) => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500); await pg.click(`text=${t}`); await pg.waitForTimeout(800) }

// ---- Butter Spinach, Chef
let pg = await page(390, 844)
await open(pg, 'BUTTER SPINACH')
await pg.screenshot({ path: `${OUT}/1_spinach_ricetta.png`, fullPage: true })
const ings = await txt(pg, '.mr-ings li')
ok(/1,81 kg|1814|4 lb/.test(ings) && /440 g/.test(ings) && /75 g/.test(ings), 'Butter Spinach: spinaci 4 lb (1,81 kg), burro 440 g, parmigiano 75 g')
await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(300)
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/2_spinach_scarichi.png` })
const st = await txt(pg, '.mr-panel')
ok(/1 porzione/.test(st), 'vendita 1 porzione: 1 porzione dalla prep, niente lotto intero')
ok(/1814,4 g/.test(st) && /440 g/.test(st), 'produzione 1 lotto: spinaci 1814,4 g e burro 440 g, una volta')
await pg.click('[data-m="p:cost"]'); await pg.waitForTimeout(300)
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/3_spinach_foodcost.png` })
ok(/\$17,02|\$17\.02/.test(await txt(pg, '.mr-panel')), 'food cost lotto $17,02 = FC05')
await pg.click('[data-m="edit"]'); await pg.waitForTimeout(300)
await pg.click('.mr-ings b.mq[data-mq="l:b1757"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('90'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1400)
await pg.locator('.mr-foot').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/4_spinach_anteprima_75_90.png` })
const ft = await txt(pg, '.mr-foot')
ok(/Prima di pubblicare/i.test(ft) && /Parmesan Grated/.test(ft) && /75 g → 90 g/.test(ft.replace(/\s+/g, ' ')), 'anteprima: 1 lotto prodotto, parmigiano 75 g → 90 g; vendita invariata')
ok(!/1 porzione venduta/i.test(ft), 'anteprima: la vendita non cambia')
await pg.click('[data-m="cancel"]'); await pg.waitForTimeout(400)
ok(LAB[SPIN].draft === null && published === 0, 'bozza scartata, niente pubblicato')
await pg.context().close()

// ---- Wheel Pasta, Chef
pg = await page(390, 844)
await open(pg, 'Wheel Pasta')
await pg.screenshot({ path: `${OUT}/5_wheel_ricetta.png`, fullPage: true })
const wi = await txt(pg, '.mr-ings li')
ok(/2 nidi/.test(wi) && /20 g/.test(wi) && /100 g/.test(wi) && /30 g/.test(wi), 'Wheel Pasta: 2 nidi, burro 20 g, Cheese Wheel 100 g, Rhum 30 g')
await pg.click('[data-m="p:cost"]'); await pg.waitForTimeout(300)
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/6_wheel_foodcost.png` })
const wc = await txt(pg, '.mr-panel')
ok(/\$0[.,]389/.test(wc) && /Cheese Wheel/.test(wc) && /Rhum/.test(wc), 'food cost noto $0,39; Cheese Wheel e Rhum senza prezzo')
await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(300)
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/7_wheel_struttura.png` })
await pg.click('[data-m="p:diffs"]'); await pg.waitForTimeout(300)
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/8_wheel_differenze.png` })
ok(/nessun ingrediente|non ha ingredienti/i.test(await txt(pg, '.mr-panel')), 'differenze: testo ingredienti vuoto')
await pg.click('[data-m="edit"]'); await pg.waitForTimeout(300)
await pg.screenshot({ path: `${OUT}/9_wheel_editor.png`, fullPage: true })
await pg.click('[data-m="cancel"]'); await pg.waitForTimeout(300)
await pg.context().close()

// ---- Wheel Pasta, staff
role = 'staff'
pg = await page(390, 844); await open(pg, 'Wheel Pasta')
ok(!(await pg.locator('[data-m="p:cost"]').count()) && !(await pg.locator('[data-m="edit"]').count()) && !/\$/.test(await pg.locator('#main').innerText()), 'cuoco: niente costi, niente modifica')
await pg.screenshot({ path: `${OUT}/10_wheel_cuoco.png`, fullPage: true })
await pg.context().close()

// ---- tablet
role = 'chef'
pg = await page(820, 1180); await open(pg, 'BUTTER SPINACH'); await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(300)
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/11_tablet_spinach.png` }); await pg.context().close()
await browser.close()
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'))
