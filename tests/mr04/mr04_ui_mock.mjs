// MR-04 «Pubblica ricetta per ricetta» — the Chef's taps on an iPhone (WebKit), API answered in memory with the shapes of
// brigade-app-api/mre.ts (preview → two taps → publish; History → two taps → restore). Recipe = the real Wheel Pasta draft dump.
// Usage: PORT=<static server for web/> node tests/mr04/mr04_ui_mock.mjs <wheel_pasta_draft.json> <outDir>
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
async function page(lg = 'it') {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pg = await c.newPage()
  pg.on('pageerror', e => ok(false, 'errore JS: ' + e.message))
  await pg.route('**/functions/v1/brigade-app-api*', async r => { const b = JSON.parse(r.request().postData() || '{}'); await new Promise(x => setTimeout(x, 80))
    const out = api(b.op, b); try { if (Array.isArray(out)) return await r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify({ ok: false, error: out[1] }) }); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) } catch (e) {} })
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}))
  await pg.addInitScript(l => { localStorage.setItem('brigade-app-token', 'a'.repeat(64)); localStorage.setItem('brigade-app-lang', l); navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()) }, lg)
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForTimeout(1500)
  await pg.click('button.w[data-w="restaurant"]'); await pg.waitForSelector('#q', { timeout: 20000 }); await pg.fill('#q', 'wheel')
  await pg.click('#main .rm-row:has(.name:text-is("Wheel Pasta"))'); await pg.waitForSelector('#main .mr-ings', { timeout: 20000 }); await pg.waitForTimeout(400)
  return { pg, c }
}
const n = op => CALLS.filter(x => x === op).length

/* 1. switch off (today): no «Pubblica in Brigade» anywhere */
locked = true
let { pg, c } = await page()
ok(await pg.locator('#main [data-m="pubprev"]').count() === 0, 'interruttore spento: nessun «Pubblica in Brigade»')
await c.close()

/* 2-3. MR-26: ONE button «Salva e pubblica» (no separate «Verificata» button) → records Verificata, shows what changes → «Conferma» publishes */
locked = false; review = null
;({ pg, c } = await page())
ok(await pg.locator('#main [data-m="pubprev"]').count() === 1 && /Salva e pubblica/.test(await pg.locator('#main [data-m="pubprev"]').innerText()), 'un solo tasto «Salva e pubblica» nella ricetta')
ok(await pg.locator('#main [data-m="review"]').count() === 0, 'nessun tasto «Verificata» separato quando c\'è una bozza')
ok(/Prima ti mostro cosa cambia/.test(await pg.locator('#main .mr-onenote').innerText()), 'spiega che prima mostra cosa cambia')
await pg.screenshot({ path: `${OUT}/1_tasto.png` })
await pg.click('#main [data-m="pubprev"]'); await pg.waitForSelector('#main [data-m="pubgo"]', { timeout: 5000 })
ok(n('mre_review') === 1 && review && n('mre_publish') === 0, 'primo tocco: Verificata registrata a parte, niente pubblicato')
const box = await pg.locator('#main .mr-pubbox').innerText()
ok(/Diced Butter: 20 → 10/.test(box) && /Procedimento: 0 → 17 passi/.test(box), 'anteprima: cosa cambia in Brigade')
ok(/Food cost a porzione: \$0[.,]389 → \$3[.,]32/.test(box), 'anteprima: food cost a porzione prima → dopo')
ok(/FC05 oggi/.test(box) && /scaricherà diversamente: 2/.test(box), 'anteprima: FC05 oggi e scarico di 1 porzione')
ok(/niente traduzione inventata/.test(box), 'anteprima: avviso sulle lingue')
ok(/Conferma: pubblica in Brigade/.test(await pg.locator('#main [data-m="pubgo"]').innerText()), 'tasto «Conferma: pubblica in Brigade»')
await pg.screenshot({ path: `${OUT}/2_anteprima.png`, fullPage: false })
await pg.click('#main [data-m="pubgo"]'); await pg.waitForTimeout(900)
ok(n('mre_publish') === 1, 'secondo tocco: UNA pubblicazione')
ok(/Pubblicata in Brigade \(n\. 7\)/.test(await pg.locator('#main').innerText()), 'conferma nella scheda: pubblicata, controllata, ripristinabile')
await pg.screenshot({ path: `${OUT}/3_pubblicata.png` })

/* 4. History: the publication with «Ripristina com'era» (two taps) */
await pg.click('#main [data-m="p:hist"]'); await pg.waitForTimeout(900)
ok(/Pubblicazioni in Brigade/i.test(await pg.locator('#main').innerText()), 'Storico: elenco delle pubblicazioni')
await pg.click('#main [data-m="pubrestore:7"]'); await pg.waitForTimeout(300)
ok(/Tocca di nuovo/.test(await pg.locator('#main [data-m="pubrestore:7"]').innerText()) && n('mre_restore_official') === 0, 'Ripristina: primo tocco chiede conferma')
await pg.click('#main [data-m="pubrestore:7"]'); await pg.waitForTimeout(900)
ok(n('mre_restore_official') === 1 && /esattamente com'era/.test(await pg.locator('#main').innerText()), 'Ripristina: secondo tocco, ricetta come prima')
await pg.screenshot({ path: `${OUT}/4_ripristinata.png` })
await c.close()

/* 5. refused preview: the reasons, NO publish button */
scenario = 'refused'; review = { by: 'Max', at: new Date().toISOString() }
;({ pg, c } = await page())
await pg.click('#main [data-m="pubprev"]'); await pg.waitForTimeout(700)
ok(/Non si può ancora pubblicare/.test(await pg.locator('#main .mr-pubbox').innerText()) && await pg.locator('#main [data-m="pubgo"]').count() === 0, 'rifiutata: motivi scritti, nessun pulsante per pubblicare')
ok(/Sistema nella ricetta/.test(await pg.locator('#main .mr-pubbox').innerText()), 'rifiutata: dice cosa fare')
await pg.screenshot({ path: `${OUT}/5_rifiutata.png` })
await pg.click('#main [data-m="pubno"]'); await pg.waitForTimeout(300)
ok(await pg.locator('#main [data-m="pubprev"]').count() === 1, '«Indietro» chiude l\'anteprima')
await c.close()

/* 6. staff: never sees it */
role = 'staff'
;({ pg, c } = await page())
ok(await pg.locator('#main [data-m="pubprev"]').count() === 0, 'personale: nessun «Pubblica»')
await c.close()

/* 7. English */
role = 'chef'; scenario = 'ok'
;({ pg, c } = await page('en'))
ok(/Save and publish/.test(await pg.locator('#main [data-m="pubprev"]').innerText()), 'in inglese: «Save and publish»')
await c.close()
await browser.close()
console.log(`\nTOTALE ${pass} PASS, ${fail} FAIL`)
