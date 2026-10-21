// R1.18 — Chef 21/10 "VELOCITÀ DEL RICETTARIO": measure the REAL recipe book (Safari engine, iPhone 13 size, real server, Chef test session).
// Read-only: every write is BLOCKED (nothing is saved). Usage: node speed_measure.mjs <tokenFile> <outJson> [label]   (LOCAL_WEB=dir → local build under the published address)
import { webkit, devices } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [TOKF, OUT, LABEL] = process.argv.slice(2), tok = fs.readFileSync(TOKF, 'utf8').trim()
const READS = new Set(['me', 'shift', 'mre_list', 'mre_recipe', 'mre_ingredients', 'ingredients', 'knowledge', 'mre_purchase_match', 'recipe', 'recipes', 'prep'])
const R = { label: LABEL || '', at: new Date().toISOString(), blocked: [], req: [], t: {} }
const br = await webkit.launch(), ctx = await br.newContext({ ...devices['iPhone 13'] })
if (process.env.LOCAL_WEB) {
  const types = { js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' }
  await ctx.route('https://1cos.github.io/brigade-app/**', r => { const f = new URL(r.request().url()).pathname.replace('/brigade-app/', '') || 'index.html', fp = process.env.LOCAL_WEB + '/' + f
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) }) })
}
await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
await ctx.route(u => u.pathname === '/functions/v1/brigade-app-api', async r => {
  if (r.request().method() !== 'POST') return r.continue()
  const b = JSON.parse(r.request().postData() || '{}'), t0 = Date.now()
  if (!READS.has(b.op)) { R.blocked.push(b.op); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"blocked_by_test"}' }) }
  let res; try { res = await r.fetch() } catch (e) { return r.abort().catch(() => {}) }
  R.req.push({ op: b.op, id: b.id || null, ms: Date.now() - t0, region: res.headers()['x-sb-edge-region'] || null })
  return r.fulfill({ response: res }).catch(() => {})
})
await ctx.addInitScript(T => { localStorage.setItem('brigade-app-token', T); localStorage.setItem('brigade-app-lang', 'en'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, tok)
const pg = await ctx.newPage(); pg.on('pageerror', e => R.blocked.push('JSERR ' + e.message))
const until = async (fn, max = 30000) => { const t0 = Date.now(); for (;;) { if (await fn()) return Date.now() - t0; if (Date.now() - t0 > max) return null; await pg.waitForTimeout(10) } }
const rows = () => pg.locator('#main .rm-row').count()
const IDS = { spin: '9cec677b-55d6-4329-9dae-5dd4d489e147', pos: 'b0490000-0000-4000-8000-0000000000a1', wheel: '5479387e-e4ad-4401-92ce-9cb785ef4a0d' }
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
R.build = await pg.evaluate(() => (window.APP_CONFIG || {}).build)
// 1. list, first time
let t0 = Date.now(); await pg.click('button.w[data-w="restaurant"]'); await until(async () => (await rows()) > 50); R.t.list_first = Date.now() - t0
R.t.list_rows = await rows()
// 2. search while typing (iPhone-like 150 ms per letter): time from the last letter until the list shows only the matches
const typeAndWait = async (q, expectName) => { await pg.fill('#q', ''); await pg.waitForTimeout(400); await pg.click('#q')
  for (const ch of q) { await pg.keyboard.type(ch); await pg.waitForTimeout(150) }
  const t1 = Date.now(); const w = await until(async () => { const n = await pg.locator('#main .rm-row .name').allInnerTexts(); return n.length > 0 && n.length < 20 && n.some(x => x.toLowerCase().includes(expectName)) }, 10000)
  return w == null ? null : w + 0 }
R.t.search_spinach_after_last_letter = await typeAndWait('spinach', 'spinach')
R.t.search_pos_alias = await typeAndWait('marg', 'marg')
// render cost of one search keystroke (main thread)
// one letter → list redrawn (debounce + drawing), measured inside the page
R.t.search_one_letter_ms = await pg.evaluate(async () => { const i = document.getElementById('q'); i.value = ''; i.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 500))
  const n0 = document.querySelectorAll('#main .rm-row').length, t = performance.now(); i.value = 'p'; i.dispatchEvent(new Event('input'))
  for (;;) { await new Promise(r => requestAnimationFrame(r)); if (document.querySelectorAll('#main .rm-row').length !== n0) return Math.round(performance.now() - t); if (performance.now() - t > 5000) return null } })
// 3. open recipes one after the other (tap in the list → ingredients visible)
const openById = async (k, id, dwell = 0) => { if (dwell) await pg.waitForTimeout(dwell); await pg.click('button.w[data-w="restaurant"]'); await until(async () => (await rows()) > 0); await pg.fill('#q', ''); await pg.waitForTimeout(300)
  const sel = `#main .rm-row[data-r="${id}"]`; await pg.locator(sel).scrollIntoViewIfNeeded(); const t1 = Date.now(); await pg.click(sel)
  const w = await until(async () => (await pg.locator('#main .mr-ings').count()) > 0); R.t['open_' + k] = w == null ? null : Date.now() - t1 }
await openById('spin_first', IDS.spin); await openById('pos_first', IDS.pos); await openById('wheel_first', IDS.wheel)
await openById('spin_again', IDS.spin)
// 4. next recipe in the list order (the review flow: one after the other)
const L = await pg.evaluate(() => ((window.AppApi.peek('mre_list') || {}).recipes || []).filter(r => !r.archived).map(r => r.id))
const k0 = L.indexOf(IDS.wheel); for (let i = 1; i <= 3; i++) await openById('next' + i, L[k0 + i], 4000)   // the Chef reads the recipe ~4 s, then the next one
// 5. second start of the app (as when the Chef opens it again)
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
t0 = Date.now(); await pg.click('button.w[data-w="restaurant"]'); await until(async () => (await rows()) > 50); R.t.list_after_restart = Date.now() - t0
const cnt = {}; R.req.forEach(x => { cnt[x.op] = (cnt[x.op] || 0) + 1 }); R.count = cnt
const byOp = {}; R.req.forEach(x => (byOp[x.op] ||= []).push(x.ms)); R.server_ms = byOp
R.regions = [...new Set(R.req.map(x => x.region))]
fs.writeFileSync(OUT, JSON.stringify(R, null, 1)); await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await br.close()
console.log(JSON.stringify({ build: R.build, t: R.t, count: R.count, regions: R.regions, blocked: R.blocked }))
