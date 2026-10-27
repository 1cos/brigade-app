// MR-30 — a sub-recipe added in the editor shows its name at once (Chef 27/10: the ragù showed «?» and «sub-recipe not in the lab»)
// Usage: PORT=<static server for web/> node tests/mr30/sub_add_mock.mjs <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const ING = '9b1e2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', WID = '5479387e-e4ad-4401-92ce-9cb785ef4a0d', RAG = '2a7c9e11-5b3d-4f6a-8e2c-1d4b6f8a0c33'
const DOC = { schema: 1, id: WID, title: 'Lasagna', category: 'primi piatti', yield: { portions: 6 }, lines: [{ id: 'l1', kind: 'ingredient', ref: ING, qty: 100, unit: 'g', role: 'produzione' }], steps: [], stock: [] }
const RDOC = { schema: 1, id: RAG, title: 'Ragù Bolognese', category: 'PREP', yield: { g: 5000, portions: 1 }, lines: [{ id: 'r1', kind: 'ingredient', ref: ING, qty: 50, unit: 'g', role: 'produzione' }], steps: [], stock: [] }
const facts = { [ING]: { id: ING, name: 'Parmesan Flakes', base_unit: 'g', price: { prezzo_per_g: 0.03, fonte: 'mock' } } }
const CALLS = []
function api(op, b) {
  CALLS.push(op + (op === 'mre_recipe' ? ':' + b.id : ''))
  const u = { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null }
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-27', plan_date: '2026-10-27', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'ingredients': return { ingredients: [] }
    case 'mre_list': return { source: 'official', publish_locked: false, pending: 0, recipes: [{ id: WID, title: 'Lasagna', category: 'Pasta', menu: true, prep: false, archived: false, mre: true }, { id: RAG, title: 'Ragù Bolognese', category: 'PREP', menu: false, prep: true, archived: false, mre: false }] }
    case 'mre_ingredients': return { ingredients: [], recipes: [{ id: RAG, title: 'Ragù Bolognese' }] }
    case 'mre_recipe': { const d = b.id === RAG ? RDOC : DOC
      return { source: 'official', read_at: new Date().toISOString(), publish_locked: false, recipe: { id: b.id, current_version: 0, linked: false, review: null },
        doc: d, docs: { [b.id]: d }, draft_docs: {}, facts, measures: {}, versions: [], productions: [], suggestions: [], draft: null, diffs: [], cost: { food: 3, per_portion: 0.5 } } }
    case 'mre_save_draft': return [400, 'non_valida:quantita']
    case 'mre_translate': return { items: [] }
    default: return {}
  }
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = await webkit.launch()
const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const pg = await c.newPage()
pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); await new Promise(x => setTimeout(x, 80))
  const out = api(b.op, b); try { if (Array.isArray(out)) return await r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) } catch (e) {} })
await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}))
await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(1500)
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 }); await pg.fill('#q', 'lasagna')
await pg.click('#main .rm-row:has(.name:text-is("Lasagna"))'); await pg.waitForSelector('#main .mr-ings', { timeout: 20000 }); await pg.waitForTimeout(400)
await pg.click('#main [data-m="edit"]'); await pg.waitForSelector('#main .mr.mr-edit', { timeout: 10000 }); await pg.waitForTimeout(400)
await pg.fill('#mrAdd', 'ragu'); await pg.waitForSelector(`#main [data-m="addr:${RAG}"]`, { timeout: 5000 })
await pg.click(`#main [data-m="addr:${RAG}"]`); await pg.waitForTimeout(1500)
const txt = await pg.locator('#main .mr.mr-edit').innerText()
await pg.screenshot({ path: `${OUT}/ragu.png`, fullPage: true })
ok(CALLS.includes('mre_recipe:' + RAG), 'la sotto-ricetta aggiunta viene letta subito')
ok(/Ragù Bolognese/.test(txt), 'il nome «Ragù Bolognese» si vede nella riga')
ok(!/sotto-ricetta non presente/.test(txt), 'niente «sotto-ricetta non presente»')
await browser.close()
console.log(`\n${pass} PASS · ${fail} FAIL`); process.exit(fail ? 1 : 0)
