// R1.18 — screenshots of real recipes in a given language (read-only, every write blocked). node lang_shots.mjs <tok> <outDir> <lang> <id,id,...>
import { webkit, devices } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [TOKF, OUT, LANG, IDS] = process.argv.slice(2), tok = fs.readFileSync(TOKF, 'utf8').trim()
const READS = new Set(['me', 'shift', 'mre_list', 'mre_recipe', 'mre_ingredients', 'ingredients', 'knowledge', 'recipe', 'recipes', 'prep'])
const br = await webkit.launch(), ctx = await br.newContext({ ...devices['iPhone 13'] }); const blocked = []
if (process.env.LOCAL_WEB) {
  const types = { js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' }
  await ctx.route('https://1cos.github.io/brigade-app/**', r => { const f = new URL(r.request().url()).pathname.replace('/brigade-app/', '') || 'index.html', fp = process.env.LOCAL_WEB + '/' + f
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: types[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(fp) }) })
}
await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
await ctx.route(u => u.pathname === '/functions/v1/brigade-app-api', async r => { if (r.request().method() !== 'POST') return r.continue()
  const b = JSON.parse(r.request().postData() || '{}'); if (!READS.has(b.op)) { blocked.push(b.op); return r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"blocked_by_test"}' }) } return r.continue() })
await ctx.addInitScript(([T, L]) => { localStorage.setItem('brigade-app-token', T); localStorage.setItem('brigade-app-lang', L); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, [tok, LANG])
const pg = await ctx.newPage(); fs.mkdirSync(OUT, { recursive: true })
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForSelector('button.w[data-w="restaurant"]', { timeout: 30000 })
const res = {}
for (const id of IDS.split(',')) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#main .rm-row', { timeout: 30000 }); await pg.fill('#q', ''); await pg.waitForTimeout(300)
  await pg.click(`#main .rm-row[data-r="${id}"]`); await pg.waitForSelector('#main .mr-ings', { timeout: 30000 }); await pg.waitForTimeout(500)
  await pg.screenshot({ path: `${OUT}/${LANG}_${id.slice(0, 8)}.png`, fullPage: true })
  res[id] = { ings: await pg.locator('#main .mr-ings').innerText(), steps: (await pg.locator('#main .mr-steps').count()) ? await pg.locator('#main .mr-steps').innerText() : '' }
}
fs.writeFileSync(`${OUT}/${LANG}_text.json`, JSON.stringify(res, null, 1)); console.log('blocked', blocked); await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await br.close()
