// R1.11 Progressive Trust — screen test on READ-ONLY dumps of live Brigade (tests/checklist_dump.mjs).
// API answered in memory by the SAME engine the server runs (checklist_core.js). iPhone size, Chef and staff.
// Usage: [BROWSER=webkit] node tests/checklist_mock.mjs <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import { loadC } from './checklist_dump.mjs'
import { stationPriorities, GATES, STEPS, MARGINS } from '../supabase/functions/_shared/checklist_core.js'
const [OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const C = loadC(), ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const TODAY = '2026-10-16'
const run = (day, past, station) => stationPriorities(Object.assign({}, C, { station: station || 'pasta', today: day, sales: C.sales.filter(s => s.date < day), openDates: C.openDates.filter(d => d < day), salesAll: past ? C.sales : null }))
const R = run(TODAY), by = k => R.items.find(c => c.key === k)
let role = 'chef', forceLevel = null; const calls = []
function api(op, b) {
  const chef = role === 'chef'; calls.push(op)
  const u = chef ? { id: 1, name: 'Max', role: 'chef', lang: 'en', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'en', station: 'Pasta Station' }
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: TODAY, plan_date: TODAY, user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'office': return chef ? { checked_at: new Date().toISOString(), today: TODAY, decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 0, review: 0 } } } : [403, 'forbidden']
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'smart_checklist': if (!chef) return [403, 'forbidden']; { if (b.station && !['pasta', 'oven', 'tableside'].includes(b.station)) return [400, 'bad_station']; const r = run(b.day || TODAY, !!b.day, b.station); return Object.assign(r, { level: forceLevel || 1, steps: STEPS, gates: GATES, margins: MARGINS }) }
  }
  return [400, 'bad_op']
}
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
async function page(init) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true }, ENGINE === 'webkit' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
  const pg = await ctx.newPage(); pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(x => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'en'); if (x) Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, v)); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, init || null)
  await pg.goto('http://127.0.0.1:8791/index.html' + (init && init.__q ? init.__q : '')); await pg.waitForTimeout(800)
  return pg
}
const open = async (pg, st = 'pasta') => { await pg.click(`button[data-a="openSmart"][data-v="${st}"]`); await pg.locator('#main .sc').first().waitFor({ timeout: 10000 }) }
{ const pg = await page(); await open(pg)
  const txt = await pg.locator('#main').innerText()
  ok((await pg.locator('#main h1').innerText()) === "Today's Checklist" && await pg.locator('#main .sc').count() === 4 && /Pasta Station/i.test(txt), "My Shift → Pasta Station → Today's Checklist: 4 questions")
  const L = by('lobster')
  ok(txt.includes(`Do we have ${L.qty} lobsters ready for today?`) && /Do we have 1 kg Gnocco dough ready for today\?/.test(txt) && /Do we have 11 kg Arrabbiata ready for today\?/.test(txt) && /Do we have 3[.,]75 kg shrimp ready for today\?/.test(txt) && !/tomorrow|pulled/i.test(txt), `questions: "${L.qty} lobsters ready for today?", shrimp/gnocco/arrabbiata for today (no "for tomorrow")`)
  ok(await pg.locator('#main .sc button[data-a="scDone"]').count() === 4 && await pg.locator('#main .sc input').count() === 0, 'one tick per question, no quantity to type')
  ok(/Thaw this morning \(about 15 min\)/.test(txt) && !/Thaw \d+ Lobsters|tonight/i.test(txt), 'lobster: thaw the same morning (no day-ahead thaw, no "tonight")')
  ok(!/Production|Smart checklist|Estimate|batch/i.test(txt.split('Why?')[0]), 'no technical labels on the cards (type, status, batch)')
  ok(/ticks stay on this phone only and are not saved/.test(txt), 'simulation notice: ticks are not saved')
  await pg.screenshot({ path: `${OUT}/${P}1_chef.png` })
  await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
  const w = await pg.locator('#main .sc').first().locator('details.scw').innerText()
  ok(/\+ 25% margin \(Friday\)/.test(w) && /ADD LOBSTER/.test(w) && /sold/.test(w), 'Chef Why?: last 4 Fridays, +25% Friday margin, dishes')
  await pg.screenshot({ path: `${OUT}/${P}2_why.png` })
  await pg.locator('#main button[data-a="scDone"][data-k="lobster"]').click(); await pg.waitForTimeout(200)
  await pg.locator('#main button[data-a="scDone"][data-k="arrabbiata"]').click(); await pg.waitForTimeout(200)
  ok(/✓ Ready/.test(await pg.locator('#main .sc').first().innerText()) && /2 of 4 ready/.test(await pg.locator('#main').innerText()), 'one tap → Ready; header 2 of 4 ready')
  await pg.locator('#main button[data-a="scUndo"][data-k="arrabbiata"]').click(); await pg.waitForTimeout(200)
  ok(/1 of 4 ready/.test(await pg.locator('#main').innerText()), 'Undo works')
  // cook view: what Pablo would see
  await pg.locator('#main button[data-a="scView"][data-v="1"]').click(); await pg.waitForTimeout(200)
  const ct = await pg.locator('#main').innerText()
  ok(await pg.locator('#main details.scw').count() === 0 && !/Events|travis|margin|Why\?/.test(ct) && await pg.locator('#main button[data-a="scDay"]').count() === 0, 'Cook view: no Why?, no events, no past days')
  await pg.screenshot({ path: `${OUT}/${P}3_cook_view.png` })
  await pg.locator('#main button[data-a="scView"][data-v=""]').click(); await pg.waitForTimeout(200)
  ok(!calls.some(c => /^(act|mre_save|mre_publish|mre_discard|mre_production|mre_prepare)/.test(c)), `no write call (${[...new Set(calls)].join(', ')})`)
  const kept = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('brigade-app-ui:smart:')))
  ok(kept.length === 1, `ticks kept on this phone only (${kept[0]})`)
  await pg.locator('#main button[data-a="scDay"]').nth(1).click(); await pg.locator('#main .sc').first().waitFor(); await pg.waitForTimeout(300)
  await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
  ok(/Really sold that day/.test(await pg.locator('#main .sc').first().innerText()), 'past Friday: suggestion compared with what was really sold')
  await pg.screenshot({ path: `${OUT}/${P}4_past.png` })
  const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'no sideways scroll')
  await pg.context().close() }
// Oven and Table Side: the fish in the station that owns the prep, no duplicates
{ const pg = await page()
  ok(await pg.locator('button[data-a="openSmart"]').count() === 3, 'My Shift (Chef): one checklist row per station (Pasta, Oven, Table Side)')
  await open(pg, 'oven'); const o = await pg.locator('#main').innerText(), O = run(TODAY, false, 'oven')
  const cq = O.items.find(c => c.key === 'calamari').qty / 1000, sq = O.items.find(c => c.key === 'salmon').qty
  ok(/Oven Station/i.test(o) && await pg.locator('#main .sc').count() === 3 && o.includes(`Do we have ${String(cq).replace('.', '.')} kg calamari ready for today?`) && o.includes(`Do we have ${sq} salmon filets (200 g) ready for today?`) && o.includes(`Do we have ${O.items.find(c => c.key === 'branzino_filet').qty} branzino filets for the Siciliana ready for today?`) && !/lobster|shrimp|whole branzino/i.test(o.split('Why?')[0]), `Oven: calamari ${cq} kg + ${sq} salmon filets (200 g) + branzino filets for the Siciliana (Siciliana × 1 filet), for today; no Pasta or Table Side items`)
  ok(!/Chef's reference|No POS number/.test((await pg.locator('#main .sc[data-k="branzino_filet"]').innerText()).split('Why?')[0]), 'Oven: branzino filets asked with the POS number; the Chef reference is no longer on the card')
  const card = k => pg.locator(`#main .sc[data-k="${k}"]`).innerText()
  ok(/Thaw time: about 20 min/.test(await card('salmon')) && /Thaw time: about 10 min/.test(await card('branzino_filet')) && !/Thaw|min\b/.test(await card('calamari')), 'thaw: salmon about 20 min, branzino filets about 10 min, calamari none')
  await pg.locator('#main .sc[data-k="salmon"] summary').click(); await pg.waitForTimeout(150)
  ok(/not an HACCP validation/.test(await card('salmon')) && /Salmon Pistachio: off the menu/.test(await card('salmon')), 'salmon Why?: HACCP note and Salmon Pistachio off the menu')
  ok(/Sold but not counted/.test(await card('salmon')) && /Salmon whole\s+1×\s+add-on, quantity not mapped/.test(await card('salmon')), 'salmon Why?: unmapped add-on "Salmon whole" listed with its sales (Chef review)')
  await pg.locator('#main .sc[data-k="branzino_filet"] summary').click(); await pg.waitForTimeout(150)
  const bft = await card('branzino_filet')
  ok(/Chef 16\/10: 1 filet per Siciliana/.test(bft) && /Chef's reference, for comparison: about 10/.test(bft) && /whole fish if filleted today/.test(bft), 'branzino filets Why?: 1 filet per Siciliana (Chef), reference for comparison, whole-fish equivalent')
  await pg.locator('#main .sc[data-k="branzino_filet"]').screenshot({ path: `${OUT}/${P}6b_branzino_why.png` })
  await pg.screenshot({ path: `${OUT}/${P}6_oven.png` })
  await pg.locator('#main button[data-a="scDone"][data-k="calamari"]').click(); await pg.waitForTimeout(200)
  const keys = await pg.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('brigade-app-ui:smart:')).map(([k, v]) => Object.keys(JSON.parse(v))).flat())
  ok(keys.join() === 'calamari', `Oven tick kept on this phone only (${keys.join()})`)
  await pg.click('#main button[data-a="toOrigin"]'); await pg.waitForTimeout(400)
  await open(pg, 'tableside'); const tt = await pg.locator('#main').innerText()
  ok(/Table Side/i.test(tt) && await pg.locator('#main .sc').count() === 1 && /Do we have \d+ whole branzino \(gutted and cleaned\) ready for today\?/.test(tt) && !/filet/i.test((await pg.locator('#main .sc').first().innerText()).split('Why?')[0]) && /asked once, in Oven/.test(tt) && !/to confirm/i.test(tt), 'Table Side: only the whole branzino, gutted and cleaned, for today; filets not asked here')
  await pg.screenshot({ path: `${OUT}/${P}7_tableside.png` })
  await pg.locator('#main button[data-a="scView"][data-v="1"]').click(); await pg.waitForTimeout(200)
  const tc = await pg.locator('#main').innerText()
  ok(!/No amount|Filleting|Why\?/i.test(tc), 'Table Side cook view: no technical notes')
  const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'no sideways scroll (Table Side)')
  await pg.context().close() }
// Step 2 cannot be switched on from the phone: local storage / URL tampering keeps step 1
{ const pg = await page({ 'brigade-app-ui:smart:level': '2', 'brigade-app-level': '2', __q: '?level=2&step=2' }); await open(pg)
  ok(await pg.locator('#main .sc input').count() === 0 && await pg.locator('#main button[data-a="scDone"]').count() === 4, 'tampering with storage/URL → still step 1 (the level comes only from the server)')
  await pg.context().close() }
// Step 2 is built: drawn only if the server says level 2 (it never does today)
forceLevel = 2
{ const pg = await page(); await open(pg)
  ok(await pg.locator('#main .sc input').count() === 4 && /How many lobsters are ready\?/.test(await pg.locator('#main').innerText()), 'Step 2 (prepared): "How many lobsters are ready?" when the server says level 2')
  await pg.fill('#sc-r-lobster', '20'); await pg.locator('#main button[data-a="scCount"][data-k="lobster"]').click(); await pg.waitForTimeout(200)
  ok((await pg.locator('#main .sc').first().innerText()).includes(`${by('lobster').qty - 20} more needed`), `Step 2: 20 counted → ${by('lobster').qty - 20} more needed`)
  await pg.screenshot({ path: `${OUT}/${P}5_step2_prepared.png` })
  await pg.context().close() }
forceLevel = 3
{ const pg = await page(); await open(pg)
  ok(await pg.locator('#main .sc input').count() === 4, 'level 3 from the server is capped at step 2 on screen (step 3 has no screen)')
  await pg.context().close() }
forceLevel = null; role = 'staff'; calls.length = 0
{ const pg = await page()
  ok(await pg.locator('button[data-a="openSmart"]').count() === 0 && !calls.includes('smart_checklist'), 'staff: not visible (no activation without a new GO)')
  await pg.context().close() }
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
