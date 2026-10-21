// R1.18 — search by name and POS name on the lab build, real server (read only). The published server (v37) does not send POS names yet:
// here they are added to the real list from the same official column (recipes.pos_name), exactly as the R1.18 server does (bench test D3).
import { webkit, devices } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [TOKF, POSMAP, OUT] = process.argv.slice(2), tok = fs.readFileSync(TOKF, 'utf8').trim(), PM = JSON.parse(fs.readFileSync(POSMAP, 'utf8'))
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const READS = new Set(['me', 'shift', 'mre_list', 'mre_recipe', 'knowledge', 'recipe', 'recipes', 'prep']); const blocked = []
const br = await webkit.launch(), ctx = await br.newContext({ ...devices['iPhone 13'] })
const types = { js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' }
if (process.env.LOCAL_WEB) await ctx.route('https://1cos.github.io/brigade-app/**', r => { const f = new URL(r.request().url()).pathname.replace('/brigade-app/', '') || 'index.html', fp = process.env.LOCAL_WEB + '/' + f
  if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) }) })
await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
await ctx.route(u => u.pathname === '/functions/v1/brigade-app-api', async r => { if (r.request().method() !== 'POST') return r.continue()
  const b = JSON.parse(r.request().postData() || '{}'); if (!READS.has(b.op)) { blocked.push(b.op); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"blocked_by_test"}' }) }
  if (b.op !== 'mre_list') return r.continue().catch(() => {})
  const res = await r.fetch(), j = await res.json()
  j.recipes.forEach(x => { if (PM[x.id] && !x.pos_names) x.pos_names = [...new Set(PM[x.id].split('|').map(s => s.trim()).filter(Boolean))] })
  return r.fulfill({ response: res, body: JSON.stringify(j) }).catch(() => {}) })
await ctx.addInitScript(T => { localStorage.setItem('brigade-app-token', T); localStorage.setItem('brigade-app-lang', 'en'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, tok)
const pg = await ctx.newPage(); pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#main .rm-row', { timeout: 30000 })
const search = async q => { await pg.fill('#q', ''); await pg.waitForTimeout(200); await pg.click('#q'); await pg.keyboard.type(q, { delay: 60 }); await pg.waitForTimeout(250); return (await pg.locator('#main .rm-row').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim()) }
let r = await search('treccia'); ok(r.some(x => /BRAIDED BRANZINO/i.test(x) && /POS · Treccia\/Braided Branzino/.test(x)), 'nome POS "treccia" → BRAIDED BRANZINO, con il nome POS mostrato — ' + JSON.stringify(r))
r = await search('sauteed'); ok(r.some(x => /POS · Sauteed Spinach|POS · Sautéed Spinach/.test(x)), 'senza accento "sauteed" → la ricetta col nome POS "Sautéed Spinach" — ' + JSON.stringify(r))
r = await search('fresh truffle'); ok(r.some(x => /truffle/i.test(x) && /POS · Fresh truffle/.test(x)), '"fresh truffle" → add Truffle — ' + JSON.stringify(r))
r = await search('RAGU'); ok(r.some(x => /^RAGU/i.test(x)) && !r.some(x => /POS ·/.test(x) && /^RAGU/.test(x)), 'per titolo "RAGU": trovata, senza etichetta POS — ' + JSON.stringify(r.slice(0, 4)))
r = await search('zzqx'); ok(r.length === 0, 'niente di inventato per una parola che non esiste')
await pg.screenshot({ path: OUT + '/ricerca_pos.png' }); await search('treccia'); await pg.screenshot({ path: OUT + '/ricerca_treccia.png' })
ok(blocked.length === 0, 'nessuna scrittura tentata')
await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await br.close(); console.log(`# pass ${pass}\n# fail ${fail}`); process.exitCode = fail ? 1 : 0
