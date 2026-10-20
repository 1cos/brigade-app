// CD-066 (Chef 20/10): PREP Spinach Cup + POS ITEM Butter Spinach / Sautéed Spinach in the EXISTING Chef editor, from the official rows
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
const SPIN = '9cec677b-55d6-4329-9dae-5dd4d489e147', WHEEL = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', PARM = '6357c9f1-f944-4153-8d7f-afb11336d91a', POS = 'b0490000-0000-4000-8000-0000000000a1'
docs[POS] = { schema: 1, id: POS, title: 'Butter Spinach / Sautéed Spinach', category: 'Contorni', yield: { g: null, portions: 1, label: '1 porzione' }, has_stock: false, stock: [],
  lines: [{ id: 'p1', kind: 'recipe', ref: SPIN, qty: 1, unit: 'portion', role: 'produzione', note: '1 Spinach Cup', group: null },
    { id: 'p2', kind: 'recipe', ref: PARM, qty: 5, unit: 'g', role: 'al_piatto', note: 'al servizio — 5 g da verificare (CD-067)', group: null }], steps: [], notes: null }
built[POS] = { diffs: [] }
const LAB = {}; for (const id in docs) LAB[id] = { cur: 1, versions: [{ version: 1, state: id === POS ? 'bozza' : 'importata', doc: docs[id], reason: id === POS ? 'Proposta CD-067 (solo prova)' : 'Ricetta ufficiale di Brigade (lettura)', at: '2026-10-20T18:00:00Z' }], draft: null }
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
    case 'mre_list': { const list = [POS, SPIN].map(id => ({ id, pilot: true, is_test: false, current_version: LAB[id].cur, state: 'importata', title: curDoc(id).title, category: curDoc(id).category, diffs: built[id].diffs.length, draft: !!LAB[id].draft, pending: 0 })); return { recipes: list, pending: 0 } }
    case 'mre_recipe': { const L = LAB[b.id], root = curDoc(b.id), dd = tree(root), ctx = { doc: x => dd[x], facts: x => facts[x], measures }
      const f2 = {}; Object.keys(facts).forEach(k => { f2[k] = u.role === 'chef' ? facts[k] : (({ price, ...r }) => r)(facts[k]) })
      return { recipe: { id: b.id, current_version: L.cur }, doc: root, docs: dd, facts: f2, measures, versions: L.versions.slice().reverse().map(v => ({ version: v.version, state: v.state, reason: v.reason, by: 'Brigade', at: v.at })),
        productions: [], suggestions: [], draft: u.role === 'chef' && L.draft ? Object.assign({}, L.draft, { id: b.id }) : null, diffs: u.role === 'chef' ? built[b.id].diffs : undefined, diffs_checked: null, cost: u.role === 'chef' ? E.cost(b.id, 1, ctx) : undefined } }
    case 'mre_save_draft': LAB[b.id].draft = b.doc; return { ok: true }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': { const L = LAB[b.id]; published++; const v = L.cur + 1; L.versions.push({ version: v, state: 'pubblicata', doc: L.draft, reason: 'solo memoria del test', at: new Date().toISOString() }); L.cur = v; L.draft = null; return { ok: true, version: v } }
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
const open = async (pg, t) => { await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500); await pg.click(`text="${t}"`); await pg.waitForTimeout(800) }
const shotAt = async (pg, sel, name) => { await pg.locator(sel).first().scrollIntoViewIfNeeded(); await pg.screenshot({ path: `${OUT}/${name}.png` }) }

// 1. PREP: official recipe → Spinach Cup (22 containers, no parmesan) — preview before publishing
let pg = await page(390, 844)
await open(pg, 'BUTTER SPINACH')
await pg.click('[data-m="edit"]'); await pg.waitForTimeout(300)
await pg.click('b.mq[data-mq="y:p"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('22'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500)
await pg.locator('[data-m="del:b1757"]').evaluate(e => e.click()); await pg.waitForTimeout(1400)
await shotAt(pg, '.mr-foot', 'c1_prep_anteprima')
const ft = (await txt(pg, '.mr-foot')).replace(/\s+/g, ' ')
ok(/1 lotto prodotto/i.test(ft) && /Parmesan Grated|Grated Parmesan/.test(ft) && /75 g → 0\b/.test(ft), 'anteprima prep: parmigiano 75 g → 0 nel lotto')
ok(/\+15 porzioni · \+1200 g → \+22 porzioni/.test(ft), 'anteprima prep: il lotto fa 22 porzioni invece di 15')
ok(/1 porzione venduta/i.test(ft) && /80 g → 1 porzione · 54,5 g/.test(ft), 'anteprima prep: 1 porzione = 54,5 g di lotto (resa 1200 g / 22)')
ok(/consumo teorico completo/i.test(ft), 'anteprima prep: consumo teorico completo mostrato')
await pg.locator('[data-m="publish"]').evaluate(e => e.click()); await pg.waitForTimeout(1500)
ok(LAB[SPIN].cur === 2 && published === 1, 'prep salvata come v2 SOLO nella memoria del test')
await pg.context().close()

// 2. POS ITEM: 1 Spinach Cup + parmesan at service
pg = await page(390, 844)
await open(pg, 'Butter Spinach / Sautéed Spinach')
await pg.screenshot({ path: `${OUT}/c2_pos_item.png`, fullPage: true })
const ings = await txt(pg, '.mr-ings li')
ok(/BUTTER SPINACH/.test(ings) && /1 porz/.test(ings) && /5 g/.test(ings), 'POS ITEM: 1 porzione della prep + parmigiano 5 g')
await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(300)
await shotAt(pg, '.mr-panel', 'c3_pos_scarichi')
const st = await txt(pg, '.mr-panel')
ok(/1 porzione/.test(st) && /Parmesan Grated|Grated Parmesan/.test(st), 'vendita: 1 Spinach Cup dalla prep + 5 g di parmigiano al servizio')
ok(/consumo teorico completo/i.test(st) && /82,5 g/.test(st) && /20 g/.test(st), 'teorico 1 porzione: spinaci 82,5 g, burro 20 g')
await pg.click('[data-m="p:cost"]'); await pg.waitForTimeout(300)
await shotAt(pg, '.mr-panel', 'c4_pos_foodcost')
ok(/\$0[.,]789/.test(await txt(pg, '.mr-panel')), 'food cost POS ITEM $0,789 a porzione (prep $0,74 + parmigiano $0,049; pepe bianco senza prezzo)')
await pg.click('.mr-ings a, .mr-ings .mr-nm >> text=BUTTER SPINACH').catch(() => {}); await pg.waitForTimeout(600)
await pg.screenshot({ path: `${OUT}/c5_tocco_sotto_ricetta.png`, fullPage: true })
await pg.context().close()

// 3. staff
role = 'staff'
pg = await page(390, 844); await open(pg, 'Butter Spinach / Sautéed Spinach')
ok(!(await pg.locator('[data-m="p:cost"]').count()) && !/\$/.test(await pg.locator('#main').innerText()), 'cuoco: niente costi')
await pg.screenshot({ path: `${OUT}/c6_cuoco.png`, fullPage: true })
await pg.context().close()
await browser.close()
fs.writeFileSync(`${OUT}/log_cd066.txt`, log.join('\n'))
