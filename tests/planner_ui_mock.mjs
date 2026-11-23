// B-25 Planner — prova schermata: Chef (tutti i turni, nomi) e staff (solo i propri), «non ancora pubblicato», 3 dispositivi. Web su 127.0.0.1:18925.
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true })
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
const sh = (name, role, h, open = false) => ({ name, role, start: `2026-11-${h[0]}T15:00:00Z`, end: `2026-11-${h[0]}T22:30:00Z`, open, changed: false })
const mkDays = chef => { const out = []; for (let i = 0; i < 14; i++) { const d = new Date(Date.UTC(2026, 10, 22 + i, 12)); const date = d.toISOString().slice(0, 10); const dd = String(22 + i)
  let state = i <= 6 ? 'pubblicato' : 'non_ancora_pubblicato', shifts = []
  if (i === 4) state = 'nessun_turno'
  if (i === 1) shifts = chef ? [sh('Pablo Rossi', 'Cook', ['23']), sh('Anna Verdi', 'Prep', ['23'])] : [sh(null, 'Cook', ['23'])]
  if (i === 0 && chef) shifts = [sh(null, 'Cook', ['22'], true)]
  out.push({ date, state, shifts }) } return out }
let role = 'chef'
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
function api(op) { const u = user(); switch (op) {
  case 'me': return { ok: true, user: u }
  case 'shift': return { today: '2026-11-22', plan_date: '2026-11-22', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
  case 'recipes': return { recipes: [] }
  case 'mre_list': return { recipes: [], pending: 0 }
  case 'office': return role === 'chef' ? { checked_at: 'x', today: '2026-11-22', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [] } } : [403, 'forbidden']
  case 'planner': return { ok: true, today: '2026-11-22', scope: role === 'chef' ? 'all' : 'mine', linked: true, read_at: '2026-11-23T04:30:00Z', days: mkDays(role === 'chef') } }
  return [400, 'bad_op'] }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 }); const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:18925/index.html'); await pg.waitForTimeout(700); return pg }
for (const [dev, w, h] of [['telefono', 390, 844], ['tablet', 820, 1180], ['computer', 1440, 900]]) {
  for (const r of ['chef', 'staff']) {
    role = r; const pg = await page(w, h)
    await pg.click('button.w[data-w="planner"]'); await pg.waitForTimeout(500)
    const t = await pg.locator('#main').innerText()
    ok(await pg.locator('#main section').count() === 14, `${dev} · ${r}: 14 giorni`)
    ok((t.match(/Non ancora pubblicato/g) || []).length >= 7, `${dev} · ${r}: i giorni non pubblicati dicono «Non ancora pubblicato» (non «nessun turno»)`)
    ok(/Nessun turno in programma/.test(t) || /Nessun turno per te/.test(t), `${dev} · ${r}: giorno pubblicato senza turni dice chiaramente «nessun turno»`)
    if (r === 'chef') ok(/Pablo Rossi/.test(t) && /Anna Verdi/.test(t) && /turno aperto/.test(t), `${dev} · Chef: vede i nomi di tutti e il turno aperto`)
    else ok(!/Anna|Verdi|Rossi/.test(t) && /Cook/.test(t) && /Nessun turno per te/.test(t), `${dev} · Staff: solo il proprio turno, nessun nome di colleghi`)
    ok(/Letto da 7shifts/.test(t), `${dev} · ${r}: dice quando ha letto 7shifts`)
    await pg.screenshot({ path: `${OUT}/${P}${dev}_${r}_planner.png`, fullPage: true })
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(sw[0] <= sw[1], `${dev} · ${r}: niente scorrimento laterale`)
  } }
await browser.close(); console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0)
