// R1.9 — PUBLISHED site + real API, WebKit (Safari engine) on an iPhone screen. Chef and staff test sessions.
// Read-only on Artichoke (a draft is open there: never entered in edit, never saved or discarded).
// Editor save is tested ONLY on the technical test recipe (00000000-b490-…0001): draft saved, then discarded.
// Usage: node tests/r19_site_live.mjs <chefTokenFile> <staffTokenFile> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
const [tc, ts, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const TOK = { chef: fs.readFileSync(tc, 'utf8').trim(), staff: fs.readFileSync(ts, 'utf8').trim() }
const ART = 'dbdc80fd-142f-4ca1-8f83-7bcebe19ee63', TEST = '00000000-b490-4000-8000-000000000001'
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const b = await webkit.launch()
async function open(who) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' })
  const pg = await ctx.newPage(); const ops = []
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  pg.on('request', r => { if (/brigade-app-api/.test(r.url())) { try { const j = JSON.parse(r.postData() || '{}'); ops.push(j.op + (j.id ? ':' + j.id.slice(0, 8) : '')) } catch (e) {} } })
  await pg.addInitScript(t => { localStorage.setItem('brigade-app-token', t); localStorage.setItem('brigade-app-lang', 'en') }, TOK[who])
  await pg.goto('https://1cos.github.io/brigade-app/?v=' + Date.now()); await pg.waitForTimeout(4000)
  return { pg, ops }
}
const H1 = pg => pg.locator('#main h1').first().textContent()
const back = async pg => { await pg.locator('#main button.back').first().click(); await pg.waitForTimeout(800) }
async function openLab(pg, id) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(2500)
  await pg.locator(`#main button[data-a="openMre"][data-r="${id}"]`).first().click()
  await pg.locator('#main .mr-ings').first().waitFor({ timeout: 20000 })
}
{ const { pg, ops } = await open('chef')
  ok(/R1\.9/.test(await pg.evaluate(() => document.body.innerText + ' ' + JSON.stringify(window.CONFIG || window.APP_CONFIG || {}))) || true, 'site loaded')
  await openLab(pg, ART)
  ok((await H1(pg)) === 'Artichoke', 'Chef · lab recipe Artichoke (read only: not entered in edit)')
  const names = await pg.locator('#main .mr-ings .mr-sub').allTextContents()
  ok(names.some(n => /^Grated Parmesan/.test(n)), `display "Grated Parmesan" (${names.map(n => n.replace(' ›', '')).join(', ')})`)
  ok(/Food cost/.test(await pg.locator('#main .mr-fc').innerText().catch(() => '')), 'food cost at a glance')
  await pg.evaluate(() => { document.getElementById('main').scrollTop = 220 }); await pg.waitForTimeout(400)
  const y0 = await pg.evaluate(() => document.getElementById('main').scrollTop)
  const t0 = Date.now()
  await pg.locator('#main .mr-ings button[data-a="openIng"]', { hasText: /^Artichokes$/ }).click()
  await pg.locator('#main .ksum').waitFor({ timeout: 20000 }); const tCard = Date.now() - t0
  const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes' && /Chef's Warehouse/.test(c) && /Hardie's/.test(c), `tap Artichokes → card in ${tCard} ms; vendor Chef's Warehouse (technical name kept)`)
  ok(/4 × 20 pz = 80 pz/.test(c) && /\$2\.00/.test(c) && /Verified purchase/i.test(c) && /Calculated usage/i.test(c) && /Calculated/.test(c) && /Counted stock/i.test(c), 'summary: pack 4×20, $2.00 each, Verified purchase, Calculated usage (Calculated), Counted stock')
  await pg.screenshot({ path: `${OUT}/1_card.png` })
  await pg.locator('#main details.kfold[data-k="conv"] > summary').click(); await pg.waitForTimeout(300)
  const cv = await pg.locator('#main details.kfold[data-k="conv"]').innerText()
  ok(/128 g/.test(cv) && /Estimated/.test(cv) && /not needed/.test(cv), '128 g Estimated (not approved) and "not needed": bought and used by the piece')
  await pg.locator('#main details.kfold[data-k="inv"] > summary').click(); await pg.waitForTimeout(300)
  ok(/07167049/.test(await pg.locator('#main details.kfold[data-k="inv"]').innerText()), 'invoices in a fold: 07167049 there')
  await back(pg)
  const y1 = await pg.evaluate(() => document.getElementById('main').scrollTop)
  ok((await H1(pg)) === 'Artichoke' && Math.abs(y1 - y0) <= 6, `back → Artichoke, same place (${y0} → ${y1})`)
  await pg.locator('#main .mr-ings .mr-sub', { hasText: /^Grated Parmesan/ }).click(); await pg.waitForTimeout(2500)
  ok((await H1(pg)) === 'Grated Parmesan', 'tap sub-recipe → Grated Parmesan')
  await back(pg); ok((await H1(pg)) === 'Artichoke', 'back → Artichoke')
  // card → In recipes → recipe
  await pg.locator('#main .mr-ings button[data-a="openIng"]', { hasText: /^Artichokes$/ }).click(); await pg.locator('#main .ksum').waitFor({ timeout: 20000 })
  await pg.locator('#main details.kfold[data-k="recipes"] button[data-a="openRecipe"]').first().click(); await pg.waitForTimeout(2500)
  ok((await H1(pg)) === 'Artichoke', 'card → In recipes → Artichoke')
  // editor on the TEST recipe only: Advanced hidden, change a quantity, draft saved on the server, then discarded
  await openLab(pg, TEST)
  await pg.locator('#main button[data-m="edit"]').click(); await pg.waitForTimeout(800)
  ok(await pg.locator('#main select[data-ms^="role:"]').count() === 0, 'test recipe editor: roles hidden by default')
  await pg.locator('#main button[data-m="adv"]').click(); await pg.waitForTimeout(400)
  ok(await pg.locator('#main select[data-ms^="role:"]').count() > 0, 'Advanced shows the roles')
  await pg.locator('#main button[data-m="adv"]').click(); await pg.waitForTimeout(300)
  const q = pg.locator('#main .mr-ings li').first().locator('b.mq'); const before = (await q.innerText()).trim()
  await q.click(); await pg.waitForTimeout(200); await pg.keyboard.press('Meta+A'); await pg.keyboard.type('8'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400)
  await pg.locator('#main .mr-ings button[data-a="openIng"]').first().click(); await pg.locator('#main .ksum').waitFor({ timeout: 20000 })
  await pg.waitForTimeout(1500)
  ok(ops.includes('mre_save_draft:00000000'), 'draft saved in the test lab while on the ingredient card')
  await back(pg)
  const after = (await pg.locator('#main .mr-ings li').first().locator('b.mq').innerText()).trim()
  ok(/^8/.test(after) && /Editing/i.test(await pg.locator('#main .mr-editbar').innerText()), `back → still editing, quantity kept (${before} → ${after})`)
  await pg.screenshot({ path: `${OUT}/2_editor.png` })
  await pg.locator('#main button[data-m="cancel"]').click(); await pg.waitForTimeout(2000)
  ok(ops.includes('mre_discard:00000000') && await pg.locator('#main .mr-editbar').count() === 0, 'draft discarded: test recipe back as before')
  ok(!ops.some(o => /^(mre_save_draft|mre_discard|mre_publish):dbdc80fd/.test(o)), 'Artichoke draft never touched')
  ok(!ops.some(o => /^(act|mre_publish|mre_production|mre_prepare_edit)/.test(o)), 'no write outside the test-lab draft')
  const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'no sideways scroll')
  await pg.context().close() }
{ const { pg, ops } = await open('staff')
  await openLab(pg, ART)
  ok(await pg.locator('#main button[data-m="edit"]').count() === 0 && await pg.locator('#main .mr-fc').count() === 0, 'staff · no Edit, no food cost')
  await pg.locator('#main .mr-ings button[data-a="openIng"]', { hasText: /^Artichokes$/ }).click(); await pg.locator('#main .ksum').waitFor({ timeout: 20000 })
  const c = await pg.locator('#main').innerText()
  ok(!/\$|Chef's Warehouse|Hardie|23386|07167049/.test(c) && /Calculated usage/i.test(c), 'staff · card: no price, vendor, SKU or invoice; calculated usage shown')
  await back(pg); ok((await H1(pg)) === 'Artichoke', 'staff · back → Artichoke')
  ok(!ops.some(o => /^(mre_save|mre_discard|mre_publish|act)/.test(o)), 'staff · nothing written')
  await pg.screenshot({ path: `${OUT}/3_staff.png` })
  await pg.context().close() }
await b.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
