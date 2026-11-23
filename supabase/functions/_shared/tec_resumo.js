// B-91: riassunto breve (conteggi + qualche esempio) di una risposta di Brigade, per T.E.C. a voce. Solo lettura: non inventa niente,
// accorcia soltanto. Mai chiavi che sembrano segreti, prezzi o contatti.
const LAB = ['title', 'name', 'item', 'recipe_name', 'ingredient', 'label', 'message', 'reason', 'text', 'summary', 'vendor', 'what', 'code']
const NO = /token|secret|password|api_?key|email|phone|iban/i
const PREZZO = /price|cost|prezzo|costo/i      // i valori dei prezzi non vanno a voce; le LISTE «prezzi mancanti» sì (sono solo nomi)
const lab = x => { if (x == null) return null; if (typeof x !== 'object') return String(x).slice(0, 80); for (const k of LAB) if (typeof x[k] === 'string' && x[k]) return x[k].slice(0, 80); return null }
export function resumi(x, depth = 0) {
  if (x == null) return null
  if (Array.isArray(x)) return { n: x.length, esempi: x.map(lab).filter(Boolean).slice(0, 5) }
  if (typeof x === 'object') {
    if (depth >= 3) return '[…]'
    const o = {}
    for (const k of Object.keys(x).slice(0, 30)) { if (NO.test(k) || (PREZZO.test(k) && !Array.isArray(x[k]) && typeof x[k] !== 'object')) continue; const v = resumi(x[k], depth + 1); if (v !== null && v !== undefined) o[k] = v }
    return o
  }
  if (typeof x === 'string') return x.slice(0, 80)
  return x
}
