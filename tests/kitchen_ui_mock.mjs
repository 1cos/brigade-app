// B-25 module 2 — UI test: ingredients list + card, recipe → ingredient, Ufficio → Completeness. Chef and staff,
// phone / tablet / desktop, three languages. API answered in memory by the SAME engine (kitchen_core.js) on a read-only dump.
// Usage: [BROWSER=webkit] node tests/kitchen_ui_mock.mjs <snap2_clean.json> <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as K from '../supabase/functions/_shared/kitchen_core.js'
import { knowledgeCard } from '../supabase/functions/_shared/knowledge_core.js'
const [SNAP, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const D = JSON.parse(fs.readFileSync(SNAP))
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
// a recipe that uses a priced ingredient, to test recipe → ingredient
const priced = D.vendors.find(v => v.unit_price && D.bom.some(b => b.item_id === v.ingredient_id))
const ING = D.ingredients.find(i => i.id === priced.ingredient_id), REC = D.recipes.find(r => r.id === D.bom.find(b => b.item_id === ING.id).parent_recipe_id)
let role = 'chef'; const asked = []
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
function api(op, b) {
  const u = user(), chef = u.role === 'chef'; asked.push(u.name + ':' + op)
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: '2026-10-15', plan_date: '2026-10-15', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: D.recipes }
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'office': return chef ? { checked_at: D.at, today: '2026-10-15', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 0, review: 0 } } } : [403, 'forbidden']
    case 'completeness': return chef ? K.completeness(D.attention, D.recipes) : [403, 'forbidden']
    case 'ingredients': return { ingredients: K.ingredientList(D.ingredients, D.vendors, chef) }
    case 'ingredient': { const c = K.ingredientCard(b.id, D, chef); return c || [404, 'not_found'] }
    // R1.8: the card is the Knowledge card (B-51), built on ingredientCard; this snapshot has no POS/invoices → those parts say Missing
    case 'knowledge': { const c = knowledgeCard(b.id, Object.assign({}, D, { yields: [], sales: [], invoices: [], facts: null, counts: [], days: 28, since: '2026-09-17' }), chef); return c || [404, 'not_found'] }
    case 'recipe': { const r = D.recipes.find(x => x.id === b.id) || REC
      const bom = D.bom.filter(x => x.parent_recipe_id === r.id).map((x, i) => ({ bom_id: i, parent_recipe_id: r.id, quantity: 100, unit: 'g', component_type: x.component_type, item_id: x.item_id, sub_recipe_id: x.sub_recipe_id, ingredients: x.item_id ? { name: (D.ingredients.find(y => y.id === x.item_id) || {}).name } : null, recipes: null }))
      return { recipe: Object.assign({ base_servings: 1 }, r), steps: [], bom, preps: [], used_in: [], can_cost: chef } }
    case 'recipe_tree': return { byParent: {}, preps: [] }
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
console.log('motore browser:', ENGINE)
async function page(w, h, lang) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 }, ENGINE === 'webkit' && w < 500 ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(l => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', l); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, lang)
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(700)
  return pg
}
const noH = async (pg, where) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(r[0] <= r[1], `${where}: niente scorrimento laterale`) }
const H1 = pg => pg.locator('#main h1').first().textContent()
for (const [dev, w, h] of [['telefono', 390, 844], ['tablet', 820, 1180], ['computer', 1440, 900]]) {
  role = 'chef'; const pg = await page(w, h, 'it')
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(400)
  await pg.click('button[data-a="openIngs"]'); await pg.waitForTimeout(400)
  const n = await pg.locator('#main button[data-a="openIng"]').count()
  ok((await H1(pg)) === 'Ingredienti' && n === 80 && await pg.locator('button[data-a="kMore"]').count() === 1, `${dev} · Chef: Ingredienti, primi ${n} + "${await pg.locator('button[data-a="kMore"]').textContent()}"`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_1_ingredienti.png` }); await noH(pg, `${dev} ingredienti`)
  await pg.fill('#q', ING.name.slice(0, 5)); await pg.waitForTimeout(600)
  const hits = await pg.locator('#main button[data-a="openIng"]').count()
  ok(hits >= 1 && hits < 80, `${dev} · ricerca "${ING.name.slice(0, 5)}": ${hits} risultati`)
  await pg.locator(`#main button[data-a="openIng"][data-id="${ING.id}"]`).click(); await pg.waitForTimeout(500)
  const card = await pg.locator('#main').innerText()
  ok((await H1(pg)) === ING.name && /ACQUISTO|Acquisto/i.test(card) && /\$\d/.test(card), `${dev} · Chef: scheda "${ING.name}" con acquisto e prezzi`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_2_scheda_chef.png`, fullPage: true }); await noH(pg, `${dev} scheda`)
  await pg.locator(`#main button[data-a="openRecipe"][data-r="${REC.id}"]`).click(); await pg.waitForTimeout(600)
  ok((await H1(pg)) === REC.title, `${dev} · "Usato in" apre la ricetta "${REC.title}"`)
  await pg.locator(`#main button[data-a="openIng"][data-id="${ING.id}"]`).first().click(); await pg.waitForTimeout(500)
  ok((await H1(pg)) === ING.name, `${dev} · dalla ricetta, l'ingrediente apre la sua scheda`)
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(400)
  await pg.click('button[data-a="openComplete"]'); await pg.waitForTimeout(400)
  const secs = await pg.locator('#main .chap h2').allTextContents()
  ok((await H1(pg)) === 'Completezza ricette' && secs.length >= 2, `${dev} · Ufficio → Completezza: ${secs.join(' | ')}`)
  await pg.locator('#main button[data-a="kMore"]').first().click(); await pg.waitForTimeout(300)
  ok(await pg.locator('#main button[data-a="openRecipe"]').count() > 0, `${dev} · "Mostra" apre l'elenco delle ricette`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_3_completezza.png`, fullPage: true }); await noH(pg, `${dev} completezza`)
  await pg.context().close()
}
for (const [lang, word] of [['en', 'Ingredients'], ['es', 'Ingredientes'], ['it', 'Ingredienti']]) {
  role = 'chef'; const pg = await page(390, 844, lang)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openIngs"]'); await pg.waitForTimeout(300)
  await pg.locator(`#main button[data-a="openIng"]`).first().click(); await pg.waitForTimeout(400)
  const b1 = await pg.locator('#main').innerText()
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openComplete"]'); await pg.waitForTimeout(300)
  const b2 = await pg.locator('#main').innerText()
  ok(!/\bk_[a-z_]+/.test(b1 + b2), `lingua ${lang}: nessuna chiave grezza`)
  await pg.context().close()
}
role = 'staff'; asked.length = 0
{ const pg = await page(390, 844, 'it')
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openIngs"]'); await pg.waitForTimeout(300)
  const list = await pg.locator('#main').innerText()
  ok(!/fornitor|Non ordinare/i.test(list), 'cuoco: elenco ingredienti senza fornitori')
  await pg.locator(`#main button[data-a="openIng"][data-id="${ING.id}"]`).click().catch(async () => { await pg.fill('#q', ING.name.slice(0, 5)); await pg.waitForTimeout(500); await pg.locator(`#main button[data-a="openIng"][data-id="${ING.id}"]`).click() })
  await pg.waitForTimeout(500)
  const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === ING.name && !/\$|acquisto|fornitor/i.test(c) && /nelle ricette/i.test(c), 'cuoco: scheda ingrediente senza prezzi né fornitori, con "Nelle ricette"')
  ok(await pg.locator('button[data-a="openComplete"]').count() === 0 && !asked.some(x => /completeness|office/.test(x)), 'cuoco: niente Completezza, nessuna richiesta all\'Ufficio')
  await pg.screenshot({ path: `${OUT}/${P}cuoco_scheda.png`, fullPage: true })
  await pg.context().close() }
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
