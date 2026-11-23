// B-25 (COPIA, non pubblicata) — correzione reversibile: Eventi Catering NON mostra importi del calcolo provvisorio; l'importo ufficiale è Food cost. Web su 127.0.0.1:18925.
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true })
const F = JSON.parse(fs.readFileSync(new URL('./catering_plan_mason_fixture.json', import.meta.url)))
const LE = 'dd7a8f3f-2054-4056-b11d-fb84b9fc540e', AB = '4bbe319f-8be5-4749-b1e7-8894c3bcd40a'
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
const ev = { [LE]: { id: LE, name: 'Leanne Rehearsal', date: '2026-12-10', time: '18:00:00', guests: 50, status: 'cancelled' }, [AB]: { id: AB, name: 'Abb Vie', date: '2026-10-28', time: '18:00:00', guests: 10, status: 'definite' } }
const user = { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
for (const [dev, w, h] of [['telefono', 390, 844], ['computer', 1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 }); const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); let out
    if (b.op === 'me') out = { ok: true, user }
    else if (b.op === 'shift') out = { today: '2026-11-23', plan_date: '2026-11-23', user, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    else if (b.op === 'recipes') out = { recipes: [] }
    else if (b.op === 'mre_list') out = { recipes: [], pending: 0 }
    else if (b.op === 'office') out = { checked_at: 'x', today: '2026-11-23', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [] } }
    else if (b.op === 'catering') out = { events: [] }
    else if (b.op === 'catering_plan' && !b.id) out = { ok: true, today: '2026-11-23', events: [{ ...ev[LE], links: 0, past: false }, { ...ev[AB], links: 0, past: true }].map(e => ({ id: e.id, name: e.name, date: e.date, guests: e.guests, links: 0, past: e.date < '2026-11-23' })) }
    else if (b.op === 'catering_plan' && ev[b.id]) out = Object.assign({}, F, { event: ev[b.id] })
    else return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'bad_op' }) })
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:18925/index.html'); await pg.waitForTimeout(700)
  await pg.click('button.w[data-w="catering"]'); await pg.waitForTimeout(400)
  await pg.click('button[data-a="openPast"]'); await pg.waitForTimeout(500)
  for (const [id, nome] of [[LE, 'Leanne Rehearsal'], [AB, 'Abb Vie']]) {
    await pg.locator(`#main button[data-a="openPlan"][data-id="${id}"]`).click(); await pg.waitForTimeout(500)
    let t = await pg.locator('#main').innerText(), src = await pg.locator('#main iframe').getAttribute('src')
    ok(src && src.includes('catering_cost.html?ev=' + id), `${dev} · ${nome}: si apre su Food cost (calcolo ufficiale) dello stesso evento`)
    ok(!/\$\d/.test(t.replace(/\$0/g, '')) || !/151[.,]05|156[.,]45|15[.,]10|31[.,]24/.test(t), `${dev} · ${nome}: nessun importo del calcolo provvisorio`)
    for (const k of ['prod', 'shop', 'cost']) {
      await pg.click(`button[data-a="cplanSeg"][data-k="${k}"]`); await pg.waitForTimeout(250); t = await pg.locator('#main').innerText()
      ok(/Importi non attendibili qui/.test(t) && !/\$\d/.test(t) && !/Penne|Penne|INCOMPLETO|PREVISTO/.test(t), `${dev} · ${nome} · ${k}: avviso «importi non attendibili», nessun importo, rimando a Food cost`)
    }
    await pg.click('#main button[data-a="cplanSeg"][data-k="food"]'); await pg.waitForTimeout(300)
    ok(await pg.locator('#main iframe').count() === 1, `${dev} · ${nome}: dal pulsante si torna a Food cost`)
    await pg.screenshot({ path: `${OUT}/${P}${dev}_${nome.replace(/ /g, '_')}.png`, fullPage: true })
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(sw[0] <= sw[1], `${dev} · ${nome}: niente scorrimento laterale`)
    await pg.click('#main button.back'); await pg.waitForTimeout(300)
  }
  await ctx.close() }
await browser.close(); console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0)
