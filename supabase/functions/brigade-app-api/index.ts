// brigade-app-api — the ONLY door of the new Brigade app (reserved: Max + Pablo).
// The app ships no Supabase key. Every call carries the app session token; the server
// resolves identity from app_sessions + app_access and decides what each user may see or write.
// R1: reads are live Brigade data (read-only); writes go ONLY to app_events with mode='test'.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUILD = 'api-r1.0'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PEPPER = Deno.env.get('BRIGADE_RATE_PEPPER') ?? ''
const ORIGINS = ['https://1cos.github.io', 'http://localhost:8791', 'http://127.0.0.1:8791']
const TZ = 'America/Chicago'
const UNITS = ['kg', 'g', 'lb', 'oz', 'L', 'ml', 'qt', 'gal', 'each', 'pz', 'portion', 'pan', '1/2 pan', '1/3 pan', '1/4 pan', '1/6 pan', '1/9 pan', 'deli', 'quart', 'pint', 'bag', 'tray', 'batch']

const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

type User = { id: number; name: string; lang: string | null; station: string | null; role: 'chef' | 'staff'; session_id: string }

class HttpError extends Error { constructor(public status: number, public code: string) { super(code) } }
const deny = (code = 'unauthorized') => new HttpError(401, code)
const bad = (code: string) => new HttpError(400, code)
const forbid = () => new HttpError(403, 'forbidden')

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
}

async function sha256hex(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
// Start of the CDT/CST day in UTC (Chicago is UTC-5 in summer, UTC-6 in winter; 06:00Z covers both safely for "today" filters)
const dayStartUTC = (d: string) => d + 'T05:00:00Z'
const must = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T }

/* ---------- identity ---------- */
async function auth(req: Request): Promise<User> {
  const h = req.headers.get('authorization') || ''
  const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!/^[0-9a-f]{64}$/.test(tok)) throw deny()
  const hash = await sha256hex(tok)
  const now = new Date()
  const s = must(await svc.from('app_sessions').select('id,user_id,expires_at,absolute_expires_at,revoked_at,last_seen_at').eq('token_hash', hash).maybeSingle()) as any
  if (!s || s.revoked_at || new Date(s.expires_at) <= now || new Date(s.absolute_expires_at) <= now) throw deny('session_expired')
  const a = must(await svc.from('app_access').select('app_role').eq('user_id', s.user_id).maybeSingle()) as any
  if (!a) throw deny('not_allowed')
  const u = must(await svc.from('users').select('id,name,lang,default_station,active').eq('id', s.user_id).maybeSingle()) as any
  if (!u || !u.active) throw deny('user_inactive')
  // slide the 30-day window at most once an hour
  if (now.getTime() - new Date(s.last_seen_at).getTime() > 3600_000) {
    const exp = new Date(Math.min(now.getTime() + 30 * 86400_000, new Date(s.absolute_expires_at).getTime()))
    await svc.from('app_sessions').update({ last_seen_at: now.toISOString(), expires_at: exp.toISOString() }).eq('id', s.id)
  }
  return { id: u.id, name: u.name, lang: u.lang, station: u.default_station, role: a.app_role, session_id: s.id }
}

async function login(req: Request, body: any) {
  const pin = body?.pin
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) { await new Promise(r => setTimeout(r, 100)); return { ok: false } }
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'no-ip'
  const day = new Date().toISOString().slice(0, 10)
  const netKey = (await sha256hex(`${PEPPER}::net:${ip}:${day}`)).slice(0, 48)
  const inst = typeof body?.install_id === 'string' && body.install_id.length >= 8 && body.install_id.length <= 128 ? (await sha256hex(`${PEPPER}::install:${body.install_id}:${day}`)).slice(0, 48) : null
  // same attempt limiter as Brigade's login
  const rate = await svc.rpc('brigade_check_and_record_attempt', { p_net_key: netKey, p_install_key: inst, p_success: false })
  if (!rate.error && (rate.data as any)?.cooldown === true) return { ok: false, error: 'cooldown' }
  const r = await svc.rpc('app_login', { p_pin: pin, p_user_agent: req.headers.get('user-agent') })
  if (r.error || !(r.data as any)?.ok) return { ok: false }
  EdgeRuntime.waitUntil(svc.rpc('brigade_check_and_record_attempt', { p_net_key: netKey, p_install_key: inst, p_success: true }).then(() => {}, () => {}))
  return { ok: true, token: (r.data as any).token, user: (r.data as any).user }
}

/* ---------- reads ---------- */
async function latestPlan() {
  const t = today()
  const rows = must(await svc.from('prep_suggestions_daily').select('suggestion_date').gte('suggestion_date', addDays(t, -7)).lte('suggestion_date', t).limit(5000)) as any[]
  const n: Record<string, number> = {}
  rows.forEach(r => { n[r.suggestion_date] = (n[r.suggestion_date] || 0) + 1 })
  const date = Object.keys(n).filter(d => n[d] >= 50).sort().pop() || null
  if (!date) return { date: null, rows: [] as any[] }
  const list = must(await svc.from('prep_suggestions_daily').select('prep_task_id,status,planned_output,output_unit,current_stock,stock_unit,reason').eq('suggestion_date', date).limit(2000)) as any[]
  return { date, rows: list }
}

const reasonEN = (s: string) => { const p = String(s || '').split('|'); if (/^(red|yellow|green|orange|grey|gray|blue)$/.test(p[0])) p.shift(); return (p.length >= 3 ? p[1] : p[0] || '').trim() }

async function shift(u: User) {
  const t = today(), since = dayStartUTC(t)
  const [plan, prep, evToday, msgs, people] = await Promise.all([
    latestPlan(),
    svc.from('prep_tasks').select('id,name,category,unit,container,recipe_id,current_stock,done,in_progress,note').not('archived', 'is', true).limit(2000).then(must) as Promise<any[]>,
    svc.from('app_events').select('id,created_at,user_id,kind,prep_task_id,qty,unit,text,ref_id').gte('created_at', since).in('kind', ['prep_start', 'prep_done', 'count']).order('created_at').then(must) as Promise<any[]>,
    svc.from('app_events').select('id,created_at,user_id,text,to_user_id').eq('kind', 'chef_message').gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(50).then(must) as Promise<any[]>,
    svc.from('app_access').select('user_id,app_role').then(must) as Promise<any[]>,
  ])
  const names = await peopleNames(people.map(p => p.user_id))
  const byPrep: Record<number, any> = {}; prep.forEach(p => { byPrep[p.id] = p })
  const mine = (p: any) => u.role === 'chef' || p.category === u.station
  const status = (id: number) => {
    const ev = evToday.filter(e => e.prep_task_id === id)
    const done = ev.filter(e => e.kind === 'prep_done').pop()
    const start = ev.filter(e => e.kind === 'prep_start').pop()
    const count = ev.filter(e => e.kind === 'count').pop()
    return {
      started: start && (!done || start.created_at > done.created_at) ? { at: start.created_at, by: names[start.user_id] || '' } : null,
      done: done ? { at: done.created_at, by: names[done.user_id] || '', qty: done.qty, unit: done.unit } : null,
      count: count ? { at: count.created_at, by: names[count.user_id] || '', qty: count.qty, unit: count.unit } : null,
    }
  }
  const items = plan.rows.filter(r => byPrep[r.prep_task_id] && mine(byPrep[r.prep_task_id]) && ['do_first', 'prep_today', 'count_first'].includes(r.status))
    .map(r => { const p = byPrep[r.prep_task_id]; return { id: p.id, name: p.name, station: p.category, unit: p.unit, container: p.container, recipe_id: p.recipe_id, stock: p.current_stock, plan: r.status, qty: r.planned_output, qty_unit: r.output_unit || p.unit, reason: reasonEN(r.reason), app: status(p.id) } })
  const rank: Record<string, number> = { do_first: 0, prep_today: 1, count_first: 2 }
  items.sort((a, b) => rank[a.plan] - rank[b.plan] || a.name.localeCompare(b.name))
  const reads = new Set((must(await svc.from('app_events').select('ref_id').eq('kind', 'message_read').eq('user_id', u.id).limit(500)) as any[]).map(x => x.ref_id))
  const messages = msgs.filter(m => u.role === 'chef' || m.to_user_id == null || m.to_user_id === u.id)
    .map(m => ({ id: m.id, at: m.created_at, from: names[m.user_id] || 'Chef', to: m.to_user_id == null ? 'all' : (names[m.to_user_id] || ''), text: m.text, read: reads.has(m.id) || m.user_id === u.id }))
  const out: any = { build: BUILD, today: t, plan_date: plan.date, user: pub(u), items, messages,
    done_today: evToday.filter(e => e.kind === 'prep_done' && (u.role === 'chef' || e.user_id === u.id)).map(e => ({ at: e.created_at, by: names[e.user_id] || '', name: byPrep[e.prep_task_id]?.name || 'Prep', qty: e.qty, unit: e.unit })) }
  if (u.role === 'chef') {
    out.people = people.filter(p => p.user_id !== u.id).map(p => ({ id: p.user_id, name: names[p.user_id] || '' }))
    const rep = must(await svc.from('app_events').select('id,created_at,user_id,text,prep_task_id').eq('kind', 'report').order('created_at', { ascending: false }).limit(30)) as any[]
    const rread = new Set((must(await svc.from('app_events').select('ref_id').eq('kind', 'report_read').limit(500)) as any[]).map(x => x.ref_id))
    out.reports = rep.map(r => ({ id: r.id, at: r.created_at, from: names[r.user_id] || '', text: r.text, prep: byPrep[r.prep_task_id]?.name || null, read: rread.has(r.id) }))
  } else {
    const rep = must(await svc.from('app_events').select('id,created_at,text').eq('kind', 'report').eq('user_id', u.id).order('created_at', { ascending: false }).limit(10)) as any[]
    out.my_reports = rep.map(r => ({ id: r.id, at: r.created_at, text: r.text }))
  }
  return out
}

async function peopleNames(ids: number[]) {
  const rows = ids.length ? must(await svc.from('users').select('id,name').in('id', ids)) as any[] : []
  const m: Record<number, string> = {}; rows.forEach(r => { m[r.id] = r.name }); return m
}
const pub = (u: User) => ({ id: u.id, name: u.name, lang: u.lang, station: u.station, role: u.role })

async function recipes() {
  return must(await svc.from('recipes').select('id,title,category').order('title').limit(3000))
}

async function recipe(u: User, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw bad('bad_id')
  const cols = 'id,title,category,yield_text,prep_time_minutes,ingredients,procedure,procedure_en,equipment,shelf_life_days' + (u.role === 'chef' ? ',selling_price,food_cost_pct' : '')
  const [r, steps, bom, y, preps] = await Promise.all([
    svc.from('recipes').select(cols).eq('id', id).maybeSingle().then(must),
    svc.from('recipe_steps').select('step_number,title,instruction_en,timer_seconds').eq('recipe_id', id).order('step_number').then(must),
    svc.from('recipe_bom').select('component_type,item_id,sub_recipe_id,quantity,unit,notes,sort_order').eq('parent_recipe_id', id).order('sort_order').then(must),
    svc.from('recipe_yield').select('portions,yield_qty,yield_dim,has_yield').eq('id', id).maybeSingle().then(must),
    svc.from('prep_tasks').select('id,name,unit').eq('recipe_id', id).not('archived', 'is', true).then(must),
  ]) as any[]
  if (!r) throw new HttpError(404, 'not_found')
  const ingIds = [...new Set(bom.filter((b: any) => b.item_id).map((b: any) => b.item_id))]
  const subIds = [...new Set(bom.filter((b: any) => b.sub_recipe_id).map((b: any) => b.sub_recipe_id))]
  const [ings, subs] = await Promise.all([
    ingIds.length ? svc.from('ingredients').select('id,name').in('id', ingIds).then(must) : [],
    subIds.length ? svc.from('recipes').select('id,title').in('id', subIds).then(must) : [],
  ]) as any[]
  const iN: any = {}; ings.forEach((i: any) => { iN[i.id] = i.name })
  const sN: any = {}; subs.forEach((s: any) => { sN[s.id] = s.title })
  const components = bom.map((b: any) => b.sub_recipe_id
    ? { name: sN[b.sub_recipe_id] || 'Sub-recipe', qty: b.quantity, unit: b.unit, note: b.notes, recipe_id: b.sub_recipe_id }
    : { name: iN[b.item_id] || 'Ingredient', qty: b.quantity, unit: b.unit, note: b.notes })
  return { recipe: r, steps, components, yield: y, preps }
}

async function prepDetail(u: User, id: number) {
  const p = must(await svc.from('prep_tasks').select('id,name,category,unit,container,recipe_id,current_stock,note').eq('id', id).not('archived', 'is', true).maybeSingle()) as any
  if (!p) throw new HttpError(404, 'not_found')
  const plan = await latestPlan()
  const r = plan.rows.find(x => x.prep_task_id === id)
  const ev = must(await svc.from('app_events').select('created_at,user_id,kind,qty,unit').eq('prep_task_id', id).in('kind', ['prep_start', 'prep_done', 'count']).gte('created_at', new Date(Date.now() - 2 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(20)) as any[]
  const names = await peopleNames([...new Set(ev.map(e => e.user_id))])
  const rec = p.recipe_id ? must(await svc.from('recipes').select('id,title').eq('id', p.recipe_id).maybeSingle()) as any : null
  const y = p.recipe_id ? must(await svc.from('recipe_yield').select('yield_qty,yield_dim,portions').eq('id', p.recipe_id).maybeSingle()) as any : null
  return { prep: p, plan_date: plan.date, plan: r ? { status: r.status, qty: r.planned_output, unit: r.output_unit || p.unit, reason: reasonEN(r.reason) } : null, recipe: rec, yield: y, history: ev.map(e => ({ at: e.created_at, by: names[e.user_id] || '', kind: e.kind, qty: e.qty, unit: e.unit })), units: UNITS }
}

async function planner(u: User) {
  const sn = must(await svc.from('users').select('schedule_name').eq('id', u.id).maybeSingle()) as any
  const t = today()
  const rows = sn?.schedule_name ? must(await svc.from('shifts_schedule').select('date,role_name,start_label,end_label,department_name,is_closing').eq('employee_name', sn.schedule_name).gte('date', t).lte('date', addDays(t, 13)).order('date')) as any[] : []
  return { shifts: rows }
}

async function catering(u: User) {
  const t = today()
  const ev = must(await svc.from('events').select('id,name,event_date,event_time,guest_count,status,event_recipes').gte('event_date', t).lte('event_date', addDays(t, 14)).order('event_date')) as any[]
  const ids = [...new Set(ev.flatMap(e => (Array.isArray(e.event_recipes) ? e.event_recipes : []).map((r: any) => r.recipe_id).filter(Boolean)))]
  const recs = ids.length ? must(await svc.from('recipes').select('id,title,category').in('id', ids)) as any[] : []
  const rN: any = {}; recs.forEach(r => { rN[r.id] = r })
  // only what to cook: name, date, guests, dishes — no client contacts, no prices
  return { events: ev.map(e => ({ id: e.id, name: e.name, date: e.event_date, time: e.event_time, guests: e.guest_count, status: e.status,
    dishes: (Array.isArray(e.event_recipes) ? e.event_recipes : []).map((r: any) => ({ recipe_id: r.recipe_id || null, name: (rN[r.recipe_id] || {}).title || r.name || r.title || 'Dish', qty: r.quantity ?? r.qty ?? null })) })) }
}

/* ---------- writes (R1: app_events, mode=test) ---------- */
async function act(u: User, b: any) {
  const kind = b?.kind
  const key = typeof b?.client_key === 'string' && /^[0-9a-f-]{36}$/.test(b.client_key) ? b.client_key : null
  const row: any = { user_id: u.id, kind, mode: 'test', client_key: key }
  const qty = (min: number) => { const q = Number(b?.qty); if (!isFinite(q) || q < min || q > 100000) throw bad('bad_qty'); return Math.round(q * 1000) / 1000 }
  const unit = (allowed: string[]) => { const x = String(b?.unit || ''); if (!allowed.includes(x)) throw bad('bad_unit'); return x }
  const prepId = async () => { const id = Number(b?.prep_task_id); if (!Number.isInteger(id)) throw bad('bad_prep'); const p = must(await svc.from('prep_tasks').select('id,unit,category').eq('id', id).maybeSingle()) as any; if (!p) throw bad('bad_prep'); return p }
  if (kind === 'prep_start') { row.prep_task_id = (await prepId()).id }
  else if (kind === 'prep_done' || kind === 'count') {
    const p = await prepId(); row.prep_task_id = p.id
    row.qty = qty(kind === 'count' ? 0 : 0.001)        // count can be 0 (nothing left); production must be > 0
    row.unit = unit([...UNITS, p.unit].filter(Boolean))
  } else if (kind === 'report') {
    const t = String(b?.text || '').trim(); if (t.length < 2 || t.length > 1000) throw bad('bad_text')
    row.text = t
    if (b?.prep_task_id != null) row.prep_task_id = (await prepId()).id
  } else if (kind === 'chef_message') {
    if (u.role !== 'chef') throw forbid()
    const t = String(b?.text || '').trim(); if (t.length < 1 || t.length > 1000) throw bad('bad_text')
    row.text = t
    if (b?.to_user_id != null) {
      const to = Number(b.to_user_id)
      const ok = must(await svc.from('app_access').select('user_id').eq('user_id', to).maybeSingle())
      if (!ok) throw bad('bad_recipient')
      row.to_user_id = to
    }
  } else if (kind === 'message_read' || kind === 'report_read') {
    if (kind === 'report_read' && u.role !== 'chef') throw forbid()
    if (!/^[0-9a-f-]{36}$/.test(String(b?.ref_id || ''))) throw bad('bad_ref')
    row.ref_id = b.ref_id
  } else throw bad('bad_kind')
  const r = await svc.from('app_events').insert(row).select('id,created_at').single()
  if (r.error) {
    if ((r.error as any).code === '23505' && key) { const x = must(await svc.from('app_events').select('id,created_at').eq('client_key', key).single()); return { ok: true, event: x, repeated: true } }
    throw r.error
  }
  return { ok: true, event: r.data, mode: 'test' }
}

/* ---------- router ---------- */
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? ''
  const H = cors(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers: H })
  try {
    let body: any = {}
    try { body = await req.json() } catch { throw bad('bad_json') }
    const op = body?.op
    if (op === 'ping') return new Response(JSON.stringify({ ok: true, build: BUILD }), { headers: H })
    if (op === 'login') return new Response(JSON.stringify(await login(req, body)), { headers: H })
    const u = await auth(req)
    let out: unknown
    switch (op) {
      case 'me': out = { ok: true, user: pub(u), build: BUILD }; break
      case 'logout': await svc.from('app_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', u.session_id); out = { ok: true }; break
      case 'shift': out = await shift(u); break
      case 'recipes': out = { recipes: await recipes() }; break
      case 'recipe': out = await recipe(u, String(body.id || '')); break
      case 'prep': out = await prepDetail(u, Number(body.id)); break
      case 'planner': out = await planner(u); break
      case 'catering': out = await catering(u); break
      case 'act': out = await act(u, body); break
      default: throw bad('bad_op')
    }
    return new Response(JSON.stringify(out), { headers: H })
  } catch (e) {
    if (e instanceof HttpError) return new Response(JSON.stringify({ ok: false, error: e.code }), { status: e.status, headers: H })
    console.error('[app-api]', (e as Error)?.message || e)
    return new Response(JSON.stringify({ ok: false, error: 'server_error' }), { status: 500, headers: H })
  }
})
