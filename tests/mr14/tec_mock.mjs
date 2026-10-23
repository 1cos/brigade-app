// MR-14 — drafts dictated to T.E.C. in the Chef's Recipe Master: «da T.E.C.» in the list, the filter, the note in the recipe card.
// Usage: PORT=<static server for web/> node tests/mr14/tec_mock.mjs <wheel_pasta_draft.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const [DUMP, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const D = JSON.parse(fs.readFileSync(DUMP, 'utf8')), WID = D.recipe.id, NID = '0b5d7a2e-1c3f-4e8a-9d6b-7f2a1c3e5d90'
const NEW = Object.assign(JSON.parse(JSON.stringify(D.draft)), { id: NID, title: 'Pasta Nuova del Banco' })
let review = null, pubs = [], created = null, inBrigade = false
const CALLS = [], BODY = {}
const ctx = id => ({ doc: x => x === id ? (id === NID ? NEW : D.draft) : ((D.draft_docs || {})[x] || D.docs[x]), facts: x => D.facts[x], measures: D.measures })
function api(op, b) {
  CALLS.push(op); BODY[op] = b
  const u = { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null }
  const listRow = (id, title, lab) => ({ ...(id === WID || id === NID ? { da_tec: true } : {}), id, title, category: 'Pasta', menu: true, prep: false, archived: false, mre: true, draft: true, draft_version: 1, review: id === NID ? review : null, ...(lab ? { lab_only: true, draft_title: title } : {}) })
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-23', plan_date: '2026-10-23', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'ingredients': return { ingredients: [] }
    case 'mre_list': return { source: 'official', publish_locked: false, pending: 0, recipes: [listRow(WID, 'Wheel Pasta'), listRow(NID, NEW.title, !inBrigade), ...(created ? [listRow(created.id, created.title, true)] : [])] }
    case 'mre_new': if (/wheel pasta/i.test(b.title)) return [409, 'titolo_esistente']
      created = { id: '1c6e8b3f-2d4a-4f9b-8e7c-6a5d4b3c2e10', title: b.title.trim() }; return { ok: true, id: created.id, title: created.title }
    case 'mre_recipe': {
      const isNew = b.id === NID, isCreated = created && b.id === created.id
      const doc = isCreated ? { schema: 1, id: created.id, title: created.title, yield: {}, lines: [], steps: [], stock: [] } : isNew ? NEW : D.doc
      return { source: (isNew && !inBrigade) || isCreated ? 'lab' : 'official', read_at: new Date().toISOString(), publish_locked: false,
        recipe: { id: b.id, current_version: 0, linked: true, lab_only: (isNew && !inBrigade) || !!isCreated, review: isNew ? review : null },
        doc, docs: D.docs, draft_docs: D.draft_docs || {}, facts: D.facts, measures: D.measures, versions: [{ version: 2, state: 'bozza', at: new Date().toISOString(), by: 'Max', reason: b.id === NID ? 'Proposta nuova di T.E.C. per Max' : 'T.E.C. per Max: Diced Butter: 20 → 12 g' }], productions: [], suggestions: [],
        draft: Object.assign({}, doc, { id: b.id, _version: 1 }), diffs: [], cost: E.cost(isCreated ? WID : isNew ? NID : WID, 1, ctx(isNew ? NID : WID)) }
    }
    case 'mre_review': review = b.verified === false ? null : { by: 'Max', at: new Date().toISOString(), open: 0 }; return { ok: true, review }
    case 'mre_publish_preview': if (!review) return [409, 'serve_verificata']
      return { ok: true, empty: false, refusals: [], warnings: [{ code: 'campi_ufficio_dopo', msg: 'Gruppo menu, nome POS, prezzo di vendita, durata e foto si mettono dopo in Brigade 1 (campi ufficio)' }],
        summary: ['Ricetta NUOVA in Brigade: «Pasta Nuova del Banco»', 'Nuova riga: Diced Butter 10 g'], cost: { before: { food: 0, pack: 0, per_portion: null }, after: { food: 3.3, pack: 0, per_portion: 3.3 } },
        fc05_before: null, consequences: { sale: [] }, impronta: 'nuova:' + NID, piano: 'pl1' }
    case 'mre_publish': if (b.impronta !== 'nuova:' + NID) return [409, 'ricetta_cambiata']
      inBrigade = true; pubs = [{ id: 9, at: new Date().toISOString(), draft_version: 1, restored_at: null, created: true, summary: ['Ricetta NUOVA in Brigade: «Pasta Nuova del Banco»'] }]
      return { ok: true, publication: 9, version: 1, summary: [], checks: { rilettura: [], fc05_ok: true } }
    case 'mre_publications': return { items: b.id === NID ? pubs : [] }
    case 'mre_restore_official': if (BODY.__used) return [409, 'gia_usata']
      inBrigade = false; pubs = pubs.map(x => Object.assign({}, x, { restored_at: new Date().toISOString() })); return { ok: true, recipe: NID, publication: 9, withdrawn: true }
    case 'mre_translate': return { items: [] }
    default: return {}
  }
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = await webkit.launch()
async function page() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await c.newPage(); pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b)
    if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) })
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(1500)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 })
  return { pg, c }
}
const { pg, c } = await page()
ok(await pg.locator('#main .rm-row .rm-tec').count() === 2, 'nell\'elenco: 2 ricette segnate «da T.E.C.»')
ok(/da T\.E\.C\. · 2/.test(await pg.locator('#main .rm-chips').innerText()), 'filtro «da T.E.C. · 2»')
await pg.click('#main .rm-chips [data-v="tec"]'); await pg.waitForTimeout(400)
ok(await pg.locator('#main .rm-row').count() === 2, 'il filtro mostra solo le bozze di T.E.C.')
await pg.screenshot({ path: `${OUT}/1_elenco_tec.png` })
await pg.click('#main .rm-row:has(.name:text-is("Wheel Pasta"))'); await pg.waitForSelector('#main .mr-ings', { timeout: 20000 }); await pg.waitForTimeout(400)
const note = await pg.locator('#main .mr-tecnote').innerText().catch(() => '')
ok(/Bozza scritta da T\.E\.C\.: Diced Butter: 20 → 12 g/.test(note) && /T\.E\.C\. non pubblica mai/.test(note), 'nella ricetta: cosa ha scritto T.E.C. e che la pubblica solo lo Chef')
ok(await pg.locator('#main [data-m="pubprev"]').count() === 1, 'si pubblica come sempre (dopo «Verificata»)')
await pg.screenshot({ path: `${OUT}/2_scheda_tec.png` })
await c.close(); await browser.close()
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
