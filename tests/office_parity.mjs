// B-25 module 1 — parity test: Shell V020 (published code, commit 23f5616) vs Brigade 2.0 office engine,
// on the SAME read-only dump of live Brigade data. Nothing is sent anywhere.
// Usage: node tests/office_parity.mjs <v020 app.js> <snap_clean.json> [out.json]
import fs from 'node:fs'
import vm from 'node:vm'
import * as O from '../supabase/functions/_shared/office_core.js'
const [V020, SNAP, OUT] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(SNAP)), NOW = new Date(D.at).getTime()
let pass = 0, fail = 0; const notes = []
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++ }

/* ---- V020: run its own triage code, with Brigade data served from the dump ---- */
const src = fs.readFileSync(V020, 'utf8')
const part = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker ' + a); return src.slice(i, j) }
const store = { recipes: D.recipes, office: D.office, invwarn: D.invwarn, docs: D.docs, attention: D.attention, yields: D.yields,
  bom: D.bom.flatMap(b => Array.from({ length: b.n }, () => ({ parent_recipe_id: b.parent_recipe_id }))) }
const code = 'const BRIGADE_URL = "https://1cos.github.io/back-of-house/";\n' + part('const $ = id', '/* data gate') + part('/* ============ TRIAGE', '/* ============ TODAY')
  + part('SCREENS.decisions', '/* ============ RESTAURANT') + part("SCREENS['r-inv']", "SCREENS['r-brief']")
  + '\n;({ triage, invoiceCards, decCard, SCREENS })'
const realNow = Date.now
const ctx = { BD: { peek: n => store[n], store: Object.fromEntries(Object.keys(store).map(k => [k, { at: 1 }])), today: () => '2026-10-15' },
  SCREENS: {}, need: () => true, backBtn: () => '', head: (a, b, c) => `<head>${a}|${b}|${c}</head>`, roNote: () => '', Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(NOW) } static now() { return NOW } },
  Intl, Math, String, Object, Array, Set, JSON, parseFloat, isFinite, RegExp, Number, document: {} }
const V = vm.runInNewContext(code, ctx)
const vt = V.triage()

/* ---- Brigade 2.0: the server engine on the same data (built as office.ts builds it) ---- */
const rids = new Set(D.attention.map(a => a.recipe_id).filter(Boolean)), titles = {}
D.recipes.forEach(r => { if (rids.has(r.id)) titles[r.id] = r.title })
const bomIds = new Set(D.attention.filter(a => a.reason === 'bom_maybe_incomplete').map(a => a.recipe_id)), bomN = {}
D.bom.forEach(b => { if (bomIds.has(b.parent_recipe_id)) bomN[b.parent_recipe_id] = b.n })
const yIds = new Set(D.attention.filter(a => a.reason === 'portions_unknown').map(a => a.recipe_id)), yields = {}
D.yields.forEach(y => { if (yIds.has(y.id)) yields[y.id] = y })
const office = D.office.map(({ id, created_at, from_user, title, summary, body, recipe_id, recipe_name }) => ({ id, created_at, from_user, title, summary, body, recipe_id, recipe_name }))
const nt = O.triage({ attention: D.attention, office, invwarn: D.invwarn, docs: D.docs, titles, bomN, yields }, NOW)

/* ---- the app's English words for Brigade 2.0 cards ---- */
globalThis.window = { I18N: { lang: 'en', locale: () => 'en-US' } }
vm.runInThisContext(fs.readFileSync(new URL('../web/office.js', import.meta.url), 'utf8'))
const UI = window.OfficeUI
const un = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const txt = x => un(UI.T(x, 'en'))
// V020 prints "range · " with an empty date (a dangling dot): the dot separators are ignored in the comparison
const textOf = html => un(String(html).replace(/<[^>]+>/g, ' ')).replace(/·/g, ' ').replace(/\s+/g, ' ').trim()

/* 1. decisions: same cards, same order, same words */
ok(vt.decisions.length === nt.decisions.length, `numero decisioni: V020 ${vt.decisions.length} · Brigade 2.0 ${nt.decisions.length}`)
let same = 0
vt.decisions.forEach((v, i) => {
  const n = nt.decisions[i] || {}
  const vCard = textOf(V.decCard(Object.assign({}, v, { cta: '', cta2: '' })))
  const nCard = textOf(UI.card(Object.assign({}, n, { cta: null, area: 'x' })))
  const eq = v.sev === n.sev && v.cls === n.cls && v.today === n.today && vCard === nCard
  if (eq) same++; else notes.push({ i, v020: vCard, app: nCard, sev: [v.sev, n.sev], cls: [v.cls, n.cls] })
})
ok(same === vt.decisions.length, `decisioni identiche (titolo, gravità, oggi/non oggi, spiegazione, righe, cosa manca, data): ${same}/${vt.decisions.length}`)
ok(vt.decisions.filter(d => d.today).length === nt.decisions.filter(d => d.today).length, `"da fare oggi" (Il mio turno / Today): V020 ${vt.decisions.filter(d => d.today).length} · Brigade 2.0 ${nt.decisions.filter(d => d.today).length}`)
/* 2. history, out-of-date, completeness */
ok(vt.history.length === nt.history.length && vt.stale.length === nt.stale.length, `storico ${vt.history.length}/${nt.history.length} · superati ${vt.stale.length}/${nt.stale.length}`)
const vg = {}, ng = {}; vt.history.forEach(h => { vg[h.kind] = (vg[h.kind] || 0) + 1 }); nt.history.forEach(h => { const k = txt({ k: h.group }); ng[k] = (ng[k] || 0) + 1 })
ok(JSON.stringify(Object.entries(vg).sort()) === JSON.stringify(Object.entries(ng).sort()), `gruppi dello storico uguali: ${JSON.stringify(vg)}`)
let hs = 0; vt.history.forEach((h, i) => { const n = nt.history[i]; if (h.title === txt(n.title) && (h.why || '') === txt(n.why) && h.sev === n.sev) hs++; else notes.push({ hist: i, v020: [h.title, h.why], app: [txt(n.title), txt(n.why)] }) })
ok(hs === vt.history.length, `righe dello storico identiche: ${hs}/${vt.history.length}`)
ok(vt.completeness.length === nt.completeness.length, `completezza ricette (solo conteggio, schermata = modulo 2): ${vt.completeness.length}/${nt.completeness.length}`)
/* 3. invoices screen: run V020's own screen and compare section by section */
const vInv = V.SCREENS['r-inv'].render()
const vSecs = {}; for (const m of vInv.matchAll(/<h2>([^<]+)<\/h2><span>(\d+)<\/span>/g)) vSecs[m[1]] = +m[2]
const ni = nt.invoices
ok((vSecs['Needs you'] || 0) === ni.needs.length && (vSecs['Waiting in review'] || 0) === ni.queue.length && (vSecs['For information'] || 0) === ni.info.length,
  `fatture per sezione: V020 ${JSON.stringify(vSecs)} · Brigade 2.0 ${JSON.stringify({ needs: ni.needs.length, queue: ni.queue.length, info: ni.info.length, docs: ni.docs.length })}`)
ok((vSecs['Documents · last 30 days'] || 0) === ni.docs.length, `documenti ultimi 30 giorni: ${ni.docs.length}`)
const vHead = (vInv.match(/<head>([^<]*)<\/head>/) || [])[1] || ''
ok(vHead.includes(`${ni.warnings} open warnings`) && vHead.includes(`${ni.invoices} invoice`), `intestazione fatture: "${vHead.split('|')[2]}"`)
const vCards = [...vInv.matchAll(/<div class="dec">[\s\S]*?<\/div>\s*<\/div>/g)].length
const vInvCards = [...vInv.split('<div class="dec">').slice(1)].map(h => textOf('<div>' + h).replace(/ Open invoices in Brigade ↗| Review in Brigade ↗/g, '').trim())
const nInvCards = [...ni.needs, ...ni.queue, ...ni.info].map(c => textOf(UI.card(Object.assign({}, c, { cta: null, area: 'x' }))))
  .concat(ni.excluded ? [textOf(UI.card({ sev: 'neutral', title: { k: 'of_excluded', p: { n: ni.excluded } }, why: { k: 'of_excluded_why' } }))] : [])
let ic = 0; vInvCards.forEach((v, i) => { const n = nInvCards[i] || ''; if (v.startsWith(n) || v.replace(/ Documents · last 30 days.*$/, '') === n) ic++; else notes.push({ inv: i, v020: v.slice(0, 300), app: n.slice(0, 300) }) })
ok(ic === vInvCards.length && vInvCards.length === nInvCards.length, `schede fattura identiche: ${ic}/${vInvCards.length} (Brigade 2.0: ${nInvCards.length})`)
/* 4. three languages: every key used by the cards exists in en, it, es */
const keys = new Set(); const walk = x => { if (!x || typeof x !== 'object') return; if (x.k) keys.add(x.k); Object.values(x).forEach(walk) }; walk(nt)
const missing = [...keys].filter(k => !UI._W[k])
ok(!missing.length, `testi presenti per tutte le ${keys.size} chiavi usate${missing.length ? ': mancano ' + missing.join(', ') : ''}`)
let three = 0; for (const lang of ['it', 'es']) { const all = nt.decisions.map(d => un(UI.T(d.title, lang))); if (all.every(s => s && !/^of_/.test(s))) three++ }
ok(three === 2, 'titoli resi in italiano e spagnolo senza chiavi grezze')

console.log(`\nRISULTATO: ${pass} superati, ${fail} falliti`)
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ pass, fail, v020: { decisions: vt.decisions.length, today: vt.decisions.filter(d => d.today).length, history: vt.history.length, stale: vt.stale.length, completeness: vt.completeness.length, invoices: vSecs },
  app: { decisions: nt.decisions.length, today: nt.decisions.filter(d => d.today).length, history: nt.history.length, stale: nt.stale.length, completeness: nt.completeness.length, invoices: { needs: ni.needs.length, queue: ni.queue.length, info: ni.info.length, excluded: ni.excluded, docs: ni.docs.length, warnings: ni.warnings } },
  titles_en: nt.decisions.map(d => txt(d.title)), titles_it: nt.decisions.map(d => un(UI.T(d.title, 'it'))), diffs: notes }, null, 2))
if (notes.length) console.log('differenze:', JSON.stringify(notes.slice(0, 6), null, 1))
process.exitCode = fail ? 1 : 0
