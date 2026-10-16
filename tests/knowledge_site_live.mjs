// B-51 phase 1 — the PUBLISHED site (1cos.github.io/brigade-app) with the real API, WebKit (Safari engine) on an iPhone screen.
// Chef and staff test sessions. Read only: opening cards and lists writes nothing.
// Usage: node tests/knowledge_site_live.mjs <chefTokenFile> <staffTokenFile> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [tc, ts, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim() }
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const b = await webkit.launch()
async function open(who) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
  const pg = await ctx.newPage(); const ops = []
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  pg.on('request', r => { if (/brigade-app-api/.test(r.url())) { try { ops.push(JSON.parse(r.postData() || '{}').op) } catch (e) {} } })
  await pg.addInitScript(t => { localStorage.setItem('brigade-app-token', t); localStorage.setItem('brigade-app-lang', 'en') }, TOK[who])
  await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForTimeout(4000)
  return { pg, ops }
}
const H1 = pg => pg.locator('#main h1').first().textContent()
async function card(pg, name) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(1500)
  await pg.click('button[data-a="openIngs"]'); await pg.locator('#q').waitFor({ timeout: 15000 })
  await pg.fill('#q', name); await pg.waitForTimeout(500)
  const t0 = Date.now()
  await pg.locator('#main button[data-a="openIng"]').filter({ has: pg.locator('.name', { hasText: new RegExp('^' + name + '$') }) }).first().click()
  await pg.locator('#main h2', { hasText: /Use and purchases/i }).waitFor({ timeout: 20000 })
  return Date.now() - t0
}
{ const { pg, ops } = await open('chef')
  const build = await pg.evaluate(() => (window.CONFIG || window.APP_CONFIG || {}).build || document.body.innerText.match(/R1\.\d[\d.]*/)?.[0] || '')
  const t1 = await card(pg, 'Artichokes'); const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes', `Chef · sito pubblicato: scheda Artichokes aperta in ${t1} ms (rete vera, prima apertura)`)
  ok(/4 × 20 pz = 80 pz/.test(c) && /\$2\.00/.test(c) && /Verified/.test(c), 'Chef · confezione 4 × 20 = 80 e prezzo al pezzo $2.00, Verified')
  ok(/128 g/.test(c) && /Estimated/.test(c) && /not approved/.test(c), 'Chef · 128 g Estimated, non approvato')
  ok(/Missing/.test(c) && /Brigade does not count this ingredient/.test(c), 'Chef · scorta Missing con il motivo')
  ok(/#23386/.test(c) && /07167049/.test(c), 'Chef · SKU 23386 e fattura 07167049 visibili')
  await pg.screenshot({ path: `${OUT}/1_chef_artichokes.png` })
  const t2 = await card(pg, 'Artichokes'); ok(t2 < t1 + 500, `Chef · seconda apertura ${t2} ms`)
  const t3 = await card(pg, 'Lobster Tail'); const l = await pg.locator('#main').innerText()
  ok(/ADD LOBSTER/.test(l) && /Lobster Fettucine/.test(l), `Chef · Lobster Tail (${t3} ms): ADD LOBSTER e Lobster Fettucine dai venduti`)
  await pg.screenshot({ path: `${OUT}/2_chef_lobster.png` })
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(2500)
  const t4 = Date.now(); await pg.click('button[data-a="openGaps"]'); await pg.locator('#main .chap h2').first().waitFor({ timeout: 20000 })
  const secs = await pg.locator('#main .chap h2').allTextContents()
  ok((await H1(pg)) === 'Ingredients to complete' && secs.length >= 6, `Chef · Ingredients to complete in ${Date.now() - t4} ms: ${secs.length} gruppi`)
  await pg.screenshot({ path: `${OUT}/3_chef_gaps.png` })
  const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'niente scorrimento laterale')
  ok(!ops.some(o => /^(act|mre_save|mre_publish|mre_prepare_edit|mre_production)/.test(o)), `nessuna operazione di scrittura chiamata (${[...new Set(ops)].join(', ')})`)
  console.log('   versione schermate:', build)
  await pg.context().close() }
{ const { pg, ops } = await open('staff')
  const t = await card(pg, 'Artichokes'); const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes' && !/\$|Buying|Recent invoices|Hardie|23386|07167049/i.test(c), `cuoco · scheda (${t} ms) senza prezzi, fornitore, SKU o fatture`)
  ok(/In recipes/i.test(c) && /Dishes sold/i.test(c), 'cuoco · vede ricette e piatti venduti')
  await pg.click('button.w[data-w="office"]').catch(() => {}); await pg.waitForTimeout(1500)
  ok(await pg.locator('button[data-a="openGaps"]').count() === 0 && !ops.includes('knowledge_gaps'), 'cuoco · niente "Ingredients to complete", nessuna richiesta')
  await pg.screenshot({ path: `${OUT}/4_staff_artichokes.png` })
  await pg.context().close() }
await b.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
