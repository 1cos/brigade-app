// B-51 Knowledge Engine phase 1 — UI test on READ-ONLY dumps of live Brigade (tests/knowledge_dump.mjs).
// The API is answered in memory by the SAME engine the server runs (knowledge_core.js). Chef and staff,
// phone / tablet / desktop, en (Chef) + it + es. Nothing is written anywhere.
// Usage: [BROWSER=webkit] node tests/knowledge_ui_mock.mjs <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import { load, cardFor } from './knowledge_dump.mjs'
import { gaps } from '../supabase/functions/_shared/knowledge_core.js'
import * as K from '../supabase/functions/_shared/kitchen_core.js'
const [OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const A = load(), ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
const byName = n => A.ingredients.find(i => i.name === n)
const ART = byName('Artichokes'), LOB = byName('Lobster Tail'), CREAM = byName('Heavy Cream')
const ARTC = cardFor(A, ART.id, true), USED = `${ARTC.theoretical.v} pz`
const G = Object.assign(gaps({ ingredients: A.ingredients, bom: A.bom, vendors: A.vendors, facts: A.facts, recipes: A.recipes, unmatched: A.inv.filter(l => !l.ingredient_id).slice(0, 50),
  posFood: A.sales.filter(s => s.kind === 'item').map(s => ({ name: s.name, qty: Number(s.qty) })) }), { days: 28, invoices_no_number: 1090 })
let role = 'chef', lang = 'en'; const asked = []
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang, station: null } : { id: 38, name: 'Pablo', role: 'staff', lang, station: 'Salad Station' }
function api(op, b) {
  const u = user(), chef = u.role === 'chef'; asked.push(u.name + ':' + op)
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: '2026-10-15', plan_date: '2026-10-15', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: A.recipes.map(r => ({ id: r.id, title: r.title, category: r.category })) }
    case 'mre_list': return { recipes: [], pending: 0 }
    case 'office': return chef ? { checked_at: '2026-10-16T02:00:00Z', today: '2026-10-15', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 0, review: 0 } } } : [403, 'forbidden']
    case 'completeness': return chef ? { total: 0, groups: {} } : [403, 'forbidden']
    case 'ingredients': return { ingredients: K.ingredientList(A.ingredients, chef ? A.vendors : [], chef) }
    case 'knowledge': { const c = cardFor(A, b.id, chef); return c || [404, 'not_found'] }
    case 'knowledge_gaps': return chef ? G : [403, 'forbidden']
    case 'recipe': { const r = A.recipes.find(x => x.id === b.id); return r ? { recipe: Object.assign({ base_servings: 1 }, r), steps: [], bom: [], preps: [], used_in: [], can_cost: chef } : [404, 'not_found'] }
    case 'recipe_tree': return { byParent: {}, preps: [] }
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
console.log('motore browser:', ENGINE)
async function page(w, h) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 }, ENGINE === 'webkit' && w < 500 ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(l => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', l); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, lang)
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(700)
  return pg
}
const noH = async (pg, where) => { const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(r[0] <= r[1], `${where}: niente scorrimento laterale`) }
const H1 = pg => pg.locator('#main h1').first().textContent()
async function openIng(pg, ing) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openIngs"]'); await pg.waitForTimeout(300)
  await pg.fill('#q', ing.name); await pg.waitForTimeout(500)
  await pg.locator(`#main button[data-a="openIng"][data-id="${ing.id}"]`).click(); await pg.waitForTimeout(600)
  await pg.evaluate(() => document.querySelectorAll('#main details.kfold').forEach(d => { d.open = true })); await pg.waitForTimeout(150)   // R1.9: details are folded; open them to read everything
}
for (const [dev, w, h] of [['telefono', 390, 844], ['tablet', 820, 1180], ['computer', 1440, 900]]) {
  role = 'chef'; lang = 'en'; const pg = await page(w, h)
  const t0 = Date.now(); await openIng(pg, ART); const ms = Date.now() - t0
  const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes', `${dev} · Chef: scheda Artichokes aperta (${ms} ms, dati simulati in memoria)`)
  ok(/4 × 20 pz = 80 pz/.test(c) && /Verified/.test(c), `${dev} · confezione letta dalla fattura: 4 × 20 = 80 pezzi, Verified`)
  ok(/\$2\.00/.test(c) && /invoice price ÷ 80 pieces/.test(c), `${dev} · prezzo al pezzo $2.00 dalla fattura ÷ 80`)
  ok(/128 g/.test(c) && /Estimated/.test(c) && /not approved/.test(c), `${dev} · 128 g mostrato come Estimated, non approvato (non approvato in automatico)`)
  ok(/Purchase unit says "lb"/.test(c), `${dev} · avviso: unità d'acquisto "lb" ma confezione a pezzi`)
  ok(c.includes(USED) && /320 pz/.test(c) && /Calculated/.test(c) && /Verified purchase/i.test(c) && /Counted stock/i.test(c), `${dev} · in alto: Verified purchase 320, Calculated usage ${USED} (Calculated, non Verified), Counted stock`)
  ok(/07167049/.test(c) && /from the original document/.test(c), `${dev} · fattura 12/10 con numero 07167049 preso dal documento originale`)
  ok(/Brigade does not count this ingredient/.test(c) && /Missing/.test(c), `${dev} · scorta: Missing con il motivo`)
  ok(!/\bkn_[a-z_]+|\bk_[a-z_]+|undefined|NaN/.test(c), `${dev} · nessuna chiave grezza, undefined o NaN`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_1_artichokes_chef.png`, fullPage: true }); await noH(pg, `${dev} scheda carciofi`)
  await openIng(pg, LOB)
  const l = await pg.locator('#main').innerText()
  ok(/ADD LOBSTER/.test(l) && /Lobster Fettucine/.test(l) && /Thaw Lobster/.test(l), `${dev} · Lobster Tail: piatti venduti trovati risalendo da Thaw Lobster (ADD LOBSTER, Lobster Fettucine)`)
  ok(/1 CA/.test(l) && /cannot be read as a number|not in a standard form/.test(l), `${dev} · Lobster: confezione "1 CA" dichiarata non leggibile, niente numero inventato`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_2_lobster_chef.png`, fullPage: true })
  await openIng(pg, CREAM)
  const cr = await pg.locator('#main').innerText()
  ok(/9-1\/2 GAL/.test(cr) && /cannot be read as a number/.test(cr), `${dev} · Heavy Cream: "9-1/2 GAL" non viene indovinato, Missing con motivo`)
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(400)
  await pg.click('button[data-a="openGaps"]'); await pg.waitForTimeout(600)
  const secs = await pg.locator('#main .chap h2').allTextContents()
  ok((await H1(pg)) === 'Ingredients to complete' && secs.length >= 6, `${dev} · Ufficio → Ingredients to complete: ${secs.length} gruppi`)
  await pg.locator('#main button[data-a="kMore"]').first().click(); await pg.waitForTimeout(300)
  const first = pg.locator('#main button[data-a="openIng"]').first(), fname = (await first.locator('.name').textContent()).trim()
  await first.click(); await pg.waitForTimeout(600)
  ok((await H1(pg)) === fname, `${dev} · da "To complete" si apre la scheda "${fname}"`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_3_gaps.png`, fullPage: true }); await noH(pg, `${dev} to complete`)
  await pg.context().close()
}
for (const lg of ['it', 'es']) {
  role = 'chef'; lang = lg; const pg = await page(390, 844)
  await openIng(pg, ART); const c = await pg.locator('#main').innerText()
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openGaps"]'); await pg.waitForTimeout(500)
  const g = await pg.locator('#main').innerText()
  ok(!/\bkn_[a-z_]+|\bk_[a-z_]+/.test(c + g) && /80 pz/.test(c), `lingua ${lg}: scheda e "da completare" senza chiavi grezze`)
  await pg.context().close()
}
role = 'staff'; lang = 'en'; asked.length = 0
{ const pg = await page(390, 844)
  await openIng(pg, ART); const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes' && !/\$|Buying|Recent invoices|Hardie|23386/.test(c), 'cuoco: nessun prezzo, fornitore, SKU o fattura')
  ok(/In recipes/i.test(c) && c.includes(USED), 'cuoco: vede ricette e consumo calcolato dal venduto')
  ok(await pg.locator('button[data-a="openGaps"]').count() === 0 && !asked.some(x => /knowledge_gaps|office/.test(x)), 'cuoco: niente "Ingredients to complete", nessuna richiesta all\'Ufficio')
  await pg.screenshot({ path: `${OUT}/${P}cuoco_artichokes.png`, fullPage: true })
  await pg.context().close() }
// the staff answer itself (server rule, same function): no vendors, invoices or prices in the data
{ const c = cardFor(A, ART.id, false); ok(!c.vendors_k && !c.invoices && !c.price && !c.bought && !('vendors' in c), 'dati cuoco: la risposta non contiene fornitori, fatture, prezzi o acquisti') }
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
