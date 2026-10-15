// Decisions, L'Ufficio and invoices (B-25 module 1) — ONE engine, ported from Shell V020 (app.js triage + invoices,
// commit 23f5616). Pure functions: the server runs them on live Brigade data; the tests run them on read-only dumps.
// WHAT NEEDS CHEF comes from ONE place: Brigade's view attention_items (action_now · needs_chef · backlog · info ·
// data_quality_unknown). This file only groups and describes. Texts are KEYS + params: the app writes them in en/it/es.
// Data strings (vendor item names, team messages, recipe titles) are passed through as they are, never translated.

const TZ = 'America/Chicago'
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null }
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const byId = (list, key = 'id') => { const m = {}; (list || []).forEach(x => { m[x[key]] = x }); return m }
const groupBy = (list, f) => { const m = {}; (list || []).forEach(x => { const k = f(x); (m[k] = m[k] || []).push(x) }); return m }
const dCDT = iso => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso)) : ''
export const dayOf = d => !d ? '' : String(d).length === 10 ? d : dCDT(d)
const ageDays = (iso, now) => (now - new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso).getTime()) / 864e5
export const vendorShort = v => /hardie/i.test(v || '') ? "Hardie's" : /walmart/i.test(v || '') ? 'Walmart' : /^bek$|ben e/i.test(v || '') ? 'BEK' : (v || '')
const nice = t => { t = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t }
const soldN = o => { const m = String(o.summary || o.body || '').match(/sold (\d+) times in the last 30 days/i); return m ? +m[1] : null }
const isAction = a => a.attention === 'action_now' || a.attention === 'needs_chef'

// text helpers: {k, p} = a key with params; {raw} = data shown as it is
const K = (k, p) => ({ k, p: p || {} })
const RAW = s => ({ raw: String(s == null ? '' : s) })

// reasons that have their own label / explanation (V020 REASON_LABEL / REASON_WHY)
export const REASON_LABELS = ['snoozed', 'acted_on', 'recipe_gone', 'recipe_archived', 'ai_copy', 'praise', 'old_note', 'yield_resolved', 'bom_now_present',
  'portion_optional', 'pos_link_unknown', 'stock_untrusted', 'deferred_by_chef', 'excluded', 'imported_with_notes', 'legacy_record', 'return_pickup_slip',
  'walmart_waiting_revision', 'other']
export const REASON_WHYS = ['yield_resolved', 'bom_now_present', 'portion_optional', 'pos_link_unknown', 'stock_untrusted', 'return_pickup_slip', 'walmart_waiting_revision', 'legacy_record']
const labelKey = r => 'of_rl_' + (REASON_LABELS.includes(r) ? (r === 'old_note' ? 'praise' : r) : 'other')
const whyKey = r => REASON_WHYS.includes(r) ? 'of_rw_' + r : null

/* "Hardie's #07137898": how an invoice is named everywhere */
function invoiceLabels(invwarn) {
  const m = {}
  ;(invwarn || []).forEach(x => { if (x.document_id && !m[x.document_id]) m[x.document_id] = `${vendorShort(x.vendor) || 'Invoice'}${x.document_number ? ' #' + x.document_number : ''}` })
  return m
}

/* one card per invoice with open warnings: unreadable, or what was shorted / substituted / added */
export function invoiceCards(invwarn, now = Date.now()) {
  const byDoc = groupBy(invwarn || [], x => x.document_id || x.id), cards = [], excluded = []
  Object.values(byDoc).forEach(list => {
    const f = list[0], when = f.document_date, vendor = vendorShort(f.vendor), docId = f.document_id
    const label = `${vendor || 'Invoice'}${f.document_number ? ' #' + f.document_number : ''}`
    if (list.some(x => x.code === 'BUYER-BAR-001')) { excluded.push(f); return }
    const broken = list.find(x => /PARSE_ERROR|UNKNOWN_DOC_TYPE/.test(x.code || ''))
    if (broken) {
      cards.push({ docId, sev: 'red', area: 'invoice', today: ageDays(when || f.created_at, now) <= 14, date: when || f.created_at, now: RAW(label),
        title: K('of_inv_unreadable', { v: RAW(vendor || 'Invoice') }),
        why: K(broken.code === 'PARSE_ERROR' ? 'of_why_no_lines' : 'of_why_unknown_doc'), missing: K('of_miss_readable'), cta: 'invoices' })
      return
    }
    const items = {}
    list.forEach(x => { const m = String(x.message || '').match(/ordered ([\d.]+), (?:shipped|received) ([\d.]+) of (.+)$/i); if (m) items[m[3].trim()] = { item: m[3].trim(), ord: +m[1], got: +m[2] } })
    const all = Object.values(items), short = all.filter(i => i.got < i.ord), extra = all.filter(i => i.ord === 0 && i.got > 0), used = new Set(), lines = []
    short.forEach(sh => {
      const tok = sh.item.split(/[^A-Z]+/i).filter(t => t.length > 2 && !/fresh|assorted|sliced|raw|organic|the/i.test(t))
      let e = extra.find(x => !used.has(x) && tok.some(t => x.item.toUpperCase().includes(t.toUpperCase())))
      if (!e && short.length === 1 && extra.length === 1) e = extra[0]
      if (e) { used.add(e); lines.push(sh.got ? { t: 'sub', a: nice(sh.item), b: nice(e.item), got: sh.got, ord: sh.ord, n: e.got } : { t: 'sub_only', a: nice(sh.item), b: nice(e.item), n: e.got }) }
      else lines.push(sh.got ? { t: 'short', a: nice(sh.item), got: sh.got, ord: sh.ord } : { t: 'none', a: nice(sh.item), ord: sh.ord })
    })
    /* one short item and one unexpected item left on the same invoice: that is a substitution too */
    const lastS = lines.filter(l => l.t === 'short' || l.t === 'none'), lastE = extra.filter(x => !used.has(x))
    if (lastS.length === 1 && lastE.length === 1) { const k = lines.indexOf(lastS[0]); lines[k] = { t: 'sub_only', a: lastS[0].a, b: nice(lastE[0].item), n: lastE[0].got }; used.add(lastE[0]) }
    extra.filter(x => !used.has(x)).forEach(x => lines.push({ t: 'extra', a: nice(x.item), n: x.got }))
    if (!lines.length) return
    const subs = lines.filter(l => l.t === 'sub' || l.t === 'sub_only').length
    cards.push({ docId, sev: 'amber', area: 'invoice', today: false, date: when, now: RAW(label), lines,
      title: subs === lines.length ? K('of_inv_subs', { v: RAW(vendor), n: subs }) : subs ? K('of_inv_subs_short', { v: RAW(vendor), s: subs, n: lines.length - subs }) : K('of_inv_short', { v: RAW(vendor), n: lines.length }),
      why: K(f.doc_status === 'pending' ? 'of_why_pending' : 'of_why_imported'), cta: 'review' })
  })
  if (excluded.length) cards.push({ sev: 'neutral', area: 'invoice', date: excluded[0].document_date, title: K('of_excluded', { n: excluded.length }), why: K('of_excluded_why') })
  return cards.sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date)))
}

/* data = { attention, office, invwarn (with doc_status), docs, titles {id:title}, bomN {id:n}, yields {id:{portions,yield_qty,yield_dim}} } */
export function triage(data, now = Date.now()) {
  const titles = data.titles || {}, off = byId(data.office || []), bomN = data.bomN || {}, yields = data.yields || {}
  const out = [], stale = [], history = [], completeness = []
  const att = data.attention || [], cards = invoiceCards(data.invwarn, now), inv = byId(cards, 'docId'), labels = invoiceLabels(data.invwarn)
  const rname = id => titles[id] != null ? RAW(titles[id]) : K('of_recipe')
  const msg = x => String(x.body || x.summary || x.title || '').trim()
  const sold = o => soldN(o)

  /* decisions: one card per decision_key */
  Object.entries(groupBy(att.filter(isAction), a => a.decision_key || a.item_id)).forEach(([key, rows]) => {
    const a = rows[0], o = off[a.item_id] || {}, today = a.attention === 'action_now', base = { key, today, date: a.created_at, cls: a.attention, reason: a.reason }
    switch (a.reason) {
      case 'no_yield': return out.push({ ...base, sev: 'red', area: 'recipe', rid: a.recipe_id, title: K('of_no_yield', { r: rname(a.recipe_id) }),
        why: K('of_why_no_yield', { sold: sold(o) }), missing: K('of_miss_yield'), cta: 'recipe' })
      case 'no_ingredients': return out.push({ ...base, sev: 'red', area: 'recipe', rid: a.recipe_id, title: K('of_no_ingr', { r: rname(a.recipe_id) }),
        why: K('of_why_no_ingr', { sold: sold(o) }), missing: K('of_miss_ingr'), cta: 'recipe' })
      case 'portions_unknown': { const cy = yields[a.recipe_id] || {}
        return out.push({ ...base, sev: 'amber', area: 'recipe', rid: a.recipe_id, title: K('of_portions', { r: rname(a.recipe_id) }),
          now: K('of_yield_now', { portions: num(cy.portions) > 0 ? Math.round(num(cy.portions) * 100) / 100 : null, qty: num(cy.yield_qty) > 0 ? num(cy.yield_qty) / 1000 : null, dim: cy.yield_dim === 'volume' ? 'L' : 'kg' }),
          why: K('of_why_portions', { sold: sold(o) }), missing: K('of_miss_portions'), cta: 'recipe' }) }
      case 'bom_maybe_incomplete': { const ids = [...new Set(rows.map(x => x.recipe_id))].filter(Boolean)
        return out.push({ ...base, sev: 'amber', area: 'recipe', title: K('of_bom_few', { n: ids.length }), why: K('of_why_bom_few'), missing: K('of_miss_bom_few'),
          recipes: ids.map(id => ({ id, name: rname(id), n: bomN[id] || 0 })) }) }
      case 'recipe_proposal': return out.push({ ...base, sev: 'amber', area: 'team', rid: a.recipe_id || null, title: K('of_proposal', { r: o.recipe_name ? RAW(nice(o.recipe_name)) : rname(a.recipe_id) }),
        why: RAW(msg(o)), missing: K('of_miss_proposal'), cta: 'office' })
      case 'old_team_message': { const items = rows.map(x => off[x.item_id]).filter(Boolean).sort((x, y) => x.created_at < y.created_at ? -1 : 1)
        return out.push({ ...base, date: '', sev: 'amber', area: 'team', title: K('of_old_msgs', { n: rows.length }),
          now: items.length ? K('of_range', { a: dayOf(items[0].created_at), b: dayOf(items[items.length - 1].created_at) }) : null,
          why: K('of_why_old_msgs'), lines: items.map(x => ({ t: 'msg', from: x.from_user || null, text: cut(msg(x), 90) })), missing: K('of_miss_review'), cta: 'office' }) }
      case 'team_message': { const prod = /\b(i made|i did|made|ho fatto)\b[^.]*\d/i.test(msg(o))
        return out.push({ ...base, sev: 'amber', area: 'team', title: prod ? K('of_reported_prod', { who: o.from_user ? RAW(o.from_user) : K('of_team') }) : K('of_team_says', { who: o.from_user ? RAW(o.from_user) : K('of_team'), text: RAW(cut(msg(o), 70)) }),
          why: RAW(msg(o)), missing: K(prod ? 'of_miss_prod' : 'of_miss_answer'), cta: prod ? 'brigade' : 'office' }) }
      case 'invoice_stuck_in_review': case 'revision_after_import': case 'unreadable_invoice': case 'walmart_revision_missing': {
        const c = inv[a.document_id] || {}, label = labels[a.document_id] ? RAW(labels[a.document_id]) : K('of_invoice')
        return out.push({ ...base, sev: a.reason === 'invoice_stuck_in_review' || a.reason === 'revision_after_import' ? 'amber' : 'red', area: 'invoice', docId: a.document_id,
          title: K('of_t_' + a.reason, { l: label }), why: K('of_w_' + a.reason), lines: c.lines, missing: K('of_m_' + a.reason), cta: 'invoices' }) }
      default: return out.push({ ...base, sev: 'amber', area: 'other', title: RAW(cut(o.title || a.family, 80)), why: K('of_why_unknown'), missing: K('of_miss_look'), cta: 'office' })
    }
  })

  /* backlog: recipe completeness lives in Recipes (module 2); invoices in review live in Invoices */
  att.filter(a => a.attention === 'backlog' && a.origin === 'office').forEach(a => completeness.push({ kind: a.reason === 'recipe_completeness' ? (a.family === 'missing_photo' ? 'photo' : 'procedure') : 'portions', rid: a.recipe_id }))

  /* info and data quality unknown: history, grouped by reason */
  att.filter(a => a.attention === 'info' || a.attention === 'data_quality_unknown').forEach(a => {
    const o = off[a.item_id] || {}
    const title = a.origin === 'invoice' ? (labels[a.document_id] ? RAW(labels[a.document_id]) : K('of_invoice')) : a.recipe_id ? rname(a.recipe_id) : RAW(cut(String(o.body || o.summary || o.title || ''), 100))
    const w = whyKey(a.reason)
    const row = { sev: a.attention === 'info' ? 'neutral' : 'amber', group: labelKey(a.reason), date: a.created_at, title, why: w ? K(w) : o.from_user ? RAW(o.from_user) : null, rid: a.recipe_id || null, area: a.origin === 'invoice' ? 'invoice' : 'office' }
    ;(a.reason === 'yield_resolved' || a.reason === 'bom_now_present' ? stale : history).push(row)
  })

  const rank = { action_now: 0, needs_chef: 1 }, srank = { red: 0, amber: 1 }
  out.sort((a, b) => rank[a.cls] - rank[b.cls] || srank[a.sev] - srank[b.sev] || dayOf(b.date).localeCompare(dayOf(a.date)))
  return { decisions: out, stale, history, completeness, invoices: invoiceScreen(data, out, cards, labels) }
}

/* Invoices screen: where each invoice goes is decided by attention_items; the cards only describe it */
function invoiceScreen(data, decisions, cardList, labels) {
  const cards = byId(cardList, 'docId'), att = (data.attention || []).filter(a => a.origin === 'invoice')
  const decByDoc = byId(decisions.filter(x => x.area === 'invoice'), 'docId')
  const card = a => {
    const c = cards[a.document_id] || {}, info = a.attention === 'info' || a.attention === 'data_quality_unknown'
    const label = labels[a.document_id] ? RAW(labels[a.document_id]) : c.now || K('of_invoice')
    const own = info && (whyKey(a.reason) || !c.title)   // no card of its own, or a reason that explains it better
    return { ...c, docId: a.document_id, date: c.date, sev: isAction(a) ? (a.attention === 'action_now' ? 'red' : 'amber') : info ? 'neutral' : 'amber',
      now: own ? null : label, title: own ? K('of_inv_reason', { l: label, r: K(labelKey(a.reason)) }) : (c.title || label),
      why: own ? (whyKey(a.reason) ? K(whyKey(a.reason)) : null) : c.why }
  }
  const needs = att.filter(isAction), queue = att.filter(a => a.attention === 'backlog')
  const excluded = att.filter(a => a.reason === 'excluded'), info = att.filter(a => !isAction(a) && a.attention !== 'backlog' && a.reason !== 'excluded')
  return {
    warnings: (data.invwarn || []).length, invoices: att.length,
    needs: needs.map(a => decByDoc[a.document_id] || card(a)), queue: queue.map(card), info: info.map(card), excluded: excluded.length,
    docs: (data.docs || []).map(x => ({ vendor: vendorShort(x.vendor) || x.vendor || '', number: x.document_number || x.document_type || '', date: x.document_date, status: x.status || '' })),
    tile: { now: needs.length, review: queue.length },
  }
}
