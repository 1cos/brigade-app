// B-25 (Chef 16/10) — UI test: Completeness → recipe opened on the missing part → Edit → isolated lab copy →
// draft with the fix → cost check in the footer. Chromium / WebKit, phone + desktop, Chef and staff.
// API answered in memory: completeness and Brigade data from a read-only dump; the lab copy is built with the SAME
// converter as the server (mre_import.js) and costed with the SAME engine (mre_engine.js). Nothing is sent to Supabase.
// Usage: [BROWSER=webkit] node tests/edit_flow_mock.mjs <snap2_clean.json> <outDir>   (static server for web/ on 127.0.0.1:8791)
import { chromium, webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as K from '../supabase/functions/_shared/kitchen_core.js'
import * as E from '../supabase/functions/_shared/mre_engine.js'
import { buildLabDoc } from '../supabase/functions/_shared/mre_import.js'
const [SNAP, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
const D = JSON.parse(fs.readFileSync(SNAP))
const ENGINE = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium', P = ENGINE === 'webkit' ? 'wk_' : ''
const C = K.completeness(D.attention, D.recipes)
const ingById = Object.fromEntries(D.ingredients.map(i => [i.id, i])), recById = Object.fromEntries(D.recipes.map(r => [r.id, r]))
// a recipe without procedure whose lines are all ingredients (no sub-recipes), one without photo, one with deferred yield
const PROC = C.groups.procedure.find(x => { const b = D.bom.filter(y => y.parent_recipe_id === x.id); return b.length >= 2 && b.every(y => y.component_type !== 'RECIPE') })
const PHOTO = C.groups.photo[0], YIELD = (C.groups.deferred[0] || C.groups.portions[0])
const OFFICIAL = JSON.stringify({ r: recById[PROC.id], b: D.bom.filter(y => y.parent_recipe_id === PROC.id) })
let role = 'chef'; const ops = []; const LAB = {}
const user = () => role === 'chef' ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Salad Station' }
const facts = ids => Object.fromEntries(ids.map(id => [id, { id, name: (ingById[id] || {}).name || '?', name_it: (ingById[id] || {}).name_it || null, base_unit: 'g', price: { prezzo_per_g: 0.01, fonte: 'mock' } }]))
function labPayload(id, chef) {
  const L = LAB[id], doc = Object.assign({}, L.versions[L.cur - 1].doc, { id }), ids = doc.lines.filter(l => l.kind === 'ingredient').map(l => l.ref), f = facts(ids)
  const ctx = { doc: x => x === id ? doc : null, facts: x => f[x], measures: {} }
  return { engine: E.MRE_ENGINE_VERSION, recipe: { id, pilot: false, current_version: L.cur }, doc, docs: { [id]: doc }, facts: f, measures: {}, versions: L.versions.map((v, i) => ({ version: i + 1, state: v.state, reason: v.reason, by: 'Max', at: new Date().toISOString() })).reverse(),
    productions: [], suggestions: [], draft: chef && L.draft ? Object.assign({}, L.draft, { id }) : null, diffs: chef ? L.diffs : undefined, diffs_checked: null, cost: chef ? E.cost(id, 1, ctx) : undefined }
}
function api(op, b) {
  const u = user(), chef = u.role === 'chef'; ops.push(u.name + ':' + op)
  switch (op) {
    case 'me': return { ok: true, user: u }
    case 'shift': return { today: '2026-10-16', plan_date: '2026-10-16', user: u, items: [], messages: [], done_today: [], reports: [], people: [], my_reports: [] }
    case 'recipes': return { recipes: D.recipes }
    case 'office': return chef ? { checked_at: D.at, today: '2026-10-16', decisions: [], stale: [], history: [], completeness: [], invoices: { warnings: 0, invoices: 0, needs: [], queue: [], info: [], excluded: 0, docs: [], tile: { now: 0, review: 0 } } } : [403, 'forbidden']
    case 'completeness': return chef ? C : [403, 'forbidden']
    case 'ingredients': return { ingredients: K.ingredientList(D.ingredients, D.vendors, chef) }
    case 'mre_list': return { recipes: Object.keys(LAB).filter(() => chef).map(id => ({ id, pilot: false, is_test: false, current_version: LAB[id].cur, state: 'importata', title: recById[id].title, category: recById[id].category, draft: !!LAB[id].draft, pending: 0, on_demand: true })), pending: 0 }
    case 'recipe': { const r = recById[b.id]; const bom = D.bom.filter(x => x.parent_recipe_id === b.id).map((x, i) => ({ bom_id: i + 1, parent_recipe_id: b.id, quantity: 100, unit: 'g', component_type: x.component_type, item_id: x.item_id, sub_recipe_id: x.sub_recipe_id, ingredients: x.item_id ? { name: (ingById[x.item_id] || {}).name } : null, recipes: null }))
      return { recipe: Object.assign({ base_servings: null, yield_text: '', procedure: '' }, r), steps: [], bom, preps: [], used_in: [], can_cost: chef } }
    case 'recipe_tree': return { byParent: {}, preps: [] }
    case 'recipe_cost': return chef ? { ok: true, breakdown: null } : [403, 'forbidden']
    case 'mre_prepare_edit': { if (!chef) return [403, 'forbidden']; if (!LAB[b.id]) { const r = recById[b.id]
        const rows = D.bom.filter(x => x.parent_recipe_id === b.id).map((x, i) => ({ bom_id: i + 1, parent_recipe_id: b.id, component_type: x.component_type, item_id: x.item_id, sub_recipe_id: x.sub_recipe_id, quantity: 100, unit: 'g', notes: null, ing_name: (ingById[x.item_id] || {}).name, ing_base: 'g', policy: null }))
        const out = buildLabDoc({ id: b.id, r: Object.assign({ ingredients: [], procedure: '' }, r), rows, stepRows: [], prepRows: [], y: {}, byId: recById })
        LAB[b.id] = { cur: 1, versions: [{ state: 'importata', doc: out.doc, reason: 'Copia di prova' }], draft: null, diffs: out.diffs } }
      return { ok: true, id: b.id, imported: 1 } }
    case 'mre_recipe': if (!LAB[b.id] && recById[b.id] && chef) { role = 'chef'; api('mre_prepare_edit', b) }   // R1.13: the server reads ANY official recipe for the Chef
      return LAB[b.id] ? labPayload(b.id, chef) : [404, 'not_found']
    case 'mre_save_draft': if (!chef) return [403, 'forbidden']; LAB[b.id].draft = b.doc; return { ok: true }
    case 'mre_discard': LAB[b.id].draft = null; return { ok: true }
  }
  return [400, 'bad_op']
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` })
console.log('motore browser:', ENGINE, '· ricetta senza procedimento:', PROC.title)
async function page(w, h) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 }, ENGINE === 'webkit' && w < 500 ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' } : {}))
  const pg = await ctx.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b); if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto('http://127.0.0.1:8791/index.html'); await pg.waitForTimeout(700)
  return pg
}
const toComplete = async (pg, kind) => {
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(300)
  await pg.click('button[data-a="openComplete"]'); await pg.waitForTimeout(400)
  await pg.locator(`button[data-a="kMore"][data-k="m_${kind}"]`).click(); await pg.waitForTimeout(300)
}
const hlText = async pg => (await pg.locator('#main section.hl h2, #main .hl .mr-sec span').allTextContents()).concat(await pg.locator('#main .mr-yield.hl').count() ? ['Resa'] : [])   // R1.13: the Chef's card marks the Yield line
for (const [dev, w, h] of [['telefono', 390, 844], ['computer', 1440, 900]]) {
  role = 'chef'; for (const k in LAB) delete LAB[k]
  const pg = await page(w, h)
  // 1) missing procedure → card opens on Procedimento, marked
  await toComplete(pg, 'procedure')
  await pg.locator(`#main button[data-a="openRecipe"][data-r="${PROC.id}"]`).click(); await pg.waitForTimeout(600)
  const box = await pg.locator('#main .fixbox .h').textContent().catch(() => '')
  ok(box === 'Da completare: manca il procedimento' && (await hlText(pg)).includes('Procedimento'), `${dev} · "${PROC.title}": riquadro "${box}", evidenziato "${(await hlText(pg)).join(',')}"`)
  ok(await pg.locator('#main .mr-editbtn[data-m="edit"], #main .rc-headrow button[data-a="editRecipe"]').count() === 1, `${dev} · pulsante "Modifica" nella scheda ricetta`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_1_manca_procedimento.png` })
  // 2) Edit → lab copy → editor, isolation note, part still marked
  await pg.locator('#main .fixbox button[data-a="editRecipe"]').click(); await pg.waitForTimeout(1200)
  const isol = await pg.locator('#main .mr-ebar').textContent().catch(() => '')     // R1.13: Edit · Preview · Save draft (technical notes only in "Info tecniche")
  ok(await pg.locator('#main .mr.mr-edit').count() === 1 && /Modifica/.test(isol) && /Anteprima/.test(isol) && /Salva bozza/.test(isol), `${dev} · Modifica: editor aperto sulla bozza ("${isol.slice(0, 60)}…")`)
  ok(await pg.locator('#main .mr-right.hl').count() === 1 && /manca il procedimento/.test(await pg.locator('#main .fixbox').textContent()), `${dev} · nell'editor il procedimento resta evidenziato con la segnalazione`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_2_editor.png` })
  // 3) write the missing procedure in a draft; footer shows the cost check
  await pg.locator('#main button[data-m="addstep"]').click(); await pg.waitForTimeout(400)
  const step = pg.locator('#main [data-mt="step:0"]')
  await step.click(); await pg.keyboard.type('Mescola tutti gli ingredienti e porziona.'); await pg.locator('#main h1').first().click(); await pg.waitForTimeout(1600)
  const dr = LAB[PROC.id].draft
  ok(dr && dr.steps.length === 1 && /Mescola tutti gli ingredienti/.test(dr.steps[0].it), `${dev} · bozza salvata con il procedimento nuovo`)
  const foot = await pg.locator('#main .mr-foot').textContent().catch(() => '')
  ok(/Food cost/.test(foot) && /Anteprima/.test(foot), `${dev} · costo nel piede ("${foot.split('$')[0].trim().slice(0, 40)}…") e passaggio all'Anteprima`)
  ok(LAB[PROC.id].cur === 1 && JSON.stringify({ r: recById[PROC.id], b: D.bom.filter(y => y.parent_recipe_id === PROC.id) }) === OFFICIAL && !ops.some(o => /Max:(mre_publish|act)/.test(o)), `${dev} · versione in uso invariata (v1), dati ufficiali invariati, nessuna pubblicazione`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_3_bozza.png`, fullPage: true })
  // 4) missing photo → Brigade card on Foto; 5) yield → Resa
  await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openComplete"]'); await pg.waitForTimeout(300)
  await pg.locator('button[data-a="kMore"][data-k="m_photo"]').click(); await pg.waitForTimeout(300)
  await pg.locator(`#main button[data-a="openRecipe"][data-r="${PHOTO.id}"][data-focus="photo"]`).first().click(); await pg.waitForTimeout(600)
  ok((await hlText(pg)).includes('Foto') && /manca la foto/.test(await pg.locator('#main .fixbox').textContent()), `${dev} · manca la foto: sezione Foto evidenziata`)
  await pg.screenshot({ path: `${OUT}/${P}${dev}_4_foto.png` })
  if (YIELD) { await pg.click('button.w[data-w="office"]'); await pg.waitForTimeout(300); await pg.click('button[data-a="openComplete"]'); await pg.waitForTimeout(300)
    const kind = C.groups.deferred.length ? 'deferred' : 'portions'
    await pg.locator(`button[data-a="kMore"][data-k="m_${kind}"]`).click(); await pg.waitForTimeout(300)
    await pg.locator(`#main button[data-a="openRecipe"][data-r="${YIELD.id}"]`).first().click(); await pg.waitForTimeout(700)
    ok((await hlText(pg)).includes('Resa'), `${dev} · resa/porzioni: si apre STRUTTURA con la Resa evidenziata ("${await pg.locator('#main .fixbox .h').textContent()}")`)
    await pg.screenshot({ path: `${OUT}/${P}${dev}_5_resa.png` }) }
  const sc = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(sc[0] <= sc[1], `${dev} · niente scorrimento laterale`)
  await pg.context().close()
}
role = 'staff'
{ const pg = await page(390, 844)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForTimeout(400)
  await pg.fill('#q', PROC.title.slice(0, 6)); await pg.waitForTimeout(500)
  await pg.locator(`#main button[data-a="openRecipe"][data-r="${PROC.id}"]`).first().click(); await pg.waitForTimeout(600)
  ok(await pg.locator('button[data-a="editRecipe"]').count() === 0 && await pg.locator('#main .fixbox').count() === 0, 'cuoco: nessun pulsante Modifica, nessun riquadro')
  ok(!ops.some(o => /^Pablo:(mre_prepare_edit|mre_save_draft|completeness)/.test(o)), 'cuoco: nessuna richiesta di modifica o completezza')
  await pg.context().close() }
await browser.close()
console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
process.exitCode = fail ? 1 : 0
