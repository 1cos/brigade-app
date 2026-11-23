// B-25 passo 1 — prova schermate Catering (eventi passati, Production/Shopping/Cost) con la risposta VERA di Mason (fixture). Server web su 127.0.0.1:18925.
// Uso: [BROWSER=webkit] node tests/catering_plan_ui_mock.mjs <cartella_uscita>
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true })
const F = JSON.parse(fs.readFileSync(new URL('./catering_plan_mason_fixture.json', import.meta.url))), FA = JSON.parse(fs.readFileSync(new URL('./catering_plan_ashley_fixture.json', import.meta.url)))
const ASH = '3a9c0167-7c27-4f53-8894-a1c65f2996bd'
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
    case 'catering_plan': if (!chef) return [403, 'forbidden']; if (b.id === ASH) return Object.assign({}, FA, { event: { id: ASH, name: 'Wedding Ashley', date: '2026-10-23', time: '17:00:00', guests: 100, status: 'definite' } }); if (b.id) return b.id === ID ? Object.assign({}, F, { event: { id: ID, name: EV.name, date: EV.date, time: EV.time, guests: 45, status: 'definite' } }) : [404, 'not_found']; return { ok: true, today: '2026-11-22', events: [FUT, EV, { id: ASH, name: 'Wedding Ashley', date: '2026-10-23', guests: 100, links: 0, past: true }] }
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
  ok((await H1(pg)) === 'Eventi passati e prossimi' && await pg.locator('#main button[data-a="openPlan"]').count() === 3, `${dev} · elenco: 1 prossimo + Mason + Ashley passati`)
  const txt = await pg.locator('#main').innerText(); ok(/Mason Rehearsal/.test(txt) && /passato/.test(txt) && /3 piatti collegati/.test(txt), `${dev} · Mason visibile, «passato», 3 piatti collegati`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_1_elenco.png` }); await noH(pg, `${dev} elenco`)
  await pg.locator(`#main button[data-a="openPlan"][data-id="${ID}"]`).click(); await pg.waitForTimeout(500)
  ok((await H1(pg)) === 'Mason Rehearsal', `${dev} · apre Mason`)
  let t = await pg.locator('#main').innerText()
  ok(/PENNE ARRABBIATA BUFFET/.test(t) && /quantità confermata dallo Chef/.test(t) && /quantità proposta dalla regola/.test(t) && /nessun collegamento né regola/.test(t), `${dev} · Production: mostra la FONTE di ogni quantità (confermata / regola / manca)`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_2_production.png`, fullPage: true }); await noH(pg, `${dev} production`)
  await pg.click('button[data-a="cplanSeg"][data-k="shop"]'); await pg.waitForTimeout(300)
  t = await pg.locator('#main').innerText()
  ok(/4,05 kg/.test(t) && !/compare \d+ volte/.test(t) && /Chicken Breast/.test(t) && /Cacio e Pepe/.test(t), `${dev} · Shopping: Penne 4,05 kg in una riga, pollo incluso, «non calcolabile» elencato (stesse righe del costo)`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_3_shopping.png`, fullPage: true }); await noH(pg, `${dev} shopping`)
  await pg.click('button[data-a="cplanSeg"][data-k="cost"]'); await pg.waitForTimeout(300)
  t = await pg.locator('#main').innerText()
  ok(/\$151\.05/.test(t) && /\$15\.10/.test(t) && /imprevisti 10% · separati/.test(t) && /\$166\.15/.test(t), `${dev} · Cost PREVISTO: ingredienti $151,05, imprevisti $15,10 SEPARATI, totale con imprevisti $166,15`)
  ok(/INCOMPLETO: 3 mancanze importanti, 1 marginali/.test(t) && /IMPORTANTE · resa mancante/.test(t) && /marginale · prezzo mancante/.test(t) && /stima indicativa \(non sommata\)/.test(t), `${dev} · Cost: avviso INCOMPLETO, mancanze importanti prima, marginali dopo, stima non sommata`)
  ok(/prezzo non da fattura recente/.test(t) && /EFFETTIVO/.test(t) && /Non disponibile/.test(t), `${dev} · Cost: avviso prezzo stimato dallo Chef; EFFETTIVO non disponibile con il motivo`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_4_cost.png`, fullPage: true }); await noH(pg, `${dev} cost`)
  await pg.click('button[data-a="cplanSeg"][data-k="food"]'); await pg.waitForTimeout(300)
  const src = await pg.locator('#main iframe').getAttribute('src'); t = await pg.locator('#main').innerText()
  ok(/catering_cost\.html\?ev=7c4b3029/.test(src) && /\$151\.05/.test(t) && /vecchio calcolo a regole di B-99c/.test(t), `${dev} · Food cost: sopra lo STESSO costo unico ($151,05), sotto B-99c dichiarato «vecchio calcolo»`)
  await pg.click('button[data-a="cplanSeg"][data-k="prev"]'); await pg.waitForTimeout(300)
  t = await pg.locator('#main').innerText(); ok(/NON ancora pubblicato/.test(t), `${dev} · Preventivo: dice che non è ancora pubblicato`)
  // evento con EFFETTIVO parziale
  await pg.click('#main button.back'); await pg.waitForTimeout(300)
  await pg.locator(`#main button[data-a="openPlan"][data-id="${ASH}"]`).click(); await pg.waitForTimeout(500)
  await pg.click('button[data-a="cplanSeg"][data-k="cost"]'); await pg.waitForTimeout(300)
  t = await pg.locator('#main').innerText()
  ok(/EFFETTIVO\s*·?\s*PARZIALE/.test(t) && /\$317\.91/.test(t) && /Righe NON documentate/.test(t) && /Grilled Chicken, Chicken parmigiana/.test(t), `${dev} · EFFETTIVO PARZIALE: totale $317,91 solo righe reali, righe non documentate elencate`)
  const effBlock = t.slice(t.indexOf('EFFETTIVO'))
  ok(/Nessun 10% di imprevisti aggiunto/.test(effBlock) && !/imprevisti 10% · separati/.test(effBlock), `${dev} · EFFETTIVO: nessun 10% di imprevisti`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_5_effettivo_parziale.png`, fullPage: true }); await noH(pg, `${dev} effettivo`)
  // staff: niente
  role = 'staff'; pg = await page(w, h)
  await pg.click('button.w[data-w="catering"]'); await pg.waitForTimeout(400)
  ok(await pg.locator('button[data-a="openPast"]').count() === 0, `${dev} · Staff: nessun accesso a «Eventi passati»`)
  ok(!asked.some(a => a.startsWith('Pablo:catering_plan')), `${dev} · Staff: nessuna richiesta catering_plan`)
}
await browser.close(); console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0)
