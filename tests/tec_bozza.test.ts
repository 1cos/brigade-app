// B-63: prove del modulo «T.E.C. scrive in bozza» sulla distinta vera della La N° 4 (letta in sola lettura il 22/10). Nessun database.
import { applica, impronta } from '../supabase/functions/brigade-app-api/tec_bozza.ts'
import * as E from '../supabase/functions/_shared/mre_engine.js'
const F = JSON.parse(await Deno.readTextFile(new URL('./tec_bozza_fixture_n4.json', import.meta.url)))
let ok = 0, ko = 0
const t = (n: string, c: boolean, x: unknown = '') => { c ? ok++ : ko++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' → ' + JSON.stringify(x).slice(0, 400))) }
const base = F.doc, nomi = F.nomi
const PEPERONCINO = '11111111-2222-4333-8444-555555555555'; const nomiPiu = { ...nomi, [PEPERONCINO]: 'Chili Flakes' }

// 1) «60… no, 55»: la pancetta da 60 a 55 g
let r = applica(base, [{ tipo: 'cambia_quantita', riga: 'b2314', quantita: 55 }], nomi)
t('pancetta 60 → 55 g, frase giusta', r.errori.length === 0 && r.doc.lines.find((l: any) => l.id === 'b2314').qty === 55 && r.frasi[0] === 'Pancetta: 60 g → 55 g', r)
t('le altre righe non cambiano', r.doc.lines.filter((l: any) => l.id !== 'b2314').every((l: any, i: number) => JSON.stringify(l) === JSON.stringify(base.lines.filter((x: any) => x.id !== 'b2314')[i])))
t('il documento di partenza non viene toccato', base.lines.find((l: any) => l.id === 'b2314').qty === 60)
t('documento valido per il motore', E.validate(r.doc, null, false).length === 0, E.validate(r.doc, null, false))
// 2) resa
r = applica(base, [{ tipo: 'cambia_resa', porzioni: 2 }], nomi)
t('porzioni 1 → 2', r.errori.length === 0 && r.doc.yield.portions === 2 && /Porzioni: 1 → 2/.test(r.frasi[0]), r)
// 3) riga nuova
r = applica(base, [{ tipo: 'aggiungi_riga', ref: PEPERONCINO, quantita: 1, unita: 'g' }], nomiPiu)
t('nuova riga Chili Flakes 1 g', r.errori.length === 0 && r.doc.lines.length === base.lines.length + 1 && r.frasi[0] === 'Nuova riga: Chili Flakes 1 g', r)
t('ingrediente sconosciuto rifiutato', applica(base, [{ tipo: 'aggiungi_riga', ref: '99999999-2222-4333-8444-555555555555', quantita: 1, unita: 'g' }], nomi).errori.some(e => /ingrediente_non_trovato/.test(e)))
t('ingrediente già presente: avviso', applica(base, [{ tipo: 'aggiungi_riga', ref: base.lines[2].ref, quantita: 5, unita: 'g' }], nomi).avvisi.some(a => /c'è già/.test(a)))
// 4) passo nuovo con numero collegato e tre lingue
r = applica(base, [{ tipo: 'aggiungi_passo', testo: 'Aggiungere 55 g di pancetta croccante e mescolare con il pecorino.', posizione: 2 }, { tipo: 'cambia_quantita', riga: 'b2314', quantita: 55 }], nomi)
const p2 = r.doc.steps[1]
t('passo nuovo in posizione 2, scritto in italiano', r.errori.length === 0 && r.doc.steps.length === 3 && p2.src === 'it', r)
t('numero collegato: 55 g NON collegato perché la pancetta era ancora 60 quando è stato scritto', !/\{\{b2314\}\}/.test(p2.it), p2.it)
r = applica(base, [{ tipo: 'cambia_quantita', riga: 'b2314', quantita: 55 }, { tipo: 'aggiungi_passo', testo: 'Aggiungere 55 g di pancetta croccante e mescolare con il pecorino.', posizione: 2 }], nomi)
t('numero collegato: 55 g → {{b2314}} se la quantità è già 55', /\{\{b2314\}\} g/.test(r.doc.steps[1].it), r.doc.steps[1].it)
t('inglese e spagnolo segnati da tradurre', r.doc.steps[1].tr.en === 'stale' && r.doc.steps[1].tr.es === 'stale')
t('indice del passo da tradurre = 1 (il secondo)', JSON.stringify(r.passi_da_tradurre) === '[1]', r.passi_da_tradurre)
t('documento con passo collegato valido', E.validate(r.doc, null, false).length === 0, E.validate(r.doc, null, false))
// 5) cambia passo
r = applica(base, [{ tipo: 'cambia_passo', numero: 1, testo: 'Cuocere la pasta fresca 2 minuti in acqua salata.' }], nomi)
t('passo 1 cambiato, frase prima → dopo', r.errori.length === 0 && /Passo 1: «Cuocere la pasta 3 minuti\.» → «Cuocere la pasta fresca 2 minuti/.test(r.frasi[0]), r)
t('passo inesistente rifiutato', applica(base, [{ tipo: 'cambia_passo', numero: 9, testo: 'x y z' }], nomi).errori.some(e => /passo_inesistente/.test(e)))
// 6) regole di Max: niente cancellazioni, niente prezzi, niente modifiche vuote
t('«togli riga» non ammesso', applica(base, [{ tipo: 'togli_riga', riga: 'b2314' } as any], nomi).errori.some(e => /tipo_non_ammesso/.test(e)))
t('prezzi non ammessi', applica(base, [{ tipo: 'cambia_prezzo', riga: 'b2314', usd: 1 } as any], nomi).errori.some(e => /tipo_non_ammesso/.test(e)))
t('riga inesistente rifiutata', applica(base, [{ tipo: 'cambia_quantita', riga: 'b9999', quantita: 5 }], nomi).errori.some(e => /riga_inesistente/.test(e)))
t('quantità zero o negativa rifiutata', applica(base, [{ tipo: 'cambia_quantita', riga: 'b2314', quantita: -3 }], nomi).errori.length === 1)
t('unità sconosciuta rifiutata', applica(base, [{ tipo: 'cambia_quantita', riga: 'b2314', quantita: 5, unita: 'secchiate' }], nomi).errori.some(e => /unita_sconosciuta/.test(e)))
t('nessuna modifica rifiutata', applica(base, [], nomi).errori.includes('nessuna_modifica'))
t('più di 20 modifiche rifiutate', applica(base, Array(21).fill({ tipo: 'cambia_resa', porzioni: 1 }), nomi).errori.includes('troppe_modifiche'))
// 7) impronta
const i1 = await impronta(base), i2 = await impronta(JSON.parse(JSON.stringify(base)))
const i3 = await impronta(applica(base, [{ tipo: 'cambia_quantita', riga: 'b2314', quantita: 55 }], nomi).doc)
t('impronta stabile per la stessa ricetta', i1 === i2 && i1.length === 32)
t('impronta cambia se la ricetta cambia', i1 !== i3)
const riordinato = Object.fromEntries(Object.entries(base).reverse())
t('impronta non dipende dall\'ordine delle chiavi', (await impronta(riordinato)) === i1)
console.log(`\n${ok}/${ok + ko} PASS`)
// 8) rilettura (confronta)
{
  const { confronta } = await import('../supabase/functions/brigade-app-api/tec_bozza.ts')
  const r1 = applica(base, [{ tipo: 'cambia_quantita', riga: 'b2314', quantita: 55 }, { tipo: 'cambia_resa', porzioni: 2 }], nomi)
  const c = confronta(base, r1.doc, nomi)
  t('rilettura: stesse frasi della modifica', JSON.stringify(c) === JSON.stringify(['Pancetta: 60 g → 55 g', 'Porzioni: 1 → 2']), c)
  t('rilettura: nessuna differenza se uguale', confronta(base, JSON.parse(JSON.stringify(base)), nomi).length === 0)
  const tolta = JSON.parse(JSON.stringify(base)); tolta.lines.pop()
  t('rilettura: una riga sparita viene segnalata (allarme)', confronta(base, tolta, nomi).some((x: string) => /Riga tolta: Liquid egg whites/.test(x)))
  const r2 = applica(base, [{ tipo: 'aggiungi_passo', testo: 'Impiattare e servire subito ben caldo.' }], nomi)
  t('rilettura: passo nuovo visto', confronta(base, r2.doc, nomi).some((x: string) => /Nuovo passo 3/.test(x)), confronta(base, r2.doc, nomi))
  console.log(`\n${ok}/${ok + ko} PASS (con rilettura)`)
}
