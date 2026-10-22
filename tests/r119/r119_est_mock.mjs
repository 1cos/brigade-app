// R1.19 (Chef 22/10, Wheel Pasta) — "prezzo di fiducia": the Chef types an estimated price for an ingredient WITHOUT invoices (rum,
// bought by the front of house). iPhone, WebKit. Recipe = the real Wheel Pasta draft read from the server (read-only dump).
// API answered in memory with the shapes of brigade-app-api/mre.ts (save keeps est like cleanDoc, staff never gets est nor prices).
// Usage: PORT=<static server for web/> node tests/r119/r119_est_mock.mjs <wheel_pasta_draft.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const [DUMP, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const D = JSON.parse(fs.readFileSync(DUMP, 'utf8')), ID = D.recipe.id, RUM = 'b2175', CHEESE = 'b2176', BUTANE = 'b2177'
let draft = JSON.parse(JSON.stringify(D.draft)), role = 'chef', lang = 'it'; const SAVED = []
const strip = doc => Object.assign({}, doc, { lines: doc.lines.map(({ est, ...r }) => r) })
const estOf = e => e && Number(e.usd) > 0 && Number(e.qty) > 0 && e.unit ? { usd: Math.round(Number(e.usd) * 100) / 100, qty: Number(e.qty), unit: String(e.unit), at: e.at || null } : null   // = cleanDoc
const ctx = () => ({ doc: x => x === ID ? draft : ((D.draft_docs || {})[x] || D.docs[x]), facts: x => D.facts[x], measures: D.measures })
function api(op, b) {
  const chef = role === 'chef', u = chef ? { id: 1, name: 'Max', role: 'chef', lang, station: null } : { id: 38, name: 'Pablo', role: 'staff', lang, station: 'Pasta' }
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-22', plan_date: '2026-10-22', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'ingredients': return { ingredients: [] }
    case 'mre_list': return { source: 'official', publish_locked: true, pending: 0, recipes: [{ id: ID, title: 'Wheel Pasta', category: 'Pasta', menu: true, prep: false, archived: false, mre: true, ...(chef ? { draft: true, draft_version: 2, review: null, pending: 0 } : {}) }] }
    case 'mre_recipe': {
      const facts = {}; for (const k of Object.keys(D.facts)) facts[k] = chef ? D.facts[k] : (({ price, ...r }) => r)(D.facts[k])
      return { source: 'official', read_at: new Date().toISOString(), publish_locked: true, recipe: { id: ID, current_version: 1, linked: true, review: null },
        doc: chef ? D.doc : strip(D.doc), docs: D.docs, draft_docs: chef ? (D.draft_docs || {}) : {}, facts, measures: D.measures, versions: [], productions: [], suggestions: [],
        draft: chef ? Object.assign({}, draft, { id: ID, _version: 2 }) : null, diffs: chef ? [] : undefined, cost: chef ? E.cost(ID, 1, ctx()) : undefined }
    }
    case 'mre_save_draft': {
      if (!chef) return [403, 'forbidden']
      const doc = JSON.parse(JSON.stringify(b.doc)); doc.lines = doc.lines.map(l => { const { est, ...r } = l; const e = estOf(est); return e ? Object.assign(r, { est: e }) : r })
      const errs = E.validate(doc, ctx(), false); if (errs.length) return [400, 'non_valida:' + errs.join(',')]
      SAVED.push(doc); draft = Object.assign(doc, { id: ID }); return { ok: true, draft_version: 2, cost: E.cost(ID, 1, ctx()) }
    }
    case 'mre_publish': return [423, 'pubblicazione_bloccata']
    case 'mre_translate': return { items: [] }
    default: return {}
  }
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = await webkit.launch()
async function page(lg) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await c.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); await new Promise(x => setTimeout(x, 120))
    const out = api(b.op, b); try { if (Array.isArray(out)) return await r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) } catch (e) {} })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}))
  await pg.addInitScript(l => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', l); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, lg)
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(1500)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 }); await pg.fill('#q', 'wheel')
  await pg.click('#main .rm-row:has(.name:text-is("Wheel Pasta"))'); await pg.waitForSelector('#main .mr-ings', { timeout: 20000 }); await pg.waitForTimeout(400)
  return { pg, c }
}
const idle = async pg => { for (let i = 0; i < 40; i++) { await pg.waitForTimeout(250); const st = await pg.evaluate(() => (document.querySelector('.mr-status') || {}).textContent || ''); if (!/sav|salv/i.test(st) || i > 12) { await pg.waitForTimeout(900); return } } }
const line = (pg, id) => pg.locator(`#main li.mr-eline:has([data-mq="l:${id}"])`)
const fc0 = E.cost(ID, 1, ctx())

/* 1. Chef, Italian: the field only where the invoice price is missing */
let { pg, c } = await page('it')
let head = await pg.locator('#main .mr-fc').innerText()
ok(/parziale/.test(head) && !/stima/.test(head), 'vista: food cost parziale, nessuna stima — ' + head.replace(/\s+/g, ' '))
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd')
ok(await line(pg, RUM).locator('.mr-est').count() === 1, 'rum (senza fattura): c\'è "Prezzo di fiducia"')
ok(await line(pg, CHEESE).locator('.mr-est').count() === 0, 'formaggio (con fattura): nessun campo')
ok(await line(pg, BUTANE).locator('.mr-est').count() === 0, 'bomboletta (imballo): nessun campo')
ok(/Prezzo di fiducia/.test(await line(pg, RUM).innerText()) && /stima dello Chef, non da fattura/.test(await line(pg, RUM).innerText()), 'testo: "Prezzo di fiducia … stima dello Chef, non da fattura"')
ok(await line(pg, RUM).locator('select[data-me^="unit:"]').inputValue() === 'ml', 'unità proposta per un liquore: ml')
await pg.screenshot({ path: OUT + '/1_editor_campo.png', fullPage: true })

/* 2. $25 per 700 g → saved on the line, cost = 30 g × 25/700 */
await line(pg, RUM).locator('select[data-me^="unit:"]').selectOption('g')
await line(pg, RUM).locator('[data-me^="usd:"]').fill('25'); await line(pg, RUM).locator('[data-me^="usd:"]').dispatchEvent('change')
await line(pg, RUM).locator('[data-me^="qty:"]').fill('700'); await line(pg, RUM).locator('[data-me^="qty:"]').dispatchEvent('change')
await idle(pg)
let last = SAVED[SAVED.length - 1], rl = last && last.lines.find(l => l.id === RUM)
ok(rl && rl.est && rl.est.usd === 25 && rl.est.qty === 700 && rl.est.unit === 'g', 'salvato sulla riga: ' + JSON.stringify(rl && rl.est))
ok(last && last.lines.find(l => l.id === RUM).qty === 30 && last.lines.find(l => l.id === CHEESE).qty === 100, 'quantità invariate (rum 30 g, formaggio 100 g)')
ok(JSON.stringify(last.steps) === JSON.stringify(D.draft.steps), 'procedimento invariato (17 passi)')
ok(/stima dello Chef/.test(await line(pg, RUM).innerText()), 'riga rum: "stima dello Chef"')
const fc1 = E.cost(ID, 1, ctx())
ok(Math.abs(fc1.food - fc0.food - 30 * 25 / 700) < 1e-9 && fc1.chef_est === 1 && fc1.missing === fc0.missing - 1, `food cost +$${(30 * 25 / 700).toFixed(3)} (rum), 1 stima`)
await line(pg, RUM).evaluate(e => e.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(300); await pg.screenshot({ path: OUT + '/2_stima_salvata.png' })

/* 3. view: "con stima dello Chef", panel says where the number comes from */
await pg.click('.mr-ebar [data-m="savedraft"]').catch(() => {}); await pg.waitForSelector('.mr-editbtn', { timeout: 15000 }).catch(() => {})
head = await pg.locator('#main .mr-fc').innerText()
ok(/con stima dello Chef/.test(head), 'vista: "con stima dello Chef" — ' + head.replace(/\s+/g, ' '))
await pg.click('#main [data-m="p:cost"]'); await pg.waitForSelector('.mr-panel')
const panel = await pg.locator('.mr-panel').innerText()
ok(/completo, con la stima dello Chef \(non da fattura\)/.test(panel) && !/tutto documentato/.test(panel), 'pannello: stato "completo, con la stima dello Chef (non da fattura)", mai "tutto documentato"')
ok(/Prezzo di fiducia \$25\.00 per 700 g · stima, non da fattura/.test(panel), 'pannello: "Prezzo di fiducia $25.00 per 700 g · stima, non da fattura"')
ok(/prezzo di fiducia dello Chef \(stima, non da fattura\)/.test(await pg.locator('#main .mr-issues').textContent()), 'problemi aperti: "prezzo di fiducia dello Chef (stima, non da fattura)"')
await pg.locator('.mr-panel').scrollIntoViewIfNeeded(); await pg.screenshot({ path: OUT + '/3_vista_pannello.png' })

/* 4. per ml with the line in grams: said, never guessed */
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd')
await line(pg, RUM).locator('select[data-me^="unit:"]').selectOption('ml'); await idle(pg)
ok(!/serve la densità/.test(await line(pg, RUM).innerText()), 'stima in ml, riga in g: nessun blocco (Chef 22/10: 1 ml = 1 g)')
const fc2 = E.cost(ID, 1, ctx()); ok(fc2.chef_est === 1 && (fc2.d1_lines || []).includes(RUM), 'e il costo c\'è, con 1 ml = 1 g segnato solo per le Info tecniche')
await pg.screenshot({ path: OUT + '/4_densita.png', fullPage: true })

/* 5. empty price → estimate removed */
await line(pg, RUM).locator('[data-me^="usd:"]').fill(''); await line(pg, RUM).locator('[data-me^="usd:"]').dispatchEvent('change'); await idle(pg)
last = SAVED[SAVED.length - 1]; ok(!last.lines.find(l => l.id === RUM).est, 'prezzo vuoto: stima tolta')
ok(JSON.stringify(strip(last)) === JSON.stringify(strip(Object.assign({}, D.draft, { id: ID }))) || JSON.stringify(last.lines) === JSON.stringify(D.draft.lines), 'bozza tornata come prima (righe identiche)')
await c.close()

/* 6. English screen */
draft.lines.find(l => l.id === RUM).est = { usd: 25, qty: 700, unit: 'g', at: 'x' }
;({ pg, c } = await page('en'))
ok(/with Chef's estimate/.test(await pg.locator('#main .mr-fc').innerText()), 'EN: "with Chef\'s estimate"')
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd')
ok(/Chef's estimated price/.test(await line(pg, RUM).innerText()) && /estimate, not from an invoice/.test(await line(pg, RUM).innerText()), 'EN: "Chef\'s estimated price … estimate, not from an invoice"')
await pg.screenshot({ path: OUT + '/6_en.png', fullPage: true }); await c.close()

/* 7. staff: no estimate, no price */
role = 'staff'; ({ pg, c } = await page('it'))
const txt = await pg.locator('#main').innerText()
ok(!/fiducia|stima|\$/.test(txt), 'personale: nessun prezzo e nessuna stima visibili')
ok(await pg.locator('#main .mr-est').count() === 0, 'personale: nessun campo')
await pg.screenshot({ path: OUT + '/7_staff.png', fullPage: true }); await c.close()

await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
