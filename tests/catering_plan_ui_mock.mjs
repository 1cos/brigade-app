// B-25 passo 1 — prova schermate Catering (eventi passati, Production/Shopping/Cost) con la risposta VERA di Mason (fixture). Server web su 127.0.0.1:18925.
// Uso: [BROWSER=webkit] node tests/catering_plan_ui_mock.mjs <cartella_uscita>
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true })
const F = JSON.parse(fs.readFileSync(new URL('./catering_plan_mason_fixture.json', import.meta.url)))
const ID = '7c4b3029-f4c9-4a64-a17d-c2844e54bf06'
const EV = { id: ID, name: 'Mason Rehearsal', date: '2026-10-09', time: '18:00:00', guests: 45, status: 'definite', links: 3, past: true }
const FUT = { id: '11111111-1111-1111-1111-111111111111', name: 'Evento Futuro', date: '2026-12-01', time: '12:00:00', guests: 30, status: 'definite', links: 0, past: false }
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
let role = 'chef'; const asked = []
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
function api(op, b) {
  const u = user(), chef = u.role === 'chef'; asked.push(u.name + ':' + op)
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: '2026-11-22', plan_date: '2026-11-22', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: [] }
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'office': return chef ? { checked_at: 'x', today: '2026-11-22', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [] } } : [403, 'forbidden']
    case 'catering': return { events: [{ id: FUT.id, name: FUT.name, date: FUT.date, time: FUT.time, guests: 30, status: 'definite', ts_menu: null, dishes: [] }] }
    case 'catering_plan': if (!chef) return [403, 'forbidden']; if (b.id) return b.id === ID ? Object.assign({}, F, { event: { id: ID, name: EV.name, date: EV.date, time: EV.time, guests: 45, status: 'definite' }, menu_lines: 3, menu_not_linked: ['Tiramisu'] }) : [404, 'not_found']; return { ok: true, today: '2026-11-22', events: [FUT, EV] }
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:18925/index.html'); await pg.waitForTimeout(700)
  return pg
}
const H1 = pg => pg.locator('#main h1').first().textContent()
const noH = async (pg, where) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(r[0] <= r[1], `${where}: niente scorrimento laterale`) }
for (const [dev, w, h] of [['telefono', 390, 844], ['tablet', 820, 1180], ['computer', 1440, 900]]) {
  role = 'chef'; let pg = await page(w, h)
  await pg.click('button.w[data-w="catering"]'); await pg.waitForTimeout(400)
  ok(await pg.locator('button[data-a="openPast"]').count() === 1, `${dev} · Chef: c'è «Eventi passati e prossimi»`)
  await pg.click('button[data-a="openPast"]'); await pg.waitForTimeout(500)
  ok((await H1(pg)) === 'Eventi passati e prossimi' && await pg.locator('#main button[data-a="openPlan"]').count() === 2, `${dev} · elenco: 1 prossimo + Mason passato`)
  const txt = await pg.locator('#main').innerText(); ok(/Mason Rehearsal/.test(txt) && /passato/.test(txt) && /3 piatti collegati/.test(txt), `${dev} · Mason visibile, «passato», 3 piatti collegati`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_1_elenco.png` }); await noH(pg, `${dev} elenco`)
  await pg.locator(`#main button[data-a="openPlan"][data-id="${ID}"]`).click(); await pg.waitForTimeout(500)
  ok((await H1(pg)) === 'Mason Rehearsal', `${dev} · apre Mason`)
  let t = await pg.locator('#main').innerText()
  ok(/PENNE ARRABBIATA BUFFET/.test(t) && /Grilled Chicken/.test(t) && /Lasagna Pan/.test(t) && /Non calcolabile/.test(t), `${dev} · Production: 3 piatti, 2 segnati «non calcolabile»`)
  ok(/1 righe del menu Tripleseat senza collegamento/.test(t) && /Tiramisu/.test(t), `${dev} · Production: segnala Tiramisu senza collegamento`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_2_production.png`, fullPage: true }); await noH(pg, `${dev} production`)
  await pg.click('button[data-a="cplanSeg"][data-k="shop"]'); await pg.waitForTimeout(300)
  t = await pg.locator('#main').innerText()
  ok(/Penne compare 2 volte/.test(t) && /1,8 kg/.test(t) && /2,25 kg/.test(t), `${dev} · Shopping: avvisa Penne 2 volte (1,8 kg + 2,25 kg)`)
  ok(/Cacio e Pepe/.test(t) && /Grilled Chicken/.test(t), `${dev} · Shopping: «non calcolabile» e «salvati ma non trasformabili»`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_3_shopping.png`, fullPage: true }); await noH(pg, `${dev} shopping`)
  await pg.click('button[data-a="cplanSeg"][data-k="cost"]'); await pg.waitForTimeout(300)
  t = await pg.locator('#main').innerText()
  ok(/Incompleto/.test(t) && /\$14[.,]25/.test(t) && /costo non calcolabile/.test(t) && /Lasagna Pan/.test(t), `${dev} · Cost: Incompleto, 14,25 $ noti, righe non calcolabili`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_4_cost.png`, fullPage: true }); await noH(pg, `${dev} cost`)
  // staff: niente
  role = 'staff'; pg = await page(w, h)
  await pg.click('button.w[data-w="catering"]'); await pg.waitForTimeout(400)
  ok(await pg.locator('button[data-a="openPast"]').count() === 0, `${dev} · Staff: nessun accesso a «Eventi passati»`)
  ok(!asked.some(a => a.startsWith('Pablo:catering_plan')), `${dev} · Staff: nessuna richiesta catering_plan`)
}
await browser.close(); console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0)
