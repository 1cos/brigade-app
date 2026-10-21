// R1.9 (Chef 16/10) — navigation and editor on iPhone size: recipe → ingredient card → back (same screen, same place),
// recipe → sub-recipe, editor with Advanced hidden by default, unsaved changes kept while moving around, save in the test lab.
// API answered in memory: lab docs (B-49 dumps) + Knowledge cards (B-51 dumps), the SAME engines the server runs.
// Usage: [BROWSER=webkit] node tests/nav_editor_mock.mjs <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../supabase/functions/_shared/mre_engine.js'
import * as K from '../supabase/functions/_shared/kitchen_core.js'
import { load, cardFor } from './knowledge_dump.mjs'
const [OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const D = `${process.env.HOME}/brigade-audit-work/b49/data`, ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
const rows = f => { const d = JSON.parse(fs.readFileSync(`${D}/${f}.json`)); return Array.isArray(d) ? d : d.rows }
const docs = JSON.parse(fs.readFileSync(`${D}/mre_import_docs.json`)), pil = new Set(JSON.parse(fs.readFileSync(`${D}/pilot_sets.json`)).pilots)
const fx = rows('facts')[0], facts = typeof fx.facts === 'string' ? JSON.parse(fx.facts) : fx.facts, measures = typeof fx.measures === 'string' ? JSON.parse(fx.measures) : fx.measures
const KA = load()
const LAB = {}; for (const d of docs) LAB[d.id] = { cur: 1, versions: [{ version: 1, state: 'importata', doc: d, reason: 'import', at: new Date().toISOString() }], draft: null }
let role = 'chef'; const calls = []
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'en', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'en', station: 'Salad Station' }
const curDoc = id => Object.assign({}, LAB[id].versions.find(v => v.version === LAB[id].cur).doc, { id })
function treeOf(root) { const out = { [root.id]: root }; let fr = [root]; while (fr.length) { const nx = []; fr.forEach(x => (x.lines || []).filter(l => l.kind === 'recipe').forEach(l => { if (!out[l.ref] && LAB[l.ref]) { out[l.ref] = curDoc(l.ref); nx.push(out[l.ref]) } })); fr = nx } return out }
function api(op, b) {
  const u = user(), chef = u.role === 'chef'; calls.push(op)
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: '2026-10-16', plan_date: '2026-10-16', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: docs.map(d => ({ id: d.id, title: d.title, category: d.category })) }
    case 'ingredients': return { ingredients: K.ingredientList(KA.ingredients, chef ? KA.vendors : [], chef) }
    case 'mre_list': return { recipes: docs.map(d => ({ id: d.id, mre: true, pilot: pil.has(d.id), is_test: false, current_version: LAB[d.id].cur, state: 'importata', title: curDoc(d.id).title, category: d.category, draft: !!LAB[d.id].draft, pending: 0 })), pending: 0 }
    case 'mre_recipe': { const L = LAB[b.id], root = curDoc(b.id), dd = treeOf(root), ctx = { doc: x => dd[x], facts: x => facts[x], measures }
      const f2 = {}; Object.keys(facts).forEach(k => { f2[k] = chef ? facts[k] : (({ price, ...r }) => r)(facts[k]) })
      return { recipe: { id: b.id, current_version: L.cur }, doc: root, docs: dd, facts: f2, measures, versions: L.versions.map(v => ({ version: v.version, state: v.state, reason: v.reason, by: 'Max', at: v.at })), productions: [], suggestions: [],
        draft: chef && L.draft ? Object.assign({}, L.draft, { id: b.id }) : null, diffs: chef ? [{ type: 'quantita_diversa', distinta: 'x', testo: 'y', note: 'mock' }] : undefined, diffs_checked: null, cost: chef ? E.cost(b.id, 1, ctx) : undefined } }
    case 'mre_save_draft': if (!chef) return [403, 'forbidden']; LAB[b.id].draft = b.doc; return { ok: true }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
    case 'mre_publish': { if (!chef) return [403, 'forbidden']; const L = LAB[b.id]; const v = L.cur + 1; L.versions.push({ version: v, state: 'pubblicata', doc: L.draft, reason: b.reason, at: new Date().toISOString() }); L.cur = v; L.draft = null; return { ok: true, version: v } }
    case 'knowledge': { const c = cardFor(KA, b.id, chef, '2026-10-16'); return c || [404, 'not_found'] }
    case 'office': return chef ? { checked_at: new Date().toISOString(), today: '2026-10-16', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 0, review: 0 } } } : [403, 'forbidden']
    case 'completeness': return chef ? { total: 0, groups: {} } : [403, 'forbidden']
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
console.log('motore browser:', ENGINE)
async function page() {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true }, ENGINE === 'webkit' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'en'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(700)
  return pg
}
const H1 = pg => pg.locator('#main h1').first().textContent()
const back = async pg => { await pg.locator('#main button.back').first().click(); await pg.waitForTimeout(500) }
const ART = 'dbdc80fd-142f-4ca1-8f83-7bcebe19ee63'
async function openArtichoke(pg) {
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(600)
  await pg.locator(`#main button[data-a="openRecipe"][data-r="${ART}"]`).click(); await pg.waitForTimeout(700)
}
// ---------------- Chef ----------------
role = 'chef'
{ const pg = await page()
  await openArtichoke(pg)
  ok((await H1(pg)) === 'Artichoke', 'Chef: recipe Artichoke (lab) open')
  const names = await pg.locator('#main .mr-ings .mr-sub').allTextContents()
  ok(names.some(n => /^Grated Parmesan/.test(n)) && !names.some(n => /Parmesan Grated/.test(n)), `display name "Grated Parmesan" (ingredients: ${names.map(n => n.replace(' ›', '')).join(', ')})`)
  ok(/Food cost/.test(await pg.locator('#main .mr-fc').innerText()), `food cost at a glance: "${(await pg.locator('#main .mr-fc').innerText()).trim()}"`)
  // scroll, tap Artichokes, come back to the same place
  await pg.evaluate(() => { document.getElementById('main').scrollTop = 260 }); await pg.waitForTimeout(300)
  const y0 = await pg.evaluate(() => document.getElementById('main').scrollTop)
  await pg.locator('#main .mr-ings button[data-a="openIng"]', { hasText: /^Artichokes$/ }).click(); await pg.waitForTimeout(700)
  const card = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes' && /Chef's Warehouse/.test(card), 'tap "Artichokes" → ingredient card, vendor shown as Chef\'s Warehouse')
  await pg.screenshot({ path: `${OUT}/${P}1_card_from_recipe.png` })
  await back(pg)
  const y1 = await pg.evaluate(() => document.getElementById('main').scrollTop)
  ok((await H1(pg)) === 'Artichoke' && Math.abs(y1 - y0) <= 4, `back → recipe Artichoke at the same place (scroll ${y0} → ${y1})`)
  // sub-recipe opens its recipe
  await pg.locator('#main .mr-ings .mr-sub', { hasText: /^Grated Parmesan/ }).click(); await pg.waitForTimeout(700)
  ok((await H1(pg)) === 'Grated Parmesan', 'tap sub-recipe → "Grated Parmesan" recipe')
  await back(pg); ok((await H1(pg)) === 'Artichoke', 'back → Artichoke')
  // editor: simple first, Advanced on demand
  await pg.locator('#main button[data-m="edit"]').click(); await pg.waitForTimeout(500)
  const n = await pg.locator('#main .mr-ings li').count()
  ok(await pg.locator('#main select[data-ms^="role:"]').count() === 0 && n > 0, `editor: ${n} lines, Production / At the plate / Packaging hidden`)
  await pg.screenshot({ path: `${OUT}/${P}2_editor_simple.png` })
  await pg.locator('#main button[data-m="adv"]').click(); await pg.waitForTimeout(300)
  const roles = await pg.locator('#main select[data-ms^="role:"]').evaluateAll(s => s.map(x => x.value))
  ok(roles.length === n && roles.every(r => ['produzione', 'al_piatto', 'imballo'].includes(r)), `Advanced: ${roles.length} roles visible, values unchanged (${[...new Set(roles)].join(', ')})`)
  await pg.screenshot({ path: `${OUT}/${P}3_editor_advanced.png` })
  await pg.locator('#main button[data-m="adv"]').click(); await pg.waitForTimeout(300)
  // change a quantity (Artichokes 2 → 3), move away before thinking about saving, come back: nothing lost
  const q = pg.locator('#main .mr-ings li').first().locator('b.mq')
  await q.click(); await pg.waitForTimeout(150); await pg.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await pg.keyboard.type('3'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300)
  await pg.locator('#main .mr-ings button[data-a="openIng"]', { hasText: /^Artichokes$/ }).click(); await pg.waitForTimeout(700)
  ok((await H1(pg)) === 'Artichokes', 'from the editor: tap ingredient → its card')
  await pg.waitForTimeout(1200)
  ok(LAB[ART].draft && LAB[ART].draft.lines[0].qty === 3, 'draft saved in the test lab while away (Artichokes 3)')
  await back(pg)
  const q2 = (await pg.locator('#main .mr-ings li').first().locator('b.mq').innerText()).trim()
  ok((await H1(pg)) === 'Artichoke' && /editing|Stai modificando|Editing|Bozza v[0-9]+|Draft v[0-9]+/i.test(await pg.locator('#main .mr-estate').innerText()) && q2.startsWith('3'), `back → still editing, quantity kept (${q2}) — ${await pg.locator("#main .mr-estate").innerText().catch(() => "-")} — ${await H1(pg)}`)
  // publish in the test lab
  await pg.locator('#main .mr-ebar button[data-m="pv:1"]').click(); await pg.waitForTimeout(300)      // R1.13: Publish lives in Preview
  await pg.locator('#main button[data-m="publish"]').click(); await pg.waitForTimeout(800)
  ok(LAB[ART].cur === 2 && LAB[ART].versions[1].doc.lines[0].qty === 3 && calls.includes('mre_publish'), 'save v2 in the test lab: version 2 with the new quantity')
  const roles2 = LAB[ART].versions[1].doc.lines.map(l => l.role).join(','), roles1 = LAB[ART].versions[0].doc.lines.map(l => l.role).join(',')
  ok(roles1 === roles2, 'roles kept exactly in v2 (hidden, not lost)')
  await pg.screenshot({ path: `${OUT}/${P}4_after_save.png` })
  const dims = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(dims[0] <= dims[1], 'no sideways scroll')
  ok(!calls.some(c => /^(act|mre_production|mre_prepare_edit)$/.test(c)), 'only lab and read calls')
  await pg.context().close() }
// ---------------- staff ----------------
role = 'staff'; calls.length = 0
{ const pg = await page()
  await openArtichoke(pg)
  ok(await pg.locator('#main button[data-m="edit"]').count() === 0 && await pg.locator('#main .mr-fc').count() === 0, 'staff: no Edit, no food cost')
  await pg.locator('#main .mr-ings button[data-a="openIng"]', { hasText: /^Artichokes$/ }).click(); await pg.waitForTimeout(700)
  const c = await pg.locator('#main').innerText()
  ok((await H1(pg)) === 'Artichokes' && !/\$|Chef's Warehouse|Hardie|23386/.test(c) && /Calculated usage/i.test(c) && /Counted stock/i.test(c), 'staff: card from the recipe, no vendor or price; usage and counted stock shown')
  await back(pg); ok((await H1(pg)) === 'Artichoke', 'staff: back → Artichoke')
  ok(!calls.includes('mre_save_draft') && !calls.includes('mre_publish'), 'staff: nothing saved')
  await pg.context().close() }
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
