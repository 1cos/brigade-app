// B-86 — BRIGADE SERVICE MONITOR (Max 29/10/2026): op 'sb' = MONITORS + Monitor 3 camerieri.
// Tutta la logica sta nel database (funzioni sb_*, le stesse che usa Brigade): qui solo chi può e da dove.
// Chi può: Chef (app_access chef), le persone in service_board_editors (es. Sous-Chef), T.E.C. (ruolo assistente, voce).
type U = { id: number; name: string; role: string }
export class ServiceError extends Error { constructor(public status: number, public code: string) { super(code) } }

async function canEdit(u: U, svc: any) {
  if (u.role === 'chef' || u.role === 'assistente') return true
  const r = await svc.from('service_board_editors').select('user_id').eq('user_id', u.id).maybeSingle()
  return !!r.data
}
const rpc = async (svc: any, fn: string, args: Record<string, unknown>) => {
  const r = await svc.rpc(fn, args)
  if (r.error) { const m = String(r.error.message || ''); if (/^(bad_|not_|duplicate_|too_many|changed_)/.test(m)) return { ok: false, error: m }; throw r.error }
  return r.data
}

export async function sb(u: U, b: any, svc: any) {
  if (!(await canEdit(u, svc))) throw new ServiceError(403, 'forbidden')
  const a = (b && typeof b.args === 'object' && b.args) || {}
  const who = u.role === 'assistente' ? 'T.E.C.' : u.name, src = u.role === 'assistente' ? 'tec' : 'brigade2'
  switch (b?.sb_op) {
    case 'state': {
      const [s, c] = await Promise.all([rpc(svc, 'sb_state', {}), rpc(svc, 'sb_catalog', {})])
      return { ok: true, state: s, catalog: c }
    }
    case 'save': return rpc(svc, 'sb_save_draft', { p_actor: who, p_source: src, p_draft: a.draft, p_rev: Number(a.rev) })
    case 'publish': return rpc(svc, 'sb_publish', { p_actor: who, p_source: src, p_rev: Number(a.rev) })
    case 'adjust': return rpc(svc, 'sb_adjust', { p_actor: who, p_source: src, p_item: String(a.item || ''), p_delta: Number(a.delta) })
    case '86': return rpc(svc, 'sb_set_86', { p_actor: who, p_source: src, p_item: String(a.item || ''), p_on: a.on !== false })
    case 'display': return rpc(svc, 'sb_set_display', { p_actor: who, p_source: src, p_which: String(a.which || ''), p_on: a.on === true })
    default: throw new ServiceError(400, 'bad_op')
  }
}
