// R1.16 — Chef 21/10 "BUG CRITICI DELL'EDITOR CHEF": measure the REAL editor experience (Safari engine, iPhone size).
// Target = any site URL (published R1.15, or a local build) + an API (live, or a mock with delay).
// Live safety: every mre_save_draft for the Chef's recipe is REWRITTEN to the lab test recipe (is_test), every other write is BLOCKED.
// Usage: node editor_measure.mjs <siteUrl> <tokenFile|-> <outJson> [mockModule]
import { webkit, devices } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [SITE, TOKF, OUT, MOCK] = process.argv.slice(2)
const POS = 'b0490000-0000-4000-8000-0000000000a1', TEST = '00000000-b490-4000-8000-000000000001'
const READS = new Set(['me', 'shift', 'mre_list', 'mre_recipe', 'mre_ingredients', 'ingredients', 'knowledge', 'mre_purchase_match', 'office', 'catering', 'recipe', 'recipes', 'prep'])
const mock = MOCK ? await import(MOCK) : null
const tok = TOKF && TOKF !== '-' ? fs.readFileSync(TOKF, 'utf8').trim() : 'a'.repeat(64)
const R = { site: SITE, at: new Date().toISOString(), blocked: [], scen: {} }
const br = await webkit.launch(), ctx = await br.newContext({ ...devices['iPhone 13'] })
const pg = await ctx.newPage()
if (process.env.LOCAL_WEB) {   // the NEW build, served under the published address inside this test browser only (nothing is published)
  const types = { js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png' }
  await pg.route('https://1cos.github.io/brigade-app/**', r => { let f = new URL(r.request().url()).pathname.replace('/brigade-app/', '') || 'index.html'; const fp = process.env.LOCAL_WEB + '/' + f
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) }) })
}
await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
await pg.route('**/functions/v1/brigade-app-api', async r => {
  const b = JSON.parse(r.request().postData() || '{}')
  if (mock) return mock.handle(r, b)
  if (b.op === 'mre_save_draft' && b.id === POS) { b.id = TEST; b.base = 3; b.doc = Object.assign({}, b.doc, { id: TEST }); return r.continue({ postData: JSON.stringify(b) }) }
  if (!READS.has(b.op)) { R.blocked.push(b.op); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"blocked_by_test"}' }) }
  return r.continue()
})
await pg.addInitScript(T => {
  localStorage.setItem('brigade-app-token', T); localStorage.setItem('brigade-app-lang', 'en')
  navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve())
  const L = window.__M = { req: [], gaps: [], focusLost: [] }
  const of = window.fetch; window.fetch = async (u, o) => { let op = '?'; try { op = JSON.parse(o.body).op } catch (e) {}
    const e = { op, t0: performance.now() }; L.req.push(e); try { const r = await of(u, o); e.t1 = performance.now(); e.st = r.status; return r } catch (x) { e.t1 = performance.now(); e.st = 0; throw x } }
  let gap = null
  const chk = () => { const has = !!document.querySelector('#main .mr .mr-ings'); if (!has && gap == null && window.__arm) gap = performance.now(); if (has && gap != null) { L.gaps.push({ t0: gap, ms: Math.round(performance.now() - gap) }); gap = null } }
  new MutationObserver(chk).observe(document, { subtree: true, childList: true })
}, tok)
const now = () => pg.evaluate(() => performance.now())
const M = () => pg.evaluate(() => window.__M)
const nLines = () => pg.locator('#main [data-m^="del:"]').count()
const nSteps = () => pg.locator('#main [data-mt^="step:"]').count()
async function waitFor(fn, max = 15000) { const s = Date.now(); while (Date.now() - s < max) { if (await fn()) return Date.now() - s; await pg.waitForTimeout(16) } return null }
async function settle() { await waitFor(async () => (await pg.locator('#main .mr .mr-ings').count()) > 0 && (await pg.evaluate(() => window.__M.req.every(x => x.t1))), 30000); await pg.waitForTimeout(300) }
async function window_(t0) { const m = await M(); return { reqs: m.req.filter(x => x.t0 >= t0).map(x => ({ op: x.op, ms: x.t1 ? Math.round(x.t1 - x.t0) : null, st: x.st })), gaps: m.gaps.filter(g => g.t0 >= t0) } }

let t = Date.now()
await pg.goto(SITE); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 30000 }); await pg.fill('#q', 'butter spinach')
await pg.click('#main .rm-row:has(.name:text-is("Butter Spinach"))'); t = Date.now()
await pg.waitForSelector('.mr-editbtn', { timeout: 30000 }); R.open_ms = Date.now() - t
await pg.click('.mr-editbtn'); await pg.waitForSelector('#mrAdd'); await pg.evaluate(() => { window.__arm = true })
const base = { lines: await nLines(), steps: await nSteps() }; R.base = base

// A — type "nutmeg", time until the suggestions show; ONE tap on Ground Nutmeg, time until the line is visible
await pg.click('#mrAdd'); await pg.keyboard.type('nutmeg', { delay: 120 }); t = Date.now()
R.scen.search_ms = await waitFor(() => pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').count())
let t0 = await now(); t = Date.now(); await pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').first().click()
const vis = await waitFor(async () => (await nLines()) > base.lines)
await pg.waitForTimeout(6000)
R.scen.A_one_tap = { visible_ms: vis, lines_after: await nLines(), ...(await window_(t0)) }; fs.writeFileSync(OUT, JSON.stringify(R, null, 1))

await settle()
// B — what the Chef did: no visible change, so tap again (3 taps, 0.7 s apart)
await pg.click('#mrAdd'); await pg.keyboard.type('nutmeg', { delay: 120 }); await waitFor(() => pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")').count())
const l0 = await nLines(); t0 = await now(); let taps = 0
for (let i = 0; i < 3; i++) { const b = pg.locator('[data-m^="addi:"]:text-is("Ground Nutmeg")'); if (await b.count()) { await b.first().click(); taps++ } await pg.waitForTimeout(700) }
await pg.waitForTimeout(7000)
R.scen.B_three_taps = { taps, lines_added: (await nLines()) - l0, ...(await window_(t0)) }; fs.writeFileSync(OUT, JSON.stringify(R, null, 1))

await settle()
// C — add a step: time until visible, does the recipe section disappear?
const s0 = await nSteps(); t0 = await now()
await pg.click('[data-m="addstep"]'); const sv = await waitFor(async () => (await nSteps()) > s0)
await pg.waitForTimeout(7000)
R.scen.C_add_step = { visible_ms: sv, steps_after: await nSteps(), ...(await window_(t0)) }; fs.writeFileSync(OUT, JSON.stringify(R, null, 1))

// D — write the new step, leave it, and keep writing the next one while the first is saving
await settle()
const si = (await nSteps()) - 1
await pg.click('[data-m="addstep"]'); await waitFor(async () => (await nSteps()) > si + 1, 12000)
t0 = await now()
await pg.click(`[data-mt="step:${si}"]`); await pg.keyboard.type('Primo passo di prova', { delay: 40 })
await pg.click(`[data-mt="step:${si + 1}"]`)               // leaving step 1 saves it
await pg.keyboard.type('Secondo passo scritto mentre salva', { delay: 60 })
const typedAt = await now()
await pg.waitForTimeout(8000)
const st = await pg.evaluate(([a, b]) => { const q = i => document.querySelector(`[data-mt="step:${i}"]`); const ae = document.activeElement
  return { s1: q(a) && q(a).textContent, s2: q(b) && q(b).textContent, focus_on_step2: !!(ae && ae === q(b)), active: ae && (ae.dataset.mt || ae.id || ae.tagName) } }, [si, si + 1])
R.scen.D_write_steps = { ...st, ...(await window_(t0)), typed_until_ms: Math.round(typedAt - t0) }

R.blocked_n = R.blocked.length
fs.writeFileSync(OUT, JSON.stringify(R, null, 1)); await pg.screenshot({ path: OUT.replace(/\.json$/, '.png'), fullPage: true })
await br.close(); console.log(JSON.stringify(R, null, 1))
