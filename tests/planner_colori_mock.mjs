import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
const OUT = process.argv[2]; const BASE = process.env.BASE || 'http://127.0.0.1:18925'
const d = '2026-11-24', sh = (n, r, a, b) => ({ name: n, role: r, start: d + 'T' + a + ':00Z', end: d + 'T' + b + ':00Z', open: false, changed: false })
const days = [{ date: d, state: 'pubblicato', shifts: [sh('Rogers Chance', 'Morning Prep', '13:00', '19:30'), sh('David Davis', 'Evening', '17:00', '23:30'), sh('Jose Gonzalez', 'Dish', '13:00', '20:00'), sh('Xx Yy', 'Line Cook', '19:00', '23:00')] }]
const user = { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const ENG = process.env.BROWSER === 'webkit' ? webkit : chromium
const b = await (ENG === webkit ? webkit.launch() : chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` }))
for (const lang of ['it', 'en', 'es']) {
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); pg.on('pageerror', e => ok(false, 'ERR ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const x = JSON.parse(r.request().postData() || '{}'); let out
    if (x.op === 'me') out = { ok: true, user }; else if (x.op === 'planner') out = { ok: true, today: d, scope: 'all', linked: true, read_at: d + 'T03:00:00Z', days }
    else if (x.op === 'shift') out = { today: d, plan_date: null, user, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    else out = { ok: true }
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(l => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', l); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, lang)
  await pg.goto(BASE + '/index.html'); await pg.waitForTimeout(700); await pg.click('button.w[data-w="planner"]'); await pg.waitForTimeout(500)
  const t = (await pg.locator('#main').innerText()).replace(/\s+/g, ' ')
  const lab = { it: ['Mattina', 'Sera', 'Lavaggio'], en: ['Morning', 'Evening', 'Dishwashing'], es: ['Mañana', 'Noche', 'Lavaplatos'] }[lang]
  ok(lab.every(x => t.includes(x)), `${lang}: legenda ${lab.join(' / ')}`)
  const cols = await pg.locator('#main .row[style*="border-left"]').evaluateAll(e => e.map(x => x.style.borderLeftColor))
  ok(cols.length === 4 && cols[0] !== cols[1] && cols[0] !== cols[2] && cols[1] !== cols[2], `${lang}: 3 colori diversi su 4 turni (${cols.join(' | ')})`)
  ok(/Rogers Chance/.test(t) && /Jose Gonzalez/.test(t), `${lang}: nomi e orari presenti`)
  const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(sw[0] <= sw[1], `${lang}: niente scorrimento laterale`)
  await pg.screenshot({ path: `${OUT}/pl_${lang}.png` })
}
await b.close(); console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0)
