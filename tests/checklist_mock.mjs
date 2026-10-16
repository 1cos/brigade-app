// B-51 Smart Checklist phase 1 — engine + screen test on READ-ONLY dumps of live Brigade (tests/checklist_dump.mjs).
// API answered in memory by the SAME engine the server runs (checklist_core.js). iPhone size, Chef and staff.
// Usage: [BROWSER=webkit] node tests/checklist_mock.mjs <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import { loadC } from './checklist_dump.mjs'
import { stationPriorities, toMake, forecastDay } from '../supabase/functions/_shared/checklist_core.js'
const [OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const C = loadC(), ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const TODAY = '2026-10-16'
const run = day => stationPriorities(Object.assign({}, C, { today: day, sales: C.sales.filter(s => s.date < day), openDates: C.openDates.filter(d => d < day) }))
// ---------- engine ----------
const R = run(TODAY), by = k => R.items.find(c => c.key === k)
ok(R.service_days.map(d => d.weekday).join('+') === 'Friday+Saturday' && R.items.length <= 6, `Friday 16/10: service days ${R.service_days.map(d => d.weekday).join('+')}, ${R.items.length} priorities (max 6)`)
const lob = by('lobster'), sat = lob.why.days[0]
ok(lob.for_days[0].weekday === 'Saturday' && sat.samples.length === 4 && sat.samples.every(s => new Date(s.date + 'T12:00:00Z').getUTCDay() === 6), `Thaw Lobsters for Saturday from the last 4 Saturdays (${sat.samples.map(s => s.amount).join(', ')})`)
ok(Math.abs(sat.forecast - sat.mean * 1.15) < 0.15 && lob.qty === Math.ceil(lob.need), `forecast = mean ${sat.mean} + 15% = ${sat.forecast} → ${lob.qty} tails`)
ok(lob.why.dishes.map(d => d.title).sort().join(',') === 'ADD LOBSTER,Lobster Fettucine' && lob.tonight && lob.tonight.weekday === 'Friday', 'lobster dishes: ADD LOBSTER (modifier) + Lobster Fettucine; tonight (Friday) shown as a check')
const arr = by('arrabbiata')
ok(arr.kind === 'production' && arr.batch_g === 3150 && arr.for_days.map(d => d.weekday).join('+') === 'Friday+Saturday' && arr.batches_if_none_ready === Math.ceil(arr.need / 3150), `Arrabbiata: need Fri+Sat ${Math.round(arr.need)} g, batch 3150 g (recipe yield), ${arr.batches_if_none_ready} batches if nothing is ready`)
const cp = arr.why.dishes.find(d => d.title === 'Chicken Parmesan')
ok(cp && cp.per_portion === 275, 'Chicken Parmesan counts 275 g (200 g on the chicken + 75 g with the spaghetti)')
const m = toMake(arr, 9000); ok(m.short === Math.round((arr.need - 9000) * 10) / 10 && m.batches === Math.ceil((arr.need - 9000) / 3150), `9 kg counted ready → short ${m.short} g → ${m.batches} batches (never a theoretical stock)`)
const gn = by('gnocco'); ok(gn.kind === 'check' && gn.batch_g === 2008 && gn.why.dishes[0].title === 'Coccoli Toscani' && gn.why.dishes[0].per_portion === 100, `Check Gnocco: need ${Math.round(gn.need)} g Fri+Sat, batch 2008 g, Coccoli Toscani 100 g`)
ok(R.events.length === 1 && !R.events[0].included && /not included/.test(R.events[0].why), `events: "${R.events[0] && R.events[0].name}" (${R.events[0] && R.events[0].guests}) shown, NOT included (menu not linked)`)
// past day: compare with what was really sold (the day itself is never in the history used)
const P10 = stationPriorities(Object.assign({}, C, { today: '2026-10-09', sales: C.sales.filter(s => s.date < '2026-10-09'), openDates: C.openDates.filter(d => d < '2026-10-09'), salesAll: C.sales }))
const l10 = P10.items.find(c => c.key === 'lobster')
ok(l10.actual && l10.why.days[0].samples.every(s => s.date < '2026-10-09'), `past Friday 9/10: suggested ${l10.qty} lobsters for ${l10.for_days[0].weekday}, really sold ${l10.actual[0].amount}`)
// small backtest: last 8 Fri/Sat, lobster for the next day with +15%
const fridays = C.openDates.filter(d => new Date(d + 'T12:00:00Z').getUTCDay() === 5).slice(-4)
const bt = fridays.map(f => { const r = stationPriorities(Object.assign({}, C, { today: f, sales: C.sales.filter(s => s.date < f), openDates: C.openDates.filter(d => d < f), salesAll: C.sales })).items.find(c => c.key === 'lobster'); return { f, sug: r.qty, act: r.actual[0].amount } })
console.log('   backtest lobster (Fri → Sat):', bt.map(x => `${x.f}: ${x.sug} vs ${x.act}`).join(' · '))
ok(bt.length >= 3, `backtest on ${bt.length} past Fridays computed`)
// ---------- screen ----------
let role = 'chef'; const calls = []
function api(op, b) {
  const chef = role === 'chef'; calls.push(op)
  const u = chef ? { id: 1, name: 'Max', role: 'chef', lang: 'en', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'en', station: 'Pasta Station' }
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: TODAY, plan_date: TODAY, user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'office': return chef ? { checked_at: new Date().toISOString(), today: TODAY, decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 0, review: 0 } } } : [403, 'forbidden']
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'smart_checklist': if (!chef) return [403, 'forbidden']; { const day = b.day || TODAY; return stationPriorities(Object.assign({}, C, { today: day, sales: C.sales.filter(s => s.date < day), openDates: C.openDates.filter(d => d < day), salesAll: b.day ? C.sales : null })) }
  }
  return [400, 'bad_op']
}
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
async function page() {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true }, ENGINE === 'webkit' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
  const pg = await ctx.newPage(); pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'en'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(800)
  return pg
}
{ const pg = await page()
  await pg.click('button[data-a="openSmart"]'); await pg.locator('#main .sc').first().waitFor({ timeout: 10000 })
  const txt = await pg.locator('#main').innerText()
  ok((await pg.locator('#main h1').innerText()) === "Today's Priorities" && await pg.locator('#main .sc').count() === 4, 'My Shift → Pasta Station → Today\'s Priorities: 4 cards')
  ok(/Thaw 23 Lobsters/.test(txt) && /Pull 3\.2 kg Shrimp|Pull 3,2 kg Shrimp/.test(txt) && /Check Gnocco dough/.test(txt) && /Make Arrabbiata/.test(txt), 'cards: Thaw 23 Lobsters · Pull 3.2 kg Shrimp · Check Gnocco dough · Make Arrabbiata')
  ok(/Estimate/.test(txt) && /Smart checklist/i.test(txt) && /Production/i.test(txt) && /Check/i.test(txt), 'each card says its type (Check / Smart checklist / Production) and Estimate')
  ok(/Simulation: ticks and counts stay on this phone/.test(txt) && /travis zulfer/.test(txt) && /not included/.test(txt), 'simulation notice; event shown as not included')
  await pg.screenshot({ path: `${OUT}/${P}1_priorities.png` })
  // Why?
  await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
  const w = await pg.locator('#main .sc').first().locator('details.scw').innerText()
  ok(/mean of the last 4 same weekdays/.test(w) && /ADD LOBSTER/.test(w) && /sold/.test(w), 'Why? shows method, last 4 Saturdays and the dishes')
  await pg.screenshot({ path: `${OUT}/${P}2_why.png` })
  // tick, change amount, count ready
  await pg.locator('#main button[data-a="scDone"][data-k="lobster"]').click(); await pg.waitForTimeout(200)
  ok(/Done · 23/.test(await pg.locator('#main .sc').first().innerText()), 'one tap: lobster done')
  await pg.locator('#main button[data-a="scEdit"][data-k="shrimp"]').click(); await pg.waitForTimeout(150)
  await pg.fill('#sc-shrimp', '2.7'); await pg.locator('#main button[data-a="scSave"][data-k="shrimp"]').click(); await pg.waitForTimeout(200)
  ok(/Done · 2[.,]7 kg/.test(await pg.locator('#main .sc').nth(1).innerText()), 'shrimp: amount corrected to 2.7 kg and done')
  await pg.locator('#main button[data-a="scAnswer"][data-k="gnocco"][data-v="ok"]').click(); await pg.waitForTimeout(200)
  await pg.fill('#sc-r-arrabbiata', '9'); await pg.locator('#main button[data-a="scReady"][data-k="arrabbiata"]').click(); await pg.waitForTimeout(200)
  const a = await pg.locator('#main .sc').nth(3).innerText(), mk = toMake(arr, 9000)
  ok(a.includes(`Make ${mk.batches} batch`) && /Counted/.test(a), `Arrabbiata: 9 kg counted ready → make ${mk.batches} batch(es) (same as the engine)`)
  await pg.locator('#main .sc').nth(3).scrollIntoViewIfNeeded(); await pg.waitForTimeout(200)
  await pg.screenshot({ path: `${OUT}/${P}3_ticked.png` })
  // ticks stay on the phone; nothing sent
  ok(!calls.some(c => /^(act|mre_save|mre_publish|mre_discard|mre_production|mre_prepare)/.test(c)), `no write call (${[...new Set(calls)].join(', ')})`)
  const kept = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('brigade-app-ui:smart:')))
  ok(kept.length === 1, `ticks kept on this phone only (${kept[0]})`)
  // past day
  await pg.locator('#main button[data-a="scDay"]').nth(1).click(); await pg.locator('#main .sc').first().waitFor(); await pg.waitForTimeout(300)
  await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
  ok(/Really sold that day/.test(await pg.locator('#main .sc').first().innerText()), 'past Friday: suggestion compared with what was really sold')
  await pg.screenshot({ path: `${OUT}/${P}4_past.png` })
  const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'no sideways scroll')
  await pg.context().close() }
role = 'staff'; calls.length = 0
{ const pg = await page()
  ok(await pg.locator('button[data-a="openSmart"]').count() === 0 && !calls.includes('smart_checklist'), 'staff: not visible yet (Chef only in phase 1)')
  await pg.context().close() }
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
