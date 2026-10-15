// UI test of the MRE screen in a headless browser, with the API answered by an in-memory mock built from the
// real imported docs + facts (read-only dumps). Nothing is sent to Supabase. Screenshots for phone / tablet / desktop.
// Usage: node tests/mre_ui_mock.mjs <dataDir> <outDir>
import { chromium } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../supabase/functions/_shared/mre_engine.js'
const [D, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const rows = f => { const d = JSON.parse(fs.readFileSync(`${D}/${f}.json`)); return Array.isArray(d) ? d : d.rows }
const docs = JSON.parse(fs.readFileSync(`${D}/mre_import_docs.json`)), byId = Object.fromEntries(docs.map(d => [d.id, d]))
const fx = rows('facts')[0], facts = typeof fx.facts === 'string' ? JSON.parse(fx.facts) : fx.facts, measures = typeof fx.measures === 'string' ? JSON.parse(fx.measures) : fx.measures
const sets = JSON.parse(fs.readFileSync(`${D}/pilot_sets.json`)), pil = new Set(sets.pilots)
const rep = Object.fromEntries(JSON.parse(fs.readFileSync(`${D}/mre_import_report.json`)).map(r => [r.id, r]))
// in-memory lab
const LAB = {}
for (const d of docs) LAB[d.id] = { cur: 1, versions: [{ version: 1, state: d.category === 'Prova tecnica' ? 'pubblicata' : 'importata', doc: d, reason: 'import', at: new Date().toISOString() }], draft: null, diffs: [], checked: null, prods: [], sugs: [] }
let role = 'chef'
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
const curDoc = id => Object.assign({}, LAB[id].versions.find(v => v.version === LAB[id].cur).doc, { id })
function treeOf(root) { const out = { [root.id]: root }; let fr = [root]; while (fr.length) { const nx = []; fr.forEach(x => (x.lines || []).filter(l => l.kind === 'recipe').forEach(l => { if (!out[l.ref] && LAB[l.ref]) { out[l.ref] = curDoc(l.ref); nx.push(out[l.ref]) } })); fr = nx } return out }
function api(op, b) {
  const u = user()
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-15', plan_date: '2026-10-15', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'recipes': return { recipes: docs.slice(0, 5).map(d => ({ id: d.id, title: d.title, category: d.category })) }
    case 'mre_list': { const list = docs.map(d => ({ id: d.id, pilot: pil.has(d.id), is_test: d.category === 'Prova tecnica', current_version: LAB[d.id].cur, state: LAB[d.id].versions.find(v => v.version === LAB[d.id].cur).state, title: curDoc(d.id).title, category: d.category, diffs: 0, draft: !!LAB[d.id].draft, pending: LAB[d.id].sugs.filter(s => s.status === 'in attesa').length })); return { recipes: list, pending: list.reduce((a, r) => a + r.pending, 0) } }
    case 'mre_recipe': { const L = LAB[b.id], root = curDoc(b.id), dd = treeOf(root), ctx = { doc: x => dd[x], facts: x => facts[x], measures }
      const f2 = {}; Object.keys(facts).forEach(k => { f2[k] = u.role === 'chef' ? facts[k] : (({ price, ...r }) => r)(facts[k]) })
      return { recipe: { id: b.id, current_version: L.cur }, doc: root, docs: dd, facts: f2, measures, versions: L.versions.slice().reverse().map(v => ({ version: v.version, state: v.state, reason: v.reason, by: 'Max', at: v.at })),
        productions: L.prods, suggestions: L.sugs, draft: u.role === 'chef' && L.draft ? Object.assign({}, L.draft, { id: b.id }) : null, diffs: u.role === 'chef' ? (rep[b.id] && rep[b.id].diff_types || []).map(t => ({ type: t, note: 'mock' })) : undefined, diffs_checked: L.checked, cost: u.role === 'chef' ? E.cost(b.id, 1, ctx) : undefined } }
    case 'mre_save_draft': LAB[b.id].draft = b.doc; return { ok: true }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_check_diffs': LAB[b.id].checked = { at: new Date().toISOString(), by: 'Max' }; return { ok: true }
    case 'mre_publish': { const L = LAB[b.id]; if (!L.draft) return [400, 'nessuna_bozza']; const v = L.cur + 1; L.versions.push({ version: v, state: 'pubblicata', doc: L.draft, reason: b.reason, at: new Date().toISOString() }); L.cur = v; L.draft = null; return { ok: true, version: v } }
    case 'mre_restore': { const L = LAB[b.id], old = L.versions.find(v => v.version === b.version), v = L.cur + 1; L.versions.push({ version: v, state: 'pubblicata', doc: old.doc, reason: 'Ripristino della v' + b.version, at: new Date().toISOString() }); L.cur = v; return { ok: true, version: v } }
    case 'mre_production': LAB[b.id].prods.unshift(Object.assign({ created_at: new Date().toISOString(), by: u.name }, b)); return { ok: true }
    case 'mre_suggest': LAB[b.id].sugs.unshift({ id: 'a0000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0'), version: b.version, text: b.text, status: 'in attesa', at: new Date().toISOString(), by: u.name }); return { ok: true }
    case 'mre_decide': for (const k in LAB) { const s = LAB[k].sugs.find(x => x.id === b.suggestion_id); if (s) s.status = b.status } return { ok: true }
    case 'mre_ingredients': return { ingredients: Object.values(facts).filter(f => f.name.toLowerCase().includes(String(b.q).toLowerCase())).slice(0, 8).map(f => ({ id: f.id, name: f.name, name_it: f.name_it })), recipes: [] }
  }
  return [400, 'bad_op']
}
const log = []
const ok = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(600)
  return pg
}
const txt = async (pg, sel) => (await pg.locator(sel).allInnerTexts()).join(' | ')
async function openEx(pg) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500)
  await pg.click('text=Esempio — Pan di Spagna (7 uova)'); await pg.waitForTimeout(700)
}

// ---- phone, chef
let pg = await page(390, 844)
await openEx(pg)
await pg.screenshot({ path: `${OUT}/1_iphone_ricetta.png`, fullPage: false })
ok((await txt(pg, '.mr-ings li')).includes('7 pz'), 'iPhone: ricetta aperta, 7 uova')
await pg.click('.mr-ings b.mq[data-mq="l:t1"]'); await pg.keyboard.type('5'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
const ings = await txt(pg, '.mr-ings li')
ok(/5 pz/.test(ings) && /150 g/.test(ings) && /125 g/.test(ings) && /100 g/.test(ings), '7 → 5 uova: 150 g zucchero, 125 g farina, 100 g burro')
const step1 = (await pg.locator('.mr-steps li').first().innerText()).replace(/\s+/g, ' ')
ok(step1.includes('Monta 5 uova con 150 g di zucchero'), 'procedimento: "' + step1 + '"')
const h1 = await pg.locator('.mr-steps li').first().boundingBox()
await pg.screenshot({ path: `${OUT}/2_iphone_5uova.png` })
await pg.click('.mr-yield b.mq[data-mq="y:l"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('3,7'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
ok(/26 pz/.test(await txt(pg, '.mr-ings li')) && /25,9/.test(await txt(pg, '.mr-scaled')), '3,7 lotti: 26 uova, arrotondate da 25,9 (indicato)')
await pg.click('[data-m="reset"]'); await pg.waitForTimeout(200)
await pg.click('.mr-ings b.mq[data-mq="l:t4"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('340,2'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200)
ok(/17 pz/.test(await txt(pg, '.mr-ings li')), 'burro 340,2 g (12 oz): 17 uova')
await pg.click('[data-m="reset"]'); await pg.click('[data-m="units"]'); await pg.waitForTimeout(200)
ok(/oz/.test(await txt(pg, '.mr-ings li')), 'g → oz in un tocco')
await pg.click('[data-m="units"]')
// production: No change
await pg.click('[data-m="prod"]'); await pg.waitForTimeout(200); await pg.screenshot({ path: `${OUT}/3_iphone_produzione.png` })
await pg.click('[data-m="prodsave"]'); await pg.waitForTimeout(300)
ok(/Registrata: 820 g/.test(await txt(pg, '.mr-done')), 'registra produzione con un tocco (nessuna differenza)')
// panels
await pg.click('[data-m="p:cost"]'); await pg.waitForTimeout(200); await pg.screenshot({ path: `${OUT}/4_iphone_foodcost.png`, fullPage: true })
ok(/\$1,85|\$1\.85/.test(await txt(pg, '.mr-panel')), 'food cost lotto $1,85 (prezzi reali Brigade)')
// edit: butter 160 and publish
await pg.click('[data-m="edit"]'); await pg.waitForTimeout(200)
await pg.click('.mr-ings b.mq[data-mq="l:t4"]'); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('160'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1300)
await pg.screenshot({ path: `${OUT}/5_iphone_editor.png`, fullPage: true })
ok(/→/.test(await txt(pg, '.mr-foot')), 'editor: anteprima food cost prima → dopo')
await pg.click('[data-m="publish"]'); await pg.waitForTimeout(1500)
console.log('DEBUG toast:', await pg.locator('.toast').allInnerTexts(), 'cur', LAB['00000000-b490-4000-8000-000000000001'].cur, 'draft', !!LAB['00000000-b490-4000-8000-000000000001'].draft)
ok(LAB['00000000-b490-4000-8000-000000000001'].cur === 2 && (await txt(pg, '.mr-ings li')).includes('160 g'), 'pubblicata v2 con burro 160 g')
await pg.click('[data-m="p:hist"]'); await pg.waitForTimeout(200); await pg.screenshot({ path: `${OUT}/6_iphone_storico.png`, fullPage: true })
await pg.click('[data-m="restore:1"]'); await pg.waitForTimeout(500)
ok(LAB['00000000-b490-4000-8000-000000000001'].cur === 3 && (await txt(pg, '.mr-ings li')).includes('140 g'), 'ripristino v1 come v3 (niente cancellato)')
await pg.context().close()

// ---- phone, staff: suggestion; then chef approves
role = 'staff'
pg = await page(390, 844); await openEx(pg)
ok(!(await pg.locator('[data-m="edit"]').count()) && !(await pg.locator('[data-m="p:cost"]').count()), 'cuoco: niente "Modifica ricetta", niente food cost')
await pg.click('[data-m="sug"]'); await pg.fill('#mrSug', 'Con 140 g di burro l’impasto resta asciutto: proverei 160 g.'); await pg.click('[data-m="sugsend"]'); await pg.waitForTimeout(400)
await pg.screenshot({ path: `${OUT}/7_iphone_cuoco_suggerimento.png` })
ok(/Suggerimento inviato/.test(await txt(pg, '.mr-done')), 'cuoco: suggerimento inviato')
await pg.context().close()
role = 'chef'
pg = await page(390, 844); await pg.waitForTimeout(400)
ok(/nuovi suggerimenti/.test(await pg.locator('#main').innerText()), 'Chef: avviso nel "Mio turno"')
await openEx(pg); await pg.click('[data-m="p:sug"]'); await pg.waitForTimeout(200)
await pg.click('[data-m^="dec:"][data-m$=":approvato"]'); await pg.waitForTimeout(300)
ok(LAB['00000000-b490-4000-8000-000000000001'].sugs[0].status === 'approvato' && LAB['00000000-b490-4000-8000-000000000001'].cur === 3, 'Chef approva: ricetta NON cambiata (resta v3)')
await pg.screenshot({ path: `${OUT}/8_iphone_chef_suggerimenti.png`, fullPage: true })
await pg.context().close()

// ---- tablet + desktop, real pilots
for (const [w, h, n] of [[820, 1180, 'tablet'], [1280, 800, 'desktop']]) {
  pg = await page(w, h); await openEx(pg)
  await pg.screenshot({ path: `${OUT}/9_${n}_esempio.png` })
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(300)
  await pg.click('text=Limoncello Cake'); await pg.waitForTimeout(700)
  await pg.click('[data-m="p:struct"]'); await pg.waitForTimeout(200)
  await pg.screenshot({ path: `${OUT}/10_${n}_limoncello_struttura.png`, fullPage: true })
  const sim = await txt(pg, '.mr-panel')
  ok(/Mimosa|GF|porzioni/i.test(sim), `${n}: Limoncello, scarico simulato visibile`)
  await pg.context().close()
}
pg = await page(390, 844)
for (const t of ['Mint Bavarese', 'Salmon Cakes', '48 Hour Texas Wagyu Dino Rib', 'Wheel Pasta']) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(300); await pg.click(`text=${t}`); await pg.waitForTimeout(600)
  await pg.screenshot({ path: `${OUT}/11_iphone_${t.replace(/\W+/g, '_')}.png`, fullPage: true })
  ok((await pg.locator('.mr-ings li').count()) > 0, `pilota "${t}" si apre`)
}
await browser.close()
fs.writeFileSync(`${OUT}/results.txt`, log.join('\n'))
