// B-25 module 1 — UI test of Decisions / Invoices in a headless browser (phone, tablet, desktop), Chef and staff.
// The API is answered in memory by the SAME server engine (office_core.js) run on a read-only dump. Nothing is sent to Supabase.
// Usage: node tests/office_ui_mock.mjs <snap_clean.json> <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as O from '../supabase/functions/_shared/office_core.js'
const [SNAP, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const D = JSON.parse(fs.readFileSync(SNAP)), NOW = new Date(D.at).getTime()
const rids = new Set(D.attention.map(a => a.recipe_id).filter(Boolean)), titles = {}; D.recipes.forEach(r => { if (rids.has(r.id)) titles[r.id] = r.title })
const bomN = {}; D.bom.forEach(b => { bomN[b.parent_recipe_id] = b.n })
const yields = {}; D.yields.forEach(y => { yields[y.id] = y })
const OFFICE = { checked_at: D.at, today: '2026-10-15', ...O.triage({ attention: D.attention, office: D.office, invwarn: D.invwarn, docs: D.docs, titles, bomN, yields }, NOW) }
let role = 'chef', officeCalls = { chef: 0, staff: 0 }
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
function api(op) {
  const u = user()
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-15', plan_date: '2026-10-15', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: D.recipes.slice(0, 30) }
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'office': officeCalls[u.role]++; return u.role === 'chef' ? OFFICE : [403, 'forbidden']
    case 'recipe': return [404, 'not_found']
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
async function page(w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(l => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', l); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, lang)
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(700)
  return pg
}
const noHScroll = async (pg, where) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, document.getElementById('main').scrollWidth, document.getElementById('main').clientWidth]); ok(r[0] <= r[1] && r[2] <= r[3] + 1, `${where}: nessuno scorrimento orizzontale (${r.join('/')})`) }
const H1 = pg => pg.locator('#main h1').first().innerText()

for (const [dev, w, h] of [['telefono', 390, 844], ['tablet', 820, 1180], ['computer', 1440, 900]]) {
  role = 'chef'
  const pg = await page(w, h, 'it')
  const row = pg.locator('button[data-a="openOffice"][data-scope="today"]')
  ok(await row.count() === 1, `${dev} · Chef · Il mio turno mostra "${(await row.innerText().catch(() => '')).split('\n')[0]}"`)
  await pg.screenshot({ path: `${OUT}/${dev}_1_mio_turno.png` }); await noHScroll(pg, `${dev} Il mio turno`)
  await row.click(); await pg.waitForTimeout(400)
  ok((await H1(pg)) === '1 ti aspetta', `${dev} · Decisioni di oggi: "${await H1(pg)}"`)
  await pg.screenshot({ path: `${OUT}/${dev}_2_decisioni_oggi.png` })
  await pg.click('button[data-a="ofAll"]'); await pg.waitForTimeout(400)
  const n = await pg.locator('#main .dec').count()
  ok(n === OFFICE.decisions.length, `${dev} · tutte le decisioni: ${n} schede (motore ${OFFICE.decisions.length})`)
  ok(await pg.locator('button.back').count() === 1, `${dev} · tasto Indietro presente: "${await pg.locator('button.back').innerText()}"`)
  await pg.screenshot({ path: `${OUT}/${dev}_3_decisioni_tutte.png`, fullPage: true }); await noHScroll(pg, `${dev} Decisioni`)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(500)
  ok(await pg.locator('button.big[data-k="decisions"]').count() === 1 && await pg.locator('button.big[data-k="invoices"]').count() === 1, `${dev} · Ricette: riquadri Decisioni e Fatture per lo Chef`)
  await pg.screenshot({ path: `${OUT}/${dev}_4_riquadri.png` }); await noHScroll(pg, `${dev} riquadri`)
  await pg.click('button.big[data-k="invoices"]'); await pg.waitForTimeout(400)
  const secs = await pg.locator('#main .chap h2').allTextContents()
  ok((await H1(pg)) === 'Fatture' && secs.includes('Ti aspetta') && secs.includes('Per informazione'), `${dev} · Fatture: ${secs.join(' | ')}`)
  await pg.screenshot({ path: `${OUT}/${dev}_5_fatture.png`, fullPage: true }); await noHScroll(pg, `${dev} Fatture`)
  await pg.context().close()
}
// three languages
for (const [lang, word] of [['en', 'Invoices'], ['es', 'Facturas'], ['it', 'Fatture']]) {
  role = 'chef'; const pg = await page(390, 844, lang)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(400)
  await pg.click('button.big[data-k="invoices"]'); await pg.waitForTimeout(300)
  const h = await H1(pg), body = await pg.locator('#main').innerText()
  ok(h === word && !/\bof_[a-z_]+/.test(body), `lingua ${lang}: titolo "${h}", nessuna chiave grezza`)
  await pg.click('button.big[data-k="decisions"]').catch(() => {})
  await pg.click('button.w[data-w="today"]'); await pg.waitForTimeout(300)
  await pg.locator('button[data-a="openOffice"]').first().click(); await pg.click('button[data-a="ofAll"]'); await pg.waitForTimeout(300)
  const b2 = await pg.locator('#main').innerText()
  ok(!/\bof_[a-z_]+/.test(b2), `lingua ${lang}: decisioni senza chiavi grezze`)
  await pg.screenshot({ path: `${OUT}/lingua_${lang}_decisioni.png` })
  await pg.context().close()
}
// staff: nothing of this, and the app never even asks
role = 'staff'; officeCalls.staff = 0
{
  const pg = await page(390, 844, 'it')
  ok(await pg.locator('button[data-a="openOffice"]').count() === 0, 'cuoco · Il mio turno: nessuna riga decisioni')
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(400)
  ok(await pg.locator('button.big').count() === 0, 'cuoco · Ricette: nessun riquadro Decisioni/Fatture')
  ok(officeCalls.staff === 0, `cuoco · l'app non chiede mai i dati dell'Ufficio (${officeCalls.staff} richieste)`)
  await pg.screenshot({ path: `${OUT}/cuoco_ricette.png` })
  await pg.context().close()
}
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
