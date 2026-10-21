// R1.5 — switch user test (iPhone problem: Chef found Pablo's session). Headless Chromium and WebKit (Safari engine,
// iPhone screen). API answered in memory: PIN 1111 = Max (chef), 2222 = Pablo (staff). Nothing is sent to Supabase.
// Usage: [BROWSER=webkit] node tests/switch_user_mock.mjs <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
const PEOPLE = { '1111': { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null }, '2222': { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' } }
const USERS = {}, issued = { Max: [], Pablo: [] }   // every login = a new session token, as on the real server
let seq = 0
const revoked = new Set(), log = []
let slowOffice = 0
const OFFICE = { checked_at: new Date().toISOString(), today: '2026-10-15', decisions: [{ key: 'k1', today: true, cls: 'action_now', sev: 'red', area: 'invoice', title: { raw: 'SEGRETO-CHEF fattura' }, why: { raw: 'solo per lo Chef' } }], stale: [], history: [], completeness: [], invoices: { warnings: 1, invoices: 1, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 1, review: 0 } } }
function api(b, tok) {
  if (b.op === 'login') { const u = PEOPLE[b.pin]; if (!u) return { ok: false }; const t = (++seq).toString(16).padStart(64, '0'); USERS[t] = u; issued[u.name].push(t); return { ok: true, token: t, user: u } }
  const u = tok && !revoked.has(tok) && USERS[tok]; if (!u) return [401, 'session_expired']
  log.push(u.name + ':' + b.op)
  switch (b.op) {
    case 'me': return { ok: true, user: u }
    case 'logout': revoked.add(tok); return { ok: true }
    case 'shift': return { today: '2026-10-15', plan_date: '2026-10-15', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: [{ id: '5c3cc880-baa9-48aa-b280-6de57001578f', title: 'Ricetta', category: 'Sauce' }] }
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'office': return u.role === 'chef' ? OFFICE : [403, 'forbidden']
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
console.log('motore browser:', ENGINE)
const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true }, ENGINE === 'webkit' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
const pg = await ctx.newPage()
pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
await pg.route('**/functions/v1/brigade-app-api*', async r => {
  const b = JSON.parse(r.request().postData() || '{}'), h = r.request().headers()['authorization'] || '', tok = h.startsWith('Bearer ') ? h.slice(7) : null
  if (b.op === 'office' && slowOffice) await new Promise(x => setTimeout(x, slowOffice))
  const out = api(b, tok)
  if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) })
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) })
}).catch(() => {})
await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
await pg.addInitScript(() => { navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
const pin = async p => { for (const k of p) await pg.click(`#login button[data-k="${k}"]`); await pg.waitForTimeout(700) }
const who = () => pg.locator('#who').textContent()
const text = () => pg.evaluate(() => document.body.innerText)
const store = () => pg.evaluate(() => Object.keys(localStorage).sort())

// 1) Pablo signed in earlier on this phone (the reported case)
await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(500)
await pin('2222')
ok((await who()) === 'Pablo · Staff', `aperta l'app: si vede chiaramente chi è collegato: "${await who()}"`)
await pg.reload(); await pg.waitForTimeout(800)
ok((await who()) === 'Pablo · Staff', 'la sessione resta (nessun cambio automatico di account)')
const sw = pg.locator('#switch')
ok(await sw.isVisible() && (await sw.innerText()).toLowerCase() === 'cambia utente', `pulsante "${await sw.innerText()}" visibile in alto, senza aprire Cerca`)
await pg.screenshot({ path: `${OUT}/${P}1_pablo_collegato.png` })
// 2) one tap: immediate
await sw.click(); await pg.waitForTimeout(150)
ok(await pg.locator('#login').isVisible() && (await pg.locator('#main').innerHTML()) === '' && (await pg.locator('#tabs').innerHTML()) === '', 'un tocco: schermata PIN subito, pagina e tab svuotate')
ok(!(await store()).includes('brigade-app-token') && !(await store()).some(k => k.startsWith('brigade-app-ui:')), `telefono pulito: nessun token, nessuno stato di Pablo (${(await store()).join(', ') || 'vuoto'})`)
await pg.waitForTimeout(300)
ok(issued.Pablo.every(t => revoked.has(t)), 'il server ha chiuso la sessione di Pablo (il vecchio codice non vale più)')
ok(/Pablo è uscito/.test(await pg.locator('#lerr').innerText()), `messaggio: "${await pg.locator('#lerr').innerText()}"`)
await pg.screenshot({ path: `${OUT}/${P}2_pin.png` })
// 3) Max with his own PIN
await pin('1111')
ok((await who()) === 'Max · Chef', `Max entra con il suo PIN: "${await who()}"`)
await pg.waitForTimeout(500)
ok(/SEGRETO-CHEF/.test(await text()), 'lo Chef vede il suo avviso importante')
await pg.screenshot({ path: `${OUT}/${P}3_max.png` })
// 4) Chef → staff: nothing of the Chef stays visible or in memory, even an answer still on its way
await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(400)
slowOffice = 1500
await pg.evaluate(() => { window.AppApi.forget('office'); window.dispatchEvent(new Event('app-data')); })
await pg.waitForTimeout(200)                                   // office answer for Max is now in flight
await sw.click(); await pg.waitForTimeout(100)
await pin('2222'); await pg.waitForTimeout(1800)               // Max's late answer arrives after Pablo is in
slowOffice = 0
ok((await who()) === 'Pablo · Staff', `cambio Chef → cuoco: "${await who()}"`)
const t2 = await text()
ok(!/SEGRETO-CHEF|Ufficio|Decisioni|Fatture/.test(t2), 'nessun dato dello Chef visibile al cuoco (né Ufficio, né avvisi)')
ok(await pg.evaluate(() => window.AppApi.peek('office') === undefined), 'la risposta arrivata in ritardo per lo Chef è stata scartata, non è in memoria')
ok(await pg.locator('button.w[data-w="office"]').count() === 0, 'il cuoco non ha il mondo Ufficio')
await pg.screenshot({ path: `${OUT}/${P}4_pablo_dopo_max.png` })
// 5) wrong PIN, and the old Chef session cannot be reused
await sw.click(); await pg.waitForTimeout(100); await pin('9999')
ok(await pg.locator('#login').isVisible() && /PIN/.test(await pg.locator('#lerr').innerText()), `PIN sbagliato: "${await pg.locator('#lerr').innerText()}"`)
ok([...issued.Max, ...issued.Pablo].every(t => revoked.has(t)), 'sessioni chiuse sul server: Max e Pablo')
ok(!log.some(x => /^Pablo:office/.test(x)), `il cuoco non ha mai chiesto dati dell'Ufficio`)
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
