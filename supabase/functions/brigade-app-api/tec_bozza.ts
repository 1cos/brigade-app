// B-63 (Max 22/10/2026): T.E.C. scrive IN BOZZA per Max. Modulo puro: applica una lista di modifiche a un documento ricetta
// (forma Editor, la stessa di mre_save_draft) e dice in italiano cosa cambia. Niente database qui: lo usa mre.ts.
// Regole di Max: solo bozze, mai pubblicare, mai cancellare (niente «togli riga»), mai prezzi. Ogni modifica è firmata T.E.C.
import * as E from '../_shared/mre_engine.js'

export type Modifica =
  | { tipo: 'cambia_quantita'; riga: string; quantita: number; unita?: string }
  | { tipo: 'cambia_resa'; grammi?: number | null; porzioni?: number | null }
  | { tipo: 'aggiungi_riga'; ref: string; genere?: 'ingredient' | 'recipe'; quantita: number; unita: string; nota?: string }
  | { tipo: 'aggiungi_passo'; testo: string; posizione?: number }
  | { tipo: 'cambia_passo'; numero: number; testo: string }

export type Esito = { doc: any; frasi: string[]; avvisi: string[]; errori: string[]; passi_da_tradurre: number[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const num = (x: unknown) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && isFinite(Number(x)) ? Number(x) : NaN
// T.E.C. lavora a voce: solo peso, volume, pezzi e poche misure da cucina conosciute (niente parole inventate)
const MISURE_CUCINA = ['pizzico', 'pinch', 'foglio', 'spicchio', 'spicchi', 'rametto', 'mazzetto', 'q.b.', 'qb', 'drops']
export const unitaAmmessa = (u: unknown) => { const d = E.dimOf(u); return d === 'm' || d === 'v' || d === 'c' || (d === 'k' && MISURE_CUCINA.includes(E.normUnit(u))) }
const fmt = (q: unknown, u: unknown) => (q == null ? '?' : String(Number(q))) + (u ? ' ' + u : '')

/** JSON con le chiavi in ordine: stessa ricetta = stessa stringa. */
export function canon(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']'
  if (x && typeof x === 'object') return '{' + Object.keys(x as any).sort().map(k => JSON.stringify(k) + ':' + canon((x as any)[k])).join(',') + '}'
  return JSON.stringify(x === undefined ? null : x)
}
/** Impronta della versione letta: se qualcuno cambia la bozza nel frattempo, il salvataggio si ferma. */
export async function impronta(doc: unknown): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon(doc)))
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/** nomi: id ingrediente/ricetta → nome (per le frasi e per sapere se esiste). */
export function applica(base: any, modifiche: Modifica[], nomi: Record<string, string>): Esito {
  const doc = JSON.parse(JSON.stringify(base || {}))
  doc.lines = Array.isArray(doc.lines) ? doc.lines : []; doc.steps = Array.isArray(doc.steps) ? doc.steps : []; doc.yield = doc.yield || {}
  const frasi: string[] = [], avvisi: string[] = [], errori: string[] = [], passi = new Set<number>()
  const nomeRiga = (l: any) => nomi[l.ref] || 'riga ' + l.id
  if (!Array.isArray(modifiche) || modifiche.length === 0) errori.push('nessuna_modifica')
  if (Array.isArray(modifiche) && modifiche.length > 20) errori.push('troppe_modifiche')
  for (const [i, m] of (Array.isArray(modifiche) ? modifiche.slice(0, 20) : []).entries()) {
    const n = i + 1
    switch (m && (m as any).tipo) {
      case 'cambia_quantita': {
        const mm = m as any, l = doc.lines.find((x: any) => x.id === mm.riga), q = num(mm.quantita)
        if (!l) { errori.push(`modifica ${n}: riga_inesistente (${mm.riga})`); break }
        if (!(q > 0)) { errori.push(`modifica ${n}: quantita_non_valida`); break }
        const u = mm.unita ? String(mm.unita).slice(0, 20) : l.unit
        if (!unitaAmmessa(u)) { errori.push(`modifica ${n}: unita_sconosciuta (${u})`); break }
        if (l.unit && E.dimOf(l.unit) != null && E.dimOf(u) !== E.dimOf(l.unit)) avvisi.push(`modifica ${n}: cambia il tipo di unità (${l.unit} → ${u})`)
        frasi.push(`${nomeRiga(l)}: ${fmt(l.qty, l.unit)} → ${fmt(q, u)}`)
        l.qty = q; l.unit = u
        break
      }
      case 'cambia_resa': {
        const mm = m as any, g = mm.grammi == null ? undefined : num(mm.grammi), p = mm.porzioni == null ? undefined : num(mm.porzioni)
        if (g === undefined && p === undefined) { errori.push(`modifica ${n}: resa_vuota`); break }
        if ((g !== undefined && !(g > 0)) || (p !== undefined && !(p > 0))) { errori.push(`modifica ${n}: resa_non_valida`); break }
        if (g !== undefined) { frasi.push(`Resa: ${fmt(doc.yield.g, 'g')} → ${fmt(g, 'g')}`); doc.yield.g = g }
        if (p !== undefined) { frasi.push(`Porzioni: ${fmt(doc.yield.portions, '')} → ${fmt(p, '')}`.replace(/ +$/, '').replace(/  /g, ' ')); doc.yield.portions = p }
        if (doc.yield.portion_g && doc.yield.g && doc.yield.portions) avvisi.push(`modifica ${n}: c'è anche il peso a porzione (${doc.yield.portion_g} g): controlla che torni`)
        break
      }
      case 'aggiungi_riga': {
        const mm = m as any, q = num(mm.quantita), u = String(mm.unita || '').slice(0, 20), kind = mm.genere === 'recipe' ? 'recipe' : 'ingredient'
        if (!UUID.test(String(mm.ref || ''))) { errori.push(`modifica ${n}: ingrediente_non_valido`); break }
        if (!nomi[mm.ref]) { errori.push(`modifica ${n}: ingrediente_non_trovato`); break }
        if (!(q > 0)) { errori.push(`modifica ${n}: quantita_non_valida`); break }
        if (!unitaAmmessa(u)) { errori.push(`modifica ${n}: unita_sconosciuta (${u})`); break }
        if (doc.lines.some((x: any) => x.ref === mm.ref)) avvisi.push(`modifica ${n}: ${nomi[mm.ref]} c'è già nella ricetta`)
        const id = 't' + Date.now().toString(36) + i
        doc.lines.push({ id, kind, ref: mm.ref, qty: q, unit: u, role: 'produzione', note: mm.nota ? String(mm.nota).slice(0, 300) : null, group: null })
        frasi.push(`Nuova riga: ${nomi[mm.ref]} ${fmt(q, u)}`)
        break
      }
      case 'aggiungi_passo': case 'cambia_passo': {
        const mm = m as any, testo = String(mm.testo || '').trim().slice(0, 4000)
        if (!testo) { errori.push(`modifica ${n}: testo_vuoto`); break }
        const g = E.langOf(testo), lang = g.lang
        const collegato = E.linkNumbers(testo, doc)
        const st: any = { it: '', en: '', es: '', src: lang, tr: {}, _tradurre: true }
        st[lang] = collegato
        for (const k of ['it', 'en', 'es']) if (k !== lang) st.tr[k] = 'stale'
        if (!g.sure) avvisi.push(`modifica ${n}: lingua del testo incerta (scelta: ${lang})`)
        if ((m as any).tipo === 'aggiungi_passo') {
          const pos = mm.posizione == null ? doc.steps.length + 1 : Math.trunc(num(mm.posizione))
          if (!(pos >= 1 && pos <= doc.steps.length + 1)) { errori.push(`modifica ${n}: posizione_non_valida`); break }
          doc.steps.splice(pos - 1, 0, st)
          frasi.push(`Nuovo passo ${pos}: «${testo.slice(0, 120)}»`)
        } else {
          const k = Math.trunc(num(mm.numero))
          if (!(k >= 1 && k <= doc.steps.length)) { errori.push(`modifica ${n}: passo_inesistente (${mm.numero})`); break }
          const prima = E.stepIn(doc.steps[k - 1], lang).text
          doc.steps[k - 1] = Object.assign({}, doc.steps[k - 1], st)
          frasi.push(`Passo ${k}: «${String(prima).slice(0, 80)}» → «${testo.slice(0, 120)}»`)
        }
        const legati = (collegato.match(/\{\{[^}]+\}\}/g) || []).length
        if (legati) avvisi.push(`modifica ${n}: ${legati} numero/i collegato/i alla ricetta (cambiano con le dosi)`)
        break
      }
      default: errori.push(`modifica ${n}: tipo_non_ammesso (${(m as any)?.tipo})`)   // niente «togli riga», niente prezzi: regola di Max
    }
  }
  doc.steps.forEach((s: any, i: number) => { if (s && s._tradurre) { passi.add(i); delete s._tradurre } })   // indici finali, anche dopo inserimenti
  return { doc, frasi, avvisi, errori, passi_da_tradurre: [...passi].sort((a, b) => a - b) }
}

/** Rilettura: cosa è cambiato DAVVERO tra due versioni (righe, resa, passi). Stesse frasi di applica(). */
export function confronta(prima: any, dopo: any, nomi: Record<string, string>): string[] {
  const out: string[] = [], a = prima || {}, b = dopo || {}
  const nome = (l: any) => nomi[l.ref] || 'riga ' + l.id
  const la = new Map((a.lines || []).map((l: any) => [l.id, l])), lb = new Map((b.lines || []).map((l: any) => [l.id, l]))
  for (const [id, l] of lb as Map<string, any>) {
    const p = la.get(id) as any
    if (!p) out.push(`Nuova riga: ${nome(l)} ${fmt(l.qty, l.unit)}`)
    else if (Number(p.qty) !== Number(l.qty) || (p.unit || '') !== (l.unit || '')) out.push(`${nome(l)}: ${fmt(p.qty, p.unit)} → ${fmt(l.qty, l.unit)}`)
  }
  for (const [id, l] of la as Map<string, any>) if (!lb.has(id)) out.push(`Riga tolta: ${nome(l)}`)   // non deve mai succedere con T.E.C.: se compare è un allarme
  const ya = a.yield || {}, yb = b.yield || {}
  if (Number(ya.g ?? NaN) !== Number(yb.g ?? NaN) && !(ya.g == null && yb.g == null)) out.push(`Resa: ${fmt(ya.g, 'g')} → ${fmt(yb.g, 'g')}`)
  if (Number(ya.portions ?? NaN) !== Number(yb.portions ?? NaN) && !(ya.portions == null && yb.portions == null)) out.push(`Porzioni: ${fmt(ya.portions, '')} → ${fmt(yb.portions, '')}`.replace(/ +$/, '').replace(/  /g, ' '))
  const sa = a.steps || [], sb = b.steps || []
  const testo = (s: any) => s ? E.stepIn(s, s.src || 'it').text : ''
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (i >= sa.length) out.push(`Nuovo passo ${i + 1}: «${String(testo(sb[i])).slice(0, 120)}»`)
    else if (i >= sb.length) out.push(`Passo tolto ${i + 1}`)
    else if (testo(sa[i]) !== testo(sb[i])) out.push(`Passo ${i + 1}: «${String(testo(sa[i])).slice(0, 80)}» → «${String(testo(sb[i])).slice(0, 120)}»`)
  }
  return out
}

/** C-62: per «cambia_quantita» T.E.C. può dare il NOME dell'ingrediente invece del codice della riga, così basta UNA chiamata.
 *  Il nome deve indicare UNA sola riga (uguale, senza maiuscole/accenti/spazi; altrimenti «contiene»). Se ce ne sono di più → errore
 *  «riga_da_scegliere» con i nomi possibili; se nessuna → «riga_non_trovata». Mai indovinare. */
export const normNome = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function risolviNomi(base: any, modifiche: any[], nomi: Record<string, string>): { modifiche: any[]; errori: string[] } {
  const righe = Array.isArray(base?.lines) ? base.lines : [], errori: string[] = []
  const out = (Array.isArray(modifiche) ? modifiche : []).map((m: any, i: number) => {
    if (!m || m.tipo !== 'cambia_quantita' || m.riga || typeof m.nome !== 'string') return m
    const k = normNome(m.nome)
    if (!k) { errori.push(`modifica ${i + 1}: riga_non_trovata (nome vuoto)`); return m }
    let c = righe.filter((l: any) => normNome(nomi[l.ref]) === k)
    if (!c.length) c = righe.filter((l: any) => { const n = normNome(nomi[l.ref]); return n && (n.includes(k) || k.includes(n)) })
    if (c.length === 1) { const { nome: _n, ...resto } = m; return Object.assign(resto, { riga: c[0].id }) }
    errori.push(c.length ? `modifica ${i + 1}: riga_da_scegliere («${m.nome}»: ${c.map((l: any) => `${nomi[l.ref]} ${fmt(l.qty, l.unit)} [${l.id}]`).join(' | ')})`
                         : `modifica ${i + 1}: riga_non_trovata («${m.nome}»)`)
    return m
  })
  return { modifiche: out, errori }
}
