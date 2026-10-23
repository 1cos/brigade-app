// MR-12 «Pubblica una ricetta nuova» — the Chef's taps on an iPhone (WebKit), API answered in memory with the shapes of
// brigade-app-api/mre.ts: «+ Nuova ricetta» in the list → empty draft opens in the editor; a name already in Brigade → said in the form;
// a lab proposal → «Pubblica in Brigade come ricetta NUOVA…» → preview → two taps → created; History → «Ritira da Brigade» (two taps).
// Usage: PORT=<static server for web/> node tests/mr12/new_recipe_mock.mjs <wheel_pasta_draft.json> <outDir>
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
  const listRow = (id, title, lab) => ({ id, title, category: 'Pasta', menu: true, prep: false, archived: false, mre: true, draft: true, draft_version: 1, review: id === NID ? review : null, ...(lab ? { lab_only: true, draft_title: title } : {}) })
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
        doc, docs: D.docs, draft_docs: D.draft_docs || {}, facts: D.facts, measures: D.measures, versions: [{ version: 1, state: 'bozza', at: new Date().toISOString(), by: 'Max' }], productions: [], suggestions: [],
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
const n = op => CALLS.filter(x => x === op).length
const browser = await webkit.launch()
async function page() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await c.newPage(); pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); await new Promise(x => setTimeout(x, 60)); const out = api(b.op, b)
    if (Array.isArray(out)) return r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) })
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}))
  await pg.addInitScript(() => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', 'it'); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) })
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(1500)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 })
  return { pg, c }
}

/* 1. «+ Nuova ricetta»: a name already in Brigade is said in the form; a new name opens the empty draft in the editor */
let { pg, c } = await page()
ok(await pg.locator('#main [data-a="rmNewOpen"][data-v="1"]').count() === 1, 'nell\'elenco: «+ Nuova ricetta» per lo Chef')
await pg.click('#main [data-a="rmNewOpen"][data-v="1"]'); await pg.waitForSelector('#rmNewT')
await pg.click('#main [data-a="rmNewGo"]'); await pg.waitForTimeout(300)
ok(/Scrivi il nome della ricetta/.test(await pg.locator('#main .rm-new').innerText()) && n('mre_new') === 0, 'senza nome: lo dice, niente creato')
await pg.fill('#rmNewT', 'Wheel Pasta'); await pg.click('#main [data-a="rmNewGo"]'); await pg.waitForTimeout(600)
ok(/c'è già una ricetta con questo nome/.test(await pg.locator('#main .rm-new').innerText()), 'nome già in Brigade: lo dice nel riquadro')
ok((await pg.inputValue('#rmNewT')) === 'Wheel Pasta', 'il nome scritto resta (si corregge, non si riscrive)')
await pg.screenshot({ path: `${OUT}/1_nome_esistente.png` })
await pg.fill('#rmNewT', 'Crema di Zucca'); await pg.click('#main [data-a="rmNewKind"][data-v="prep"]'); await pg.fill('#rmNewT', 'Crema di Zucca')
await pg.click('#main [data-a="rmNewGo"]'); await pg.waitForTimeout(1500)
ok(BODY.mre_new && BODY.mre_new.title === 'Crema di Zucca' && BODY.mre_new.prep === true, 'crea la bozza con nome e tipo (Prep)')
ok(/Crema di Zucca/.test(await pg.locator('#main').innerText()) && await pg.locator('#main .mr-ings, #main .mr-ed, #main [data-m="savedraft"]').count() > 0, 'si apre la scheda della ricetta nuova, pronta da scrivere')
await pg.screenshot({ path: `${OUT}/2_bozza_nuova.png` })
await c.close()

/* 2. a lab proposal with its lines: «Pubblica in Brigade come ricetta NUOVA…» → preview → two taps → created */
;({ pg, c } = await page())
await pg.fill('#q', 'nuova del'); await pg.waitForTimeout(300)
await pg.click('#main .rm-row:has(.name:text-is("Pasta Nuova del Banco"))'); await pg.waitForSelector('#main .mr-ings', { timeout: 20000 }); await pg.waitForTimeout(400)
ok(/come ricetta NUOVA/.test(await pg.locator('#main .mr-pubbox').innerText()), 'nella proposta: «Pubblica in Brigade come ricetta NUOVA…»')
await pg.click('#main [data-m="review"]'); await pg.waitForTimeout(700)
await pg.click('#main [data-m="pubprev"]'); await pg.waitForSelector('#main [data-m="pubgo"]', { timeout: 5000 })
const box = await pg.locator('#main .mr-pubbox').innerText()
ok(/Ricetta NUOVA in Brigade: «Pasta Nuova del Banco»/.test(box) && /campi ufficio/.test(box), 'anteprima: ricetta nuova + campi ufficio dopo in Brigade 1')
ok(/Food cost a porzione: \$3[.,]30/.test(box) && !/\$0[.,]000 →/.test(box), 'anteprima: food cost della ricetta nuova, senza un «prima» che non esiste')
ok(/Crea la ricetta in Brigade/.test(await pg.locator('#main [data-m="pubgo"]').innerText()), 'pulsante: «Crea la ricetta in Brigade»')
await pg.screenshot({ path: `${OUT}/3_anteprima_nuova.png` })
await pg.click('#main [data-m="pubgo"]'); await pg.waitForTimeout(300)
ok(/Tocca di nuovo: crea la ricetta/.test(await pg.locator('#main [data-m="pubgo"]').innerText()) && n('mre_publish') === 0, 'primo tocco: chiede conferma, niente creato')
await pg.click('#main [data-m="pubgo"]'); await pg.waitForTimeout(1000)
ok(n('mre_publish') === 1 && /Creata in Brigade \(n\. 9\)/.test(await pg.locator('#main').innerText()), 'secondo tocco: creata, con la conferma nella scheda')
await pg.screenshot({ path: `${OUT}/4_creata.png` })

/* 3. History: «Ritira da Brigade», two taps */
await pg.click('#main [data-m="p:hist"]'); await pg.waitForTimeout(900)
ok(/Ritira da Brigade/.test(await pg.locator('#main').innerText()), 'Storico: «Ritira da Brigade» sulla ricetta creata')
await pg.click('#main [data-m="pubrestore:9"]'); await pg.waitForTimeout(300)
ok(/solo se niente la usa/.test(await pg.locator('#main [data-m="pubrestore:9"]').innerText()) && n('mre_restore_official') === 0, 'Ritira: primo tocco chiede conferma e dice la condizione')
await pg.click('#main [data-m="pubrestore:9"]'); await pg.waitForTimeout(1000)
ok(n('mre_restore_official') === 1 && /Ritirata: la ricetta non è più in Brigade/.test(await pg.locator('#main').innerText()), 'Ritira: secondo tocco, ritirata')
await pg.screenshot({ path: `${OUT}/5_ritirata.png` })
await c.close()
await browser.close()
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
