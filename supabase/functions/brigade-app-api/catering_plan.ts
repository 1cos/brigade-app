// CATERING B-25 passo 1 (Max 22/11/2026): eventi anche PASSATI + Production / Shopping / Cost evento, SOLA LETTURA, SOLO Chef.
// Nessun motore nuovo: usa le funzioni che Brigade ha già nel database (catering_event_plan = piano + spesa + costo FC05,
// STABLE cioè non scrive) e i collegamenti piatto → ricetta già salvati (catering_dish_links). Nessuna scrittura, nessun prezzo allo staff.
type U = { id: number; name: string; role: string }
export class PlanError extends Error { constructor(public status: number, public code: string) { super(code) } }
const must = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T }
const chef = (u: U) => { if (u.role !== 'chef') throw new PlanError(403, 'forbidden') }
const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const norm = (s: unknown) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Eventi: ultimi 60 giorni e prossimi 30, più TUTTI quelli che hanno collegamenti salvati (Mason resta visibile). */
async function list(svc: any) {
  const t = day(new Date())
  const linked = must(await svc.from('catering_dish_links').select('event_id')) as any[]
  const counts: Record<string, number> = {}; linked.forEach(l => { counts[l.event_id] = (counts[l.event_id] || 0) + 1 })
  const cols = 'id,name,event_date,event_time,guest_count,status,tripleseat_id'
  const a = must(await svc.from('events').select(cols).gte('event_date', addDays(t, -60)).lte('event_date', addDays(t, 30)).order('event_date', { ascending: false }).limit(400)) as any[]
  const have = new Set(a.map(e => e.id)); const extra = Object.keys(counts).filter(id => !have.has(id))
  const b = extra.length ? must(await svc.from('events').select(cols).in('id', extra)) as any[] : []
  const ev = [...a, ...b].sort((x, y) => String(y.event_date).localeCompare(String(x.event_date)))
  return { ok: true, today: t, events: ev.map(e => ({ id: e.id, name: e.name, date: e.event_date, time: e.event_time, guests: e.guest_count, status: e.status, links: counts[e.id] || 0, past: String(e.event_date) < t })) }
}

async function plan(id: string, svc: any) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PlanError(400, 'bad_id')
  const e = must(await svc.from('events').select('id,name,event_date,event_time,guest_count,status,tripleseat_id').eq('id', id).maybeSingle()) as any
  if (!e) throw new PlanError(404, 'not_found')
  const r = await svc.rpc('catering_event_plan', { p_event_id: id })
  if (r.error) throw new Error('catering_event_plan: ' + r.error.message)
  const p = r.data || {}
  // righe di cucina del menu Tripleseat (ultima versione per documento) che NON hanno un collegamento: così si vede cosa manca
  let missing: string[] = []; let menuLines = 0
  if (e.tripleseat_id) {
    const vers = must(await svc.from('event_document_versions').select('ts_document_id,version_no,lines').eq('ts_event_id', Number(e.tripleseat_id)).eq('is_test', false).order('version_no', { ascending: false })) as any[]
    const seen = new Set<unknown>(); const lines: string[] = []
    for (const v of vers) { if (seen.has(v.ts_document_id)) continue; seen.add(v.ts_document_id)
      for (const l of (Array.isArray(v.lines) ? v.lines : [])) if (l.kitchen !== false && l.name && !/bever|drink|bar\b/i.test(String(l.section || ''))) lines.push(String(l.name)) }
    menuLines = lines.length
    const linkedNames = new Set((p.components || []).map((c: any) => norm(c.original_text)))
    missing = [...new Set(lines)].filter(n => !linkedNames.has(norm(n))).slice(0, 80)
  }
  return { ok: true, event: { id: e.id, name: e.name, date: e.event_date, time: e.event_time, guests: e.guest_count, status: e.status },
    components: p.components || [], shopping: p.shopping || { known: [], unknown: [], no_batches: [] }, cost: p.cost || null, cost_stale: p.cost_stale === true, cost_not_in_sheet: p.cost_not_in_sheet || [], not_costed: p.not_costed || [],
    menu_lines: menuLines, menu_not_linked: missing }
}

export async function cateringPlan(u: U, b: any, svc: any) {
  chef(u)
  if (b?.id) return await plan(String(b.id), svc)
  return await list(svc)
}
