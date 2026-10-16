// B-51 Smart Checklist R1.11 Progressive Trust — LIVE: real API (read only op) vs the same engine on dumps read just before,
// then the PUBLISHED site in WebKit on an iPhone screen. Ticks stay on the test browser; nothing is written.
// Usage: node tests/checklist_live.mjs <chefTokenFile> <staffTokenFile> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import { loadC } from './checklist_dump.mjs'
import { stationPriorities } from '../supabase/functions/_shared/checklist_core.js'
const [tc, ts, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim() }
const API = 'https://ydqmumpytgrlceuinoqt.supabase.co/functions/v1/brigade-app-api'
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
async function call(who, op, body = {}) { const t0 = Date.now(); const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + TOK[who] } : {}) }, body: JSON.stringify({ op, ...body }) }); let j = null; try { j = await r.json() } catch (e) {}; return { status: r.status, j, ms: Date.now() - t0 } }
const C = loadC(), today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
let r = await call(null, 'ping'); ok(r.j.build === 'api-r1.11.3-addons', `ping: ${r.j.build}`)
r = await call(null, 'smart_checklist'); ok(r.status === 401, 'no session → 401')
r = await call('staff', 'smart_checklist'); ok(r.status === 403, `staff → ${r.status} (not activated for the brigade)`)
r = await call('chef', 'smart_checklist', { station: 'pasta', level: 3, step: 2, gates: { step2: true, staffVisible: true } }); ok(r.status === 200 && r.j.level === 1 && r.j.items.every(c => c.level === 1) && !r.j.gates.step2 && !r.j.gates.staffVisible && !r.j.gates.step3, 'request asking for level 2/3 or switches on → level 1, switches off')
r = await call('chef', 'smart_checklist', { station: 'grill' }); ok(r.status === 400, `other station → ${r.status}`)
const strip = x => JSON.parse(JSON.stringify(x, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v))
for (const day of [null, '2026-10-09', '2026-10-10']) {
  const g = await call('chef', 'smart_checklist', day ? { station: 'pasta', day } : { station: 'pasta' })
  const d = day || today
  const e = stationPriorities(Object.assign({}, C, { today: d, sales: C.sales.filter(s => s.date < d), openDates: C.openDates.filter(x => x < d), salesAll: day ? C.sales : null }))
  // events come from the live table for the next 7 days of THAT day: compare items only when the dump covers it
  const same = g.status === 200 && JSON.stringify(strip(g.j.items)) === JSON.stringify(strip(e.items))
  if (!same && g.status === 200) g.j.items.forEach((c, i) => { if (JSON.stringify(strip(c)) !== JSON.stringify(strip(e.items[i]))) console.log('   diff', c.key, JSON.stringify(strip(c)).slice(0, 300), '\n   exp ', JSON.stringify(strip(e.items[i])).slice(0, 300)) })
  ok(same, `${day ? 'past day ' + day : 'today ' + today}: live = engine on the data just read (${g.ms} ms) · ${g.j.items.map(c => `${c.key} ${c.qty} for ${c.for_day.weekday} +${c.why.margin}%${c.actual != null ? ' (sold ' + c.actual + ')' : ''}`).join(', ')}`)
}
for (const st of ['oven', 'tableside']) {
  const g = await call('chef', 'smart_checklist', { station: st }), e = stationPriorities(Object.assign({}, C, { station: st, today, sales: C.sales.filter(s => s.date < today), openDates: C.openDates.filter(x => x < today) }))
  ok(g.status === 200 && JSON.stringify(strip(g.j.items)) === JSON.stringify(strip(e.items)), `${st} today: live = engine (${g.j.items.map(c => `${c.key} ${c.qty}`).join(', ')})`)
}
// published site, WebKit on an iPhone screen
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const pg = await ctx.newPage(); const ops = []
pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
pg.on('request', q => { if (/brigade-app-api/.test(q.url())) { try { ops.push(JSON.parse(q.postData() || '{}').op) } catch (e) {} } })
await pg.addInitScript(t => { localStorage.setItem('brigade-app-token', t); localStorage.setItem('brigade-app-lang', 'en') }, TOK.chef)
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForTimeout(4000)
const t0 = Date.now(); await pg.click('button[data-a="openSmart"][data-v="pasta"]'); await pg.locator('#main .sc').first().waitFor({ timeout: 20000 }); const tOpen = Date.now() - t0
const txt = await pg.locator('#main').innerText()
ok((await pg.locator('#main h1').innerText()) === "Today's Checklist" && await pg.locator('#main .sc').count() === 4, `site: My Shift → Pasta Station → Today's Checklist, 4 questions in ${tOpen} ms`)
ok(/Do we have \d+ lobsters ready for today\?/.test(txt) && /Do we have [\d.,]+ kg shrimp ready for today\?/.test(txt) && !/tomorrow|pulled/i.test(txt) && /Gnocco dough ready/.test(txt) && /Arrabbiata ready/.test(txt) && /not saved/.test(txt) && await pg.locator('#main .sc input').count() === 0, 'site: 4 questions, one tick each, no quantity to type, simulation notice')
await pg.screenshot({ path: `${OUT}/1_site_checklist.png` })
await pg.locator('#main button[data-a="scDone"][data-k="lobster"]').click(); await pg.waitForTimeout(300)
ok(/✓ Ready/.test(await pg.locator('#main .sc').first().innerText()), 'site: one tap → Ready (on this phone only)')
await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
ok(/mean of the last 4 same weekdays/.test(await pg.locator('#main .sc').first().innerText()), 'site: Chef Why? opens')
await pg.screenshot({ path: `${OUT}/2_site_why.png` })
await pg.locator('#main button[data-a="scView"][data-v="1"]').click(); await pg.waitForTimeout(300)
ok(await pg.locator('#main details.scw').count() === 0, 'site: Cook view without Why?')
await pg.screenshot({ path: `${OUT}/3_site_cook.png` })
await pg.locator('#main button[data-a="scView"][data-v=""]').click(); await pg.waitForTimeout(300)
await pg.locator('#main button[data-a="scDay"]').nth(1).click(); await pg.locator('#main .sc').first().waitFor({ timeout: 20000 }); await pg.waitForTimeout(500)
await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
ok(/Really sold that day/.test(await pg.locator('#main .sc').first().innerText()), 'site: past Friday compared with what was really sold')
await pg.screenshot({ path: `${OUT}/4_site_past.png` })
ok(!ops.some(o => /^(act|mre_save|mre_publish|mre_discard|mre_production|mre_prepare)/.test(o)), `site: no write call (${[...new Set(ops)].join(', ')})`)
const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'site: no sideways scroll')
await pg.click('#main button[data-a="toOrigin"]'); await pg.waitForTimeout(500)
await pg.click('button[data-a="openSmart"][data-v="oven"]'); await pg.locator('#main .sc').first().waitFor({ timeout: 20000 })
const ov = await pg.locator('#main').innerText()
ok(/calamari ready for today\?/.test(ov) && /salmon filets \(200 g\) ready for today\?/.test(ov) && /Do we have \d+ branzino filets for the Siciliana ready for today\?/.test(ov) && await pg.locator('#main .sc').count() === 3, 'site: Oven Station — calamari, salmon filets (200 g), branzino filets for the Siciliana with a POS number (1 filet per Siciliana)')
await pg.screenshot({ path: `${OUT}/5_site_oven.png` })
await pg.click('#main button[data-a="toOrigin"]'); await pg.waitForTimeout(500)
await pg.click('button[data-a="openSmart"][data-v="tableside"]'); await pg.locator('#main .sc').first().waitFor({ timeout: 20000 })
const tsd = await pg.locator('#main').innerText()
ok(/whole branzino \(gutted and cleaned\) ready for today\?/.test(tsd) && await pg.locator('#main .sc').count() === 1, 'site: Table Side — only the whole branzino, gutted and cleaned')
await pg.screenshot({ path: `${OUT}/6_site_tableside.png` })
ok(!ops.some(o => /^(act|mre_save|mre_publish|mre_discard|mre_production|mre_prepare)/.test(o)), 'site: still no write call after the 3 stations')
await b.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
