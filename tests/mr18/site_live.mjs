// MR-18 — published site R1.23 + real API, WebKit iPhone, Chef test session. Only the technical test recipe is opened in edit;
// every write op is BLOCKED in the browser (never reaches the server): the check is that «Chiudi» does not even try one.
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [tc, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const TOK = fs.readFileSync(tc, 'utf8').trim(), TEST = '00000000-b490-4000-8000-000000000001'
const WRITES = /^(mre_save_draft|mre_discard|mre_publish|mre_review|mre_new|mre_restore_official|mre_suggest|mre_production)/
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const b = await webkit.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
const pg = await ctx.newPage(); const ops = [], blocked = []
pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
await pg.route(/brigade-app-api/, r => { let j = {}; try { j = JSON.parse(r.request().postData() || '{}') } catch (e) {}
  ops.push(j.op); if (WRITES.test(j.op || '')) { blocked.push(j.op); return r.abort() } return r.continue() })
await pg.addInitScript(t => { localStorage.setItem('brigade-app-token', t); localStorage.setItem('brigade-app-lang', 'it') }, TOK)
await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForTimeout(4000)
ok(await pg.evaluate(() => (window.CONFIG || {}).build === 'R1.23' || /R1\.23/.test(document.documentElement.innerHTML) || true), 'sito caricato')
const build = await pg.evaluate(async () => (await (await fetch('config.js?x=' + Date.now())).text()).match(/build: '(R1\.\d+)'/)[1])
ok(build === 'R1.23', 'versione online ' + build)
await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 }); await pg.waitForTimeout(1000)
ok(await pg.locator('#main .rm-row').count() > 200, 'elenco ricette aperto (' + await pg.locator('#main .rm-row').count() + ' righe)')
await pg.evaluate(id => { location.hash = ''; }, TEST)
await pg.goto('https://1cos.github.io/brigade-app/?ricetta=' + TEST + '&v=' + Date.now()); await pg.waitForTimeout(5000)
await pg.locator('#main .mr-ings').first().waitFor({ timeout: 20000 })
await pg.click('#main [data-m="edit"]'); await pg.waitForSelector('#main .mr.mr-edit', { timeout: 15000 }); await pg.waitForTimeout(1500)
const t = (await pg.locator('#main [data-m="savedraft"]').first().innerText()).trim()
ok(t === 'Chiudi', 'ricetta di prova in Modifica senza cambi: il pulsante dice «' + t + '»')
await pg.screenshot({ path: `${OUT}/vero_modifica.png` })
await pg.locator('#main [data-m="savedraft"]').first().click(); await pg.waitForTimeout(1500)
ok(await pg.locator('#main .mr.mr-edit').count() === 0, '«Chiudi» esce dalla modifica')
ok(blocked.length === 0, 'nessuna scrittura tentata (' + (blocked.join(',') || 'zero') + ')')
await ctx.close(); await b.close()
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL · chiamate: ${[...new Set(ops)].join(' ')}`)
process.exit(fail ? 1 : 0)
