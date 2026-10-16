// B-51 Smart Checklist phase 1 — LIVE: real API (read only op) vs the same engine on dumps read just before,
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
let r = await call(null, 'ping'); ok(r.j.build === 'api-r1.11-trust', `ping: ${r.j.build}`)
r = await call(null, 'smart_checklist'); ok(r.status === 401, 'no session → 401')
r = await call('staff', 'smart_checklist'); ok(r.status === 403, `staff → ${r.status} (Chef only in phase 1)`)
r = await call('chef', 'smart_checklist', { station: 'grill' }); ok(r.status === 400, `other station → ${r.status}`)
const strip = x => JSON.parse(JSON.stringify(x, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v))
for (const day of [null, '2026-10-09', '2026-10-10']) {
  const g = await call('chef', 'smart_checklist', day ? { station: 'pasta', day } : { station: 'pasta' })
  const d = day || today
  const e = stationPriorities(Object.assign({}, C, { today: d, sales: C.sales.filter(s => s.date < d), openDates: C.openDates.filter(x => x < d), salesAll: day ? C.sales : null }))
  // events come from the live table for the next 7 days of THAT day: compare items only when the dump covers it
  const same = g.status === 200 && JSON.stringify(strip(g.j.items)) === JSON.stringify(strip(e.items))
  if (!same && g.status === 200) g.j.items.forEach((c, i) => { if (JSON.stringify(strip(c)) !== JSON.stringify(strip(e.items[i]))) console.log('   diff', c.key, JSON.stringify(strip(c)).slice(0, 300), '\n   exp ', JSON.stringify(strip(e.items[i])).slice(0, 300)) })
  ok(same, `${day ? 'past day ' + day : 'today ' + today}: live = engine on the data just read (${g.ms} ms) · ${g.j.items.map(c => `${c.key} ${c.qty ?? Math.round(c.need)}${c.actual ? ' (sold ' + c.actual.map(a => a.amount).join('+') + ')' : ''}`).join(', ')}`)
}
// published site, WebKit on an iPhone screen
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
const pg = await ctx.newPage(); const ops = []
pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
pg.on('request', q => { if (/brigade-app-api/.test(q.url())) { try { ops.push(JSON.parse(q.postData() || '{}').op) } catch (e) {} } })
await pg.addInitScript(t => { localStorage.setItem('brigade-app-token', t); localStorage.setItem('brigade-app-lang', 'en') }, TOK.chef)
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForTimeout(4000)
const t0 = Date.now(); await pg.click('button[data-a="openSmart"]'); await pg.locator('#main .sc').first().waitFor({ timeout: 20000 }); const tOpen = Date.now() - t0
const txt = await pg.locator('#main').innerText()
ok((await pg.locator('#main h1').innerText()) === "Today's Priorities" && await pg.locator('#main .sc').count() === 4, `site: My Shift → Pasta Station → Today's Priorities, 4 cards in ${tOpen} ms`)
ok(/Thaw \d+ Lobsters/.test(txt) && /Pull [\d.,]+ kg Shrimp/.test(txt) && /Check Gnocco dough/.test(txt) && /Make Arrabbiata/.test(txt) && /Simulation/.test(txt), 'site: the 4 priorities and the simulation notice')
await pg.screenshot({ path: `${OUT}/1_site_priorities.png` })
await pg.locator('#main button[data-a="scDone"][data-k="lobster"]').click(); await pg.waitForTimeout(300)
ok(/Done/.test(await pg.locator('#main .sc').first().innerText()), 'site: one tap done (on this phone only)')
await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
ok(/mean of the last 4 same weekdays/.test(await pg.locator('#main .sc').first().innerText()), 'site: Why? opens')
await pg.screenshot({ path: `${OUT}/2_site_done_why.png` })
await pg.locator('#main button[data-a="scDay"]').nth(1).click(); await pg.locator('#main .sc').first().waitFor({ timeout: 20000 }); await pg.waitForTimeout(500)
await pg.locator('#main .sc').first().locator('details.scw > summary').click(); await pg.waitForTimeout(200)
ok(/Really sold that day/.test(await pg.locator('#main .sc').first().innerText()), 'site: past Friday compared with what was really sold')
await pg.screenshot({ path: `${OUT}/3_site_past.png` })
ok(!ops.some(o => /^(act|mre_save|mre_publish|mre_discard|mre_production|mre_prepare)/.test(o)), `site: no write call (${[...new Set(ops)].join(', ')})`)
const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'site: no sideways scroll')
await b.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
