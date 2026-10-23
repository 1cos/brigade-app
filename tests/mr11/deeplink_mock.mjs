// MR-11 — Brigade 1 «Modifica in Recipe Master» opens index.html?ricetta=<id>: the recipe opens by itself in the Recipe Master card
// (iPhone WebKit, API answered in memory as in tests/mr04/mr04_ui_mock.mjs). Usage: PORT=<static server for web/> node tests/mr11/deeplink_mock.mjs <wheel_pasta_draft.json> <outDir>
import { webkit } from '/Users/massimilianozubboli/cw-probe/node_modules/playwright-core/index.mjs'
import fs from 'node:fs'
import * as E from '../../supabase/functions/_shared/mre_engine.js'
const [DUMP, OUT] = process.argv.slice(2), PORT = process.env.PORT || '18791'
fs.mkdirSync(OUT, { recursive: true })
const D = JSON.parse(fs.readFileSync(DUMP, 'utf8')), ID = D.recipe.id
let role = 'chef', locked = false, review = null, scenario = 'ok', pubs = []
const CALLS = []
const ctx = () => ({ doc: x => x === ID ? D.draft : ((D.draft_docs || {})[x] || D.docs[x]), facts: x => D.facts[x], measures: D.measures })
const PREVIEW = () => scenario === 'refused'
  ? { ok: false, empty: false, refusals: [{ code: 'articolo_non_attivo', msg: 'Parmesan Flakes: l\'articolo è «non attivo» in Brigade' }], warnings: [], summary: ['Diced Butter: 20 → 10'], cost: { before: { food: 0.389, pack: 0, per_portion: 0.389 }, after: { food: 3.324, pack: 0, per_portion: 3.324 } }, fc05_before: 0.389, consequences: { sale: [] }, impronta: 'fp1', piano: 'pl1' }
  : { ok: true, empty: false, refusals: [], warnings: [{ code: 'passi_senza_traduzione', msg: 'Passi senza testo in EN, ES: in quella lingua Brigade 1 traduce da sé o mostra l\'originale; niente traduzione inventata' }],
      summary: ['Diced Butter: 20 → 10', 'Cheese Wheel: articolo cambiato', 'Procedimento: 0 → 17 passi'], cost: { before: { food: 0.389, pack: 0, per_portion: 0.389 }, after: { food: 3.324, pack: 0, per_portion: 3.324 } },
      fc05_before: 0.389, consequences: { sale: [{ key: 'x' }, { key: 'y' }] }, impronta: 'fp1', piano: 'pl1' }
function api(op, b) {
  CALLS.push(op)
  const chef = role === 'chef', u = chef ? { id: 1, name: 'Max', role: 'chef', lang: 'it', station: null } : { id: 38, name: 'Pablo', role: 'staff', lang: 'it', station: 'Pasta' }
  switch (op) {
    case 'me': return { ok: true, user: u, build: 'mock' }
    case 'shift': return { build: 'mock', today: '2026-10-22', plan_date: '2026-10-22', user: u, items: [], messages: [], done_today: [], reports: [], people: [] }
    case 'ingredients': return { ingredients: [] }
    case 'mre_list': return { source: 'official', publish_locked: locked, pending: 0, recipes: [{ id: ID, title: 'Wheel Pasta', category: 'Pasta', menu: true, prep: false, archived: false, mre: true, ...(chef ? { draft: true, draft_version: 2, review, pending: 0 } : {}) }] }
    case 'mre_recipe': {
      const facts = {}; for (const k of Object.keys(D.facts)) facts[k] = chef ? D.facts[k] : (({ price, ...r }) => r)(D.facts[k])
      return { source: 'official', read_at: new Date().toISOString(), publish_locked: locked, recipe: { id: ID, current_version: 1, linked: true, review: chef ? review : null },
        doc: D.doc, docs: D.docs, draft_docs: chef ? (D.draft_docs || {}) : {}, facts, measures: D.measures, versions: [], productions: [], suggestions: [],
        draft: chef ? Object.assign({}, D.draft, { id: ID, _version: 2 }) : null, diffs: chef ? [] : undefined, cost: chef ? E.cost(ID, 1, ctx()) : undefined }
    }
    case 'mre_review': if (!chef) return [403, 'forbidden']; review = b.verified === false ? null : { by: 'Max', at: new Date().toISOString(), open: 1 }; return { ok: true, review }
    case 'mre_publish_preview': if (!chef) return [403, 'forbidden']; if (locked) return [423, 'pubblicazione_bloccata']; if (!review) return [409, 'serve_verificata']; return PREVIEW()
    case 'mre_publish': if (!chef) return [403, 'forbidden']; if (b.impronta !== 'fp1' || b.piano !== 'pl1') return [409, 'ricetta_cambiata']
      pubs = [{ id: 7, at: new Date().toISOString(), draft_version: 2, restored_at: null, summary: PREVIEW().summary }]; return { ok: true, publication: 7, version: 2, summary: PREVIEW().summary, checks: { rilettura: [], fc05_ok: true } }
    case 'mre_publications': return { items: pubs }
    case 'mre_restore_official': if (b.publication !== 7) return [409, 'pubblicazione_sconosciuta']; pubs = pubs.map(x => Object.assign({}, x, { restored_at: new Date().toISOString() })); return { ok: true, recipe: ID, publication: 7 }
    case 'mre_translate': return { items: [] }
    default: return {}
  }
}
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }
const browser = await webkit.launch()
async function open(q, token = true) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await c.newPage(); pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); const out = api(b.op, b)
    if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) })
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}))
  await pg.addInitScript(t => { if (t) localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, token)
  await pg.goto(`http://127.0.0.1:${PORT}/index.html${q}`); await pg.waitForTimeout(1800)
  return { pg, c }
}
{ const { pg, c } = await open('?ricetta=' + ID)
  const card = await pg.waitForSelector('#main .mr-ings', { timeout: 20000 }).then(() => true, () => false)
  ok(card, 'con ?ricetta=<id> si apre la scheda Recipe Master della Wheel Pasta, senza cercarla')
  ok(/Wheel Pasta/.test(await pg.textContent('#main')), 'è proprio la Wheel Pasta')
  ok(!/ricetta=/.test(pg.url()), 'il link si consuma: ricaricando non si riapre da solo (' + pg.url() + ')')
  await pg.screenshot({ path: `${OUT}/deeplink_wheel.png` }); await c.close() }
{ const { pg, c } = await open('?ricetta=non-un-id')
  ok(!(await pg.$('#main .mr-ings')), 'un valore che non è un id viene ignorato'); await c.close() }
{ const { pg, c } = await open('')
  ok(!(await pg.$('#main .mr-ings')), 'senza link: l\'app si apre come sempre'); await c.close() }
await browser.close()
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
