// PLANNER 14 giorni (B-25, Max GO 22/11/2026) — funzione PURA: dai dati di turni_giorni + turni_oggi costruisce i giorni da mostrare.
// Regole di Max: lo Chef vede tutti i turni, lo staff SOLO i propri; un giorno senza turni pubblicati NON è «libero»: oltre l'ultimo giorno
// pubblicato (o con sole bozze) è «non ancora pubblicato»; prima dell'ultimo giorno pubblicato senza turni è «nessun turno».
export const norm = (x: unknown) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim()
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// deno-lint-ignore no-explicit-any
export function buildDays(t: string, gi: any[], rows: any[], me: string, isChef: boolean) {
  const visible = rows.filter(r => isChef || (me && norm(r.nome) === me))
  const horizon = [...gi.filter(g => g.pubblicati > 0).map(g => g.giorno), ...rows.map(r => r.giorno)].sort().pop() || null
  const days = []
  for (let i = 0; i < 14; i++) {
    const d = addDays(t, i), g = gi.find(x => x.giorno === d)
    const published = g ? g.pubblicati > 0 : rows.some(r => r.giorno === d)
    const state = published ? 'pubblicato' : (g && g.bozze > 0) || !horizon || d > horizon ? 'non_ancora_pubblicato' : 'nessun_turno'
    days.push({ date: d, state, shifts: visible.filter(r => r.giorno === d).map(r => ({ name: isChef ? (r.nome || null) : null, role: r.ruolo || '', start: r.inizio, end: r.fine, open: r.stato === 'aperto', changed: r.stato === 'modificato' })) })
  }
  return days
}
