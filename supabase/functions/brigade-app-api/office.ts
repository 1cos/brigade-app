// Decisions, L'Ufficio and invoices (B-25 module 1, Chef Max GO 15/10/2026) — READ ONLY, Chef only.
// Same Brigade data the Shell V020 reads (attention_items, office_items, invoice_warnings, vendor_documents),
// grouped by the ONE engine ../_shared/office_core.js. This module has no write path: selects only.
// Staff get 403 here; the response carries only what the cards show (no raw message dumps, no prices).
import * as O from '../_shared/office_core.js'

type U = { id: number; role: 'chef' | 'staff' }
export class OfficeError extends Error { constructor(public status: number, public code: string) { super(code) } }
const TZ = 'America/Chicago'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const must = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T }

async function chunked(ids: string[], f: (part: string[]) => Promise<any[]>) {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 150) out.push(...await f(ids.slice(i, i + 150)))
  return out
}

export async function office(u: U, svc: any) {
  if (u.role !== 'chef') throw new OfficeError(403, 'forbidden')
  const t = today()
  const [attention, office, warn, docs] = await Promise.all([
    svc.from('attention_items').select('origin,item_id,source,family,attention,reason,decision_key,recipe_id,document_id,created_at').limit(5000).then(must),
    svc.from('office_items').select('id,created_at,from_user,title,summary,body,recipe_id,recipe_name').eq('status', 'open').not('is_demo', 'is', true).order('created_at', { ascending: false }).limit(600).then(must),
    svc.from('invoice_warnings').select('id,document_id,vendor,document_date,document_number,code,message,status,created_at').neq('status', 'resolved').order('document_date', { ascending: false }).limit(5000).then(must),
    svc.from('vendor_documents').select('id,vendor,document_type,document_number,document_date,status').gte('document_date', addDays(t, -30)).order('document_date', { ascending: false }).limit(2000).then(must),
  ]) as any[][]
  // status of each warned document (imported / pending / error / ignored)
  const docIds = [...new Set(warn.map(x => x.document_id).filter(Boolean))] as string[]
  const st: Record<string, string> = {}
  ;(await chunked(docIds, p => svc.from('vendor_documents').select('id,status').in('id', p).then(must))).forEach(d => { st[d.id] = d.status })
  const invwarn = warn.map(x => Object.assign(x, { doc_status: st[x.document_id] || null }))
  // only the recipes the cards name, the ingredient counts of "few ingredients" dishes, the yields of "portions unknown"
  const rids = [...new Set(attention.map(a => a.recipe_id).filter(Boolean))] as string[]
  const titles: Record<string, string> = {}
  ;(await chunked(rids, p => svc.from('recipes').select('id,title').in('id', p).then(must))).forEach(r => { titles[r.id] = r.title })
  const bomIds = [...new Set(attention.filter(a => a.reason === 'bom_maybe_incomplete').map(a => a.recipe_id).filter(Boolean))] as string[]
  const bomN: Record<string, number> = {}
  ;(await chunked(bomIds, p => svc.from('recipe_bom').select('parent_recipe_id').in('parent_recipe_id', p).limit(5000).then(must))).forEach(b => { bomN[b.parent_recipe_id] = (bomN[b.parent_recipe_id] || 0) + 1 })
  const yIds = [...new Set(attention.filter(a => a.reason === 'portions_unknown').map(a => a.recipe_id).filter(Boolean))] as string[]
  const yields: Record<string, any> = {}
  ;(await chunked(yIds, p => svc.from('recipe_yield').select('id,portions,yield_qty,yield_dim').in('id', p).then(must))).forEach(y => { yields[y.id] = y })
  const T = O.triage({ attention, office, invwarn, docs, titles, bomN, yields })
  return { checked_at: new Date().toISOString(), today: t, ...T }
}
