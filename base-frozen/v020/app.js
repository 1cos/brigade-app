/* Brigade V020 — PWA on live Brigade data (read-only). Navigation = V020-B Clean pass:
   worlds at the bottom, open things as tabs, back always names where it goes, one decision queue. */
(function () {
const BD = window.BrigadeData;
const BRIGADE_URL = 'https://1cos.github.io/back-of-house/';

/* ============ ICONS ============ */
const sv = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  today: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  restaurant: sv('<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2.5 1-4 4-4 8h4"/>'),
  catering: sv('<path d="M3 17h18M4 17a8 8 0 0 1 16 0M12 9V7M10 7h4M2 20h20"/>'),
  planner: sv('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/>'),
  prep: sv('<path d="M4 12h16l-1.5 8h-13zM8 12V8a4 4 0 0 1 8 0v4"/>'),
  book: sv('<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M4 16a4 4 0 0 1 4-4h10"/>'),
  box: sv('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  sales: sv('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  alert: sv('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  doc: sv('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>'),
  cart: sv('<path d="M2 3h3l3 12h11l2-8H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>'),
  fire: sv('<path d="M12 22c4 0 7-3 7-7 0-5-5-8-6-13-3 3-4 6-4 9-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z"/>'),
  ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
};
const WORLDS = { today: { label: 'Today', c: '--today' }, restaurant: { label: 'Restaurant', c: '--rest' }, catering: { label: 'Catering', c: '--cat' }, planner: { label: 'Planner', c: '--plan' } };

/* ============ HELPERS ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const fmt = v => { const n = num(v); if (n === null) return ''; return (Math.round(n * 100) / 100).toString(); };
const money = v => { const n = num(v); return n === null ? '' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const plural = (n, w) => `${n} ${n === 1 ? w : /(s|sh|ch|x)$/.test(w) ? w + 'es' : w + 's'}`;
/* bot reasons arrive as "color|IT|EN|ES": keep the English sentence */
const reasonEN = s => { const p = String(s || '').split('|'); if (/^(red|yellow|green|orange|grey|gray|blue)$/.test(p[0])) p.shift(); return (p.length >= 3 ? p[1] : p[0] || '').trim(); };
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const cat = c => { const x = String(c || 'Other').split('|')[0].trim(); return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : 'Other'; };
const tFmt = iso => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';
const dCDT = iso => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso)) : '';
const dayName = (d, opt = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, opt));
const shortDay = d => dayName(d, { weekday: 'short', day: 'numeric', month: 'short' });
const byId = (list, key = 'id') => { const m = {}; (list || []).forEach(x => { m[x[key]] = x; }); return m; };
const groupBy = (list, f) => { const m = {}; (list || []).forEach(x => { const k = f(x); (m[k] = m[k] || []).push(x); }); return m; };

/* data gate: returns true when every dataset is in memory; otherwise starts loading */
function need(...names) {
  let ok = true;
  names.forEach(n => {
    const s = BD.store[n];
    if (!s || s.data === undefined) { ok = false; BD.load(n).catch(() => {}); }
    else if (Date.now() - s.at > 5 * 60 * 1000) BD.load(n).catch(() => {});
  });
  return ok;
}
function waiting(...names) {
  const errs = names.map(n => BD.error(n)).filter(Boolean);
  if (errs.length) return `<div class="err"><b>Brigade did not answer.</b><br>${esc(errs[0].message)}<br><button class="lnk" data-a="refresh">Try again</button></div>`;
  return `<div class="skel">Loading from Brigade…</div>`;
}
const SUGG_LABEL = { do_first: 'Do first', prep_today: 'Prep today', count_first: 'Count first', looks_ok: 'Looks OK', defer_to_tomorrow: 'Better tomorrow', no_demand_path: 'Check', out_of_scope: 'Check' };

/* ============ STATE (UI only, per device) ============ */
const KEY = 'brigade-v020-ui';
const fresh = () => ({ v: 1, world: 'today', active: 'home', ws: { today: [{ s: 'today' }], restaurant: [{ s: 'restaurant' }], catering: [{ s: 'catering' }], planner: [{ s: 'planner' }] }, tabs: [], seq: 1 });
let S = fresh();
try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.v === 1) S = x; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const tabById = id => S.tabs.find(t => t.id === id);
const stack = () => S.active === 'home' ? S.ws[S.world] : (tabById(S.active) || { stack: [{ s: 'today' }] }).stack;
const cur = () => { const s = stack(); return s[s.length - 1]; };

const SCREENS = {};
const titleOf = e => { const sc = SCREENS[e.s]; try { return sc ? sc.title(e.p || {}) : ''; } catch (x) { return ''; } };
function backBtn() {
  const s = stack();
  if (s.length > 1) return `<button class="back" data-a="back">${ICON.back}${esc(titleOf(s[s.length - 2]))}</button>`;
  if (S.active !== 'home') { const t = tabById(S.active); if (t && t.origin) return `<button class="back" data-a="toOrigin">${ICON.back}${esc(t.origin.label)}</button>`; }
  return '';
}
const head = (eyebrow, h, sub) => `<div><div class="eyebrow">${eyebrow}</div><h1>${h}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const roNote = what => `<p class="note">Read-only version. ${what} <a class="lnk" href="${BRIGADE_URL}" target="_blank" rel="noopener">Open Brigade ↗</a></p>`;

/* ============ SHARED DERIVATIONS ============ */
function suggMap() { const s = BD.peek('sugg'); return s ? byId(s.rows, 'prep_task_id') : {}; }
function eventsFrom(d0, d1) { return (BD.peek('events') || []).filter(e => e.event_date >= d0 && e.event_date <= d1); }
function evRecipes(e) { return Array.isArray(e.event_recipes) ? e.event_recipes : []; }
function cateringFor(recipeId, d0, d1) { return eventsFrom(d0, d1).filter(e => evRecipes(e).some(r => r.recipe_id === recipeId)); }
/* ============ TRIAGE: Brigade signals → human decisions ============
   Every guardian alert is re-checked against today's data. Out-of-date alerts are not shown as decisions.
   Severity: red = real block / unreadable import / essential data missing · amber = review · neutral = info · green = done */
const ageDays = iso => (Date.now() - new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso).getTime()) / 864e5;
const dayOf = d => !d ? '' : String(d).length === 10 ? d : dCDT(d);
/* how many portions one batch makes: from the yield text, or batch weight ÷ portion weight; null if unknown */
/* canonical yield from Brigade (view recipe_yield) */
const yieldsMap = () => byId(BD.peek('yields') || []);
function yieldText(cy) {
  const parts = [];
  if (num(cy.portions) > 0) parts.push(plural(Math.round(num(cy.portions) * 100) / 100, 'portion'));
  if (num(cy.yield_qty) > 0) parts.push(`batch ${fmt(num(cy.yield_qty) / 1000)} ${cy.yield_dim === 'volume' ? 'L' : 'kg'}`);
  return parts.join(' · ') || 'no yield';
}
function batchPortions(r) {
  const p = portionsFromText(r.yield_text);
  if (p) return Math.round(p);
  const u = String(r.serving_unit || '').toLowerCase(), q = num(r.serving_qty), w = num(r.base_weight_g);
  if ((u === 'g' || u === 'ml') && q > 0 && w > 0) { const k = w / q; return k > 1.5 ? Math.round(k) : 1; }
  return null;
}
const portionsFromText = t => { const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*(porzion|porzin|portion|serv)/i); return m ? parseFloat(m[1].replace(',', '.')) : null; };
function yieldOf(r) {
  const parts = [], p = num(r.base_servings) || portionsFromText(r.yield_text);
  if (r.yield_text && r.yield_text.trim()) parts.push('yield “' + r.yield_text.trim().replace(/\s+/g, ' ') + '”');
  if (num(r.base_servings)) parts.push(plural(num(r.base_servings), 'portion'));
  if (num(r.base_weight_g)) parts.push('batch ' + fmt(r.base_weight_g / 1000) + ' kg');
  else if (num(r.base_weight)) parts.push('batch ' + fmt(r.base_weight) + ' ' + (r.weight_unit || ''));
  return { has: !!(p || num(r.base_weight_g) || num(r.base_weight) || /\d/.test(r.yield_text || '')), text: parts.join(' and ') };
}
const UNIT = { pezzi: 'pieces', pz: 'pieces', porzione: 'portion', porzioni: 'portions', filetto: 'fillet' };
const portionOf = r => { let u = UNIT[String(r.serving_unit || '').toLowerCase()] || r.serving_unit || ''; if (num(r.serving_qty) === 1) u = u.replace(/s$/, ''); return [r.serving_qty, u].filter(Boolean).join(' '); };
const soldText = o => { const m = String(o.summary || o.body || '').match(/sold (\d+) times in the last 30 days/i); return m ? `Sold ${m[1]} times in the last 30 days.` : ''; };
const vendorShort = v => /hardie/i.test(v || '') ? "Hardie's" : /walmart/i.test(v || '') ? 'Walmart' : /^bek$|ben e/i.test(v || '') ? 'BEK' : (v || 'Vendor');
const nice = t => { t = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
const recipeBtn = (id, label, focus) => `<button class="btn" data-a="openRecipe" data-r="${id}" data-focus="${focus || ''}">${label}</button>`;
const brigadeBtn = label => `<a class="btn ghost" href="${BRIGADE_URL}" target="_blank" rel="noopener">${label} ↗</a>`;
const ISSUE = { missing_photo: 'Recipes without a photo', missing_procedure: 'Recipes without a written procedure', missing_pos_name: 'Recipes without a POS name', null_stock: 'Prep without a stock count' };

/* "Hardie's #07137898": how an invoice is named everywhere */
function invoiceLabels() {
  const m = {};
  (BD.peek('invwarn') || []).forEach(x => { if (x.document_id && !m[x.document_id]) m[x.document_id] = `${vendorShort(x.vendor)}${x.document_number ? ' #' + x.document_number : ''}`; });
  return m;
}
function invoiceCards() {
  const byDoc = groupBy(BD.peek('invwarn') || [], x => x.document_id || x.id), cards = [], excluded = [];
  Object.values(byDoc).forEach(list => {
    const f = list[0], when = f.document_date, vendor = vendorShort(f.vendor), docId = f.document_id;
    const label = `${vendor}${f.document_number ? ' #' + f.document_number : ''}`;
    if (list.some(x => x.code === 'BUYER-BAR-001')) { excluded.push(f); return; }
    const broken = list.find(x => /PARSE_ERROR|UNKNOWN_DOC_TYPE/.test(x.code || ''));
    if (broken) {
      cards.push({ docId, sev: 'red', area: 'invoice', today: ageDays(when || f.created_at) <= 14, date: when || f.created_at, title: `${vendor} invoice could not be read`, now: label,
        why: broken.code === 'PARSE_ERROR' ? 'No lines were found in the document, so prices and stock were not updated.' : 'Brigade did not recognise this document, so nothing was imported.',
        missing: 'A readable copy of the invoice', cta: brigadeBtn('Open invoices in Brigade') });
      return;
    }
    const items = {};
    list.forEach(x => { const m = String(x.message || '').match(/ordered ([\d.]+), (?:shipped|received) ([\d.]+) of (.+)$/i); if (m) items[m[3].trim()] = { item: m[3].trim(), ord: +m[1], got: +m[2] }; });
    const all = Object.values(items), short = all.filter(i => i.got < i.ord), extra = all.filter(i => i.ord === 0 && i.got > 0), used = new Set(), lines = [];
    short.forEach(sh => {
      const tok = sh.item.split(/[^A-Z]+/i).filter(t => t.length > 2 && !/fresh|assorted|sliced|raw|organic|the/i.test(t));
      let e = extra.find(x => !used.has(x) && tok.some(t => x.item.toUpperCase().includes(t.toUpperCase())));
      if (!e && short.length === 1 && extra.length === 1) e = extra[0];
      if (e) { used.add(e); lines.push(`${nice(sh.item)} → ${nice(e.item)}${sh.got ? ` (${sh.got} of ${sh.ord} arrived, plus ${e.got} substitute)` : ` (${e.got})`}`); }
      else lines.push(`${nice(sh.item)}: ${sh.got ? `${sh.got} of ${sh.ord}` : `none of ${sh.ord}`} shipped`);
    });
    /* one short item and one unexpected item left on the same invoice: that is a substitution too */
    const lastS = short.filter(sh => !lines.some(l => l.startsWith(nice(sh.item) + ' →'))), lastE = extra.filter(x => !used.has(x));
    if (lastS.length === 1 && lastE.length === 1) { const k = lines.indexOf(lines.find(l => l.startsWith(nice(lastS[0].item) + ':'))); lines[k] = `${nice(lastS[0].item)} → ${nice(lastE[0].item)} (${lastE[0].got})`; used.add(lastE[0]); }
    extra.filter(x => !used.has(x)).forEach(x => lines.push(`${nice(x.item)}: ${x.got} received, not ordered`));
    if (!lines.length) return;
    const subs = lines.filter(l => l.includes('→')).length;
    cards.push({ docId, sev: 'amber', area: 'invoice', today: false, date: when, now: label, lines,
      title: subs === lines.length ? `${vendor} substituted ${plural(subs, 'item')}` : subs ? `${vendor} substituted ${subs} and shorted ${lines.length - subs}` : `${vendor} did not ship ${plural(lines.length, 'item')}`,
      why: f.doc_status === 'pending' ? 'The invoice is waiting for review in Brigade.' : 'The invoice is already imported. Check stock and prices for these lines.',
      cta: brigadeBtn('Review in Brigade') });
  });
  if (excluded.length) cards.push({ sev: 'neutral', area: 'invoice', date: excluded[0].document_date, title: `${plural(excluded.length, 'Walmart receipt')} kept out of the kitchen`, why: 'Bought by a non-kitchen buyer, so excluded on purpose.' });
  return cards.sort((a, b) => (dayOf(b.date)).localeCompare(dayOf(a.date)));
}

/* ATTENTION01 — WHAT NEEDS CHEF comes from ONE place: Brigade's view attention_items.
   It classifies every open signal (L'Ufficio + invoices) against today's data:
   action_now (Today) · needs_chef (Decisions, not today) · backlog (its workspace) · info (history) · data_quality_unknown.
   The badge in Brigade, Today, Decisions and the Restaurant tiles all count the same thing: distinct decisions.
   This file only writes the words. */
const REASON_LABEL = {
  snoozed: 'Snoozed', acted_on: "Already handled in L'Ufficio", recipe_gone: 'Recipe no longer in Brigade', recipe_archived: 'Recipe archived',
  ai_copy: 'Chef AI copies of team messages', praise: 'Team notes and praise', old_note: 'Team notes and praise',
  yield_resolved: 'Out of date: already fixed', bom_now_present: 'Out of date: already fixed', portion_optional: 'Portion size not set (optional)',
  pos_link_unknown: 'Not asked: POS link', stock_untrusted: 'Not asked: stock counts',
  deferred_by_chef: 'Deferred by Chef', excluded: 'Walmart receipts kept out of the kitchen', imported_with_notes: 'Imported invoices with notes', legacy_record: 'Old records',
  return_pickup_slip: 'Return pick-up slips (not invoices)', walmart_waiting_revision: 'Walmart: waiting for the updated invoice', other: 'Other',
};
const REASON_WHY = {
  yield_resolved: 'The yield is set now; the alert will close on its own.', bom_now_present: 'The recipe has its ingredients now.',
  portion_optional: 'Optional. Only used to plan prep from sales.',
  pos_link_unknown: 'Depends on whether the dish is sold on its own. Not asked until it matters.',
  stock_untrusted: 'Depends on stock counts the team enters, which are not reliable right now. Brigade does not ask you anything.',
  return_pickup_slip: 'Hardie\'s picked up a return. The credit arrives as a separate credit memo.',
  walmart_waiting_revision: 'Walmart sent only the total. The version with the items usually follows and replaces it.',
  legacy_record: 'A broken copy of an order that was already imported under the right number.',
};
const attentionMap = () => groupBy(BD.peek('attention') || [], a => a.item_id);
const isAction = a => a.attention === 'action_now' || a.attention === 'needs_chef';

let TRI = null, TRI_KEY = '';
function triage() {
  const key = ['office', 'recipes', 'bom', 'invwarn', 'yields', 'attention'].map(n => (BD.store[n] || {}).at).join('|');
  if (TRI && key === TRI_KEY) return TRI;
  const rec = byId(BD.peek('recipes') || []), off = byId(BD.peek('office') || []), bomN = {}, out = [], stale = [], history = [], completeness = [];
  (BD.peek('bom') || []).forEach(b => { bomN[b.parent_recipe_id] = (bomN[b.parent_recipe_id] || 0) + 1; });
  const att = BD.peek('attention') || [], inv = byId(invoiceCards(), 'docId');
  const rname = id => (rec[id] || {}).title || 'Recipe';

  /* decisions: one card per decision_key */
  Object.entries(groupBy(att.filter(isAction), a => a.decision_key || a.item_id)).forEach(([k, rows]) => {
    const a = rows[0], o = off[a.item_id] || {}, today = a.attention === 'action_now', base = { today, date: a.created_at, cls: a.attention };
    const msg = x => String(x.body || x.summary || x.title || '').trim();
    switch (a.reason) {
      case 'no_yield': return out.push({ ...base, sev: 'red', area: 'recipe', rid: a.recipe_id, focus: 'yield', title: `${rname(a.recipe_id)} has no yield`,
        why: `${soldText(o)} Brigade does not know how much one batch makes, so food cost and stock count it as one portion.`.trim(), missing: 'The yield: batch weight in kg, or number of portions', cta: recipeBtn(a.recipe_id, 'Open recipe', 'yield') });
      case 'no_ingredients': return out.push({ ...base, sev: 'red', area: 'recipe', rid: a.recipe_id, focus: 'bom', title: `${rname(a.recipe_id)} has no ingredients`,
        why: `${soldText(o)} Food cost and prep forecast cannot see this dish.`.trim(), missing: 'Its ingredients and sub-recipes', cta: recipeBtn(a.recipe_id, 'Open recipe', 'bom') });
      case 'portions_unknown': { const cy = yieldsMap()[a.recipe_id] || {};
        return out.push({ ...base, sev: 'amber', area: 'recipe', rid: a.recipe_id, focus: 'yield', title: `${rname(a.recipe_id)}: one portion or a batch?`, now: yieldText(cy),
          why: `${soldText(o)} It has a batch size but not how many portions it makes. If it is a batch, each sale deducts too much.`.trim(), missing: 'How many portions one batch makes', cta: recipeBtn(a.recipe_id, 'Open recipe', 'yield') }); }
      case 'bom_maybe_incomplete': { const ids = [...new Set(rows.map(x => x.recipe_id))].filter(Boolean);
        return out.push({ ...base, sev: 'amber', area: 'recipe', title: `${plural(ids.length, 'dish')} list only a few ingredients`,
          why: 'Brigade cannot tell whether these lists are complete. If something is missing, the food cost looks too low.',
          missing: 'Check each list once and add what is missing', recipes: ids.map(id => ({ id, label: `${rname(id)} · ${plural(bomN[id] || 0, 'ingredient')}` })) }); }
      case 'recipe_proposal': return out.push({ ...base, sev: 'amber', area: 'team', title: `Sous Chef proposal for ${nice(o.recipe_name || rname(a.recipe_id))}`, why: msg(o),
        missing: 'Your answer. Approving switches on with protected recipe saving; until then you can read or reject it.', cta: brigadeBtn("Open in L'Ufficio"), cta2: a.recipe_id ? recipeBtn(a.recipe_id, 'Open recipe') : '' });
      case 'old_team_message': { const items = rows.map(x => off[x.item_id]).filter(Boolean).sort((x, y) => x.created_at < y.created_at ? -1 : 1);
        const d0 = items.length ? shortDay(dayOf(items[0].created_at)) : '', d1 = items.length ? shortDay(dayOf(items[items.length - 1].created_at)) : '';
        return out.push({ ...base, date: '', sev: 'amber', area: 'team', title: `${plural(rows.length, 'team message')} never closed`, now: d0 && d1 ? `${d0} – ${d1}` : '',
          why: 'Older than two weeks. Some ask for recipe changes, some report production. Archive what is already handled, answer the rest.',
          lines: items.map(x => `${x.from_user || 'Team'}: ${cut(msg(x), 90)}`), missing: 'One review', cta: brigadeBtn("Open L'Ufficio") }); }
      case 'team_message': { const prod = /\b(i made|i did|made|ho fatto)\b[^.]*\d/i.test(msg(o));
        return out.push({ ...base, sev: 'amber', area: 'team', title: prod ? `${o.from_user || 'Team'} reported production` : `${o.from_user || 'Team'}: ${cut(msg(o), 70)}`, why: msg(o),
          missing: prod ? 'Check it is recorded as production' : 'Your answer', cta: brigadeBtn(prod ? 'Check in Brigade' : "Answer in L'Ufficio") }); }
      case 'invoice_stuck_in_review': case 'revision_after_import': case 'unreadable_invoice': case 'walmart_revision_missing': {
        const c = inv[a.document_id] || {}, label = invoiceLabels()[a.document_id] || 'Invoice';
        const T = { invoice_stuck_in_review: [`${label} is waiting in review`, 'Some quantities differ from the order, so Brigade cannot book it on its own. Until then its cost is not counted.', 'Your check in Vendor Review'],
          revision_after_import: [`${label}: updated after it was imported`, 'Walmart sent a new version of an invoice that is already booked. Nothing was changed.', 'Check whether the items differ'],
          unreadable_invoice: [`${label} could not be read`, 'No lines were found in the document, so prices and stock were not updated.', 'A readable copy of the invoice'],
          walmart_revision_missing: [`${label}: the updated invoice never arrived`, 'Walmart sent only the total more than a week ago.', 'The invoice with the items'] }[a.reason];
        return out.push({ ...base, sev: a.reason === 'invoice_stuck_in_review' || a.reason === 'revision_after_import' ? 'amber' : 'red', area: 'invoice', docId: a.document_id,
          title: T[0], why: T[1], lines: c.lines, missing: T[2], cta: brigadeBtn('Open invoices in Brigade') }); }
      default: return out.push({ ...base, sev: 'amber', area: 'other', title: cut(o.title || a.family, 80), why: 'Brigade does not know how to read this alert yet.', missing: 'Your look', cta: brigadeBtn("Open L'Ufficio") });
    }
  });

  /* backlog: recipe completeness lives in Restaurant → Recipes; invoices in review live in Invoices */
  att.filter(a => a.attention === 'backlog' && a.origin === 'office').forEach(a => completeness.push({ kind: a.reason === 'recipe_completeness' ? (a.family === 'missing_photo' ? 'photo' : 'procedure') : 'portions', rid: a.recipe_id, title: rname(a.recipe_id) }));

  /* info and data quality unknown: history, grouped by reason */
  att.filter(a => a.attention === 'info' || a.attention === 'data_quality_unknown').forEach(a => {
    const o = off[a.item_id] || {}, c = inv[a.document_id] || {};
    const title = a.origin === 'invoice' ? (invoiceLabels()[a.document_id] || 'Invoice') : a.recipe_id ? rname(a.recipe_id) : cut(String(o.body || o.summary || o.title || ''), 100);
    const row = { sev: a.attention === 'info' ? 'neutral' : 'amber', kind: REASON_LABEL[a.reason] || 'Other', date: a.created_at, title, why: REASON_WHY[a.reason] || (o.from_user ? o.from_user : ''), rid: a.recipe_id, area: a.origin === 'invoice' ? 'invoice' : 'office' };
    (a.reason === 'yield_resolved' || a.reason === 'bom_now_present' ? stale : history).push(row);
  });

  const rank = { action_now: 0, needs_chef: 1 }, srank = { red: 0, amber: 1 };
  out.sort((a, b) => rank[a.cls] - rank[b.cls] || srank[a.sev] - srank[b.sev] || dayOf(b.date).localeCompare(dayOf(a.date)));
  TRI_KEY = key; TRI = { decisions: out, stale, history, completeness };
  return TRI;
}
function decCard(d) {
  return `<div class="dec"><div class="top"><span class="sev ${d.sev}"></span><div style="flex:1;min-width:0"><div class="name">${esc(d.title)}</div><div class="meta">${d.now ? esc(d.now) + ' · ' : ''}${d.date ? shortDay(dayOf(d.date)) : ''}</div></div></div>
    ${d.why ? `<div class="q">${esc(d.why)}</div>` : ''}
    ${d.lines ? `<ul class="lines">${d.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    ${d.recipes ? `<div class="list">${d.recipes.map(x => `<button class="row" data-a="openRecipe" data-r="${x.id}" data-focus="bom"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.label)}</div></span><span class="chev">›</span></button>`).join('')}</div>` : ''}
    ${d.missing ? `<div class="meta"><b>Missing:</b> ${esc(d.missing)}</div>` : ''}
    ${d.cta || d.cta2 ? `<div class="links">${d.cta || ''}${d.cta2 || ''}</div>` : ''}</div>`;
}

/* ============ TODAY ============ */
SCREENS.today = { title: () => 'Today', c: '--today', render() {
  const t = BD.today(), h = BD.hourCDT();
  const greet = h < 12 ? 'Good morning, Chef.' : h < 17 ? 'Good afternoon, Chef.' : 'Good evening, Chef.';
  const top = `<div class="greet"><div class="eyebrow">${dayName(t)}</div><h1>${greet}</h1>`;
  if (!need('sugg', 'prep', 'events', 'office', 'preplog', 'reports', 'recipes', 'bom', 'invwarn', 'yields', 'attention')) return `<div class="page">${top}</div>${waiting('sugg', 'prep', 'events', 'office', 'preplog', 'reports', 'recipes', 'bom', 'invwarn', 'yields', 'attention')}</div>`;
  const sugg = BD.peek('sugg'), prep = byId(BD.peek('prep')), tom = BD.addDays(t, 1);
  const rows = sugg.rows.filter(r => prep[r.prep_task_id]).map(r => ({ r, p: prep[r.prep_task_id] }));
  const chap = st => rows.filter(x => x.r.status === st);
  const doFirst = chap('do_first'), today = chap('prep_today'), count = chap('count_first'), defer = chap('defer_to_tomorrow');
  const open = [...doFirst, ...today].filter(x => !x.p.done);
  const brief = sugg.date !== t
    ? `The prep bot has not run today. The plan below is from <b>${shortDay(sugg.date || t)}</b>.`
    : open.length ? `Start with <b>${esc(open[0].p.name)}</b>. ${plural(open.length, 'prep')} to make today.` : 'Nothing urgent to make right now.';
  const needs = triage().decisions.filter(x => x.today), reds = needs.filter(x => x.sev === 'red').length;
  const evs = eventsFrom(t, tom);
  const prow = ({ r, p }) => {
    const ev = p.recipe_id ? cateringFor(p.recipe_id, t, tom) : [];
    const meta = p.in_progress ? `In progress${p.in_progress_by ? ' · ' + esc(p.in_progress_by) : ''}` :
      [p.current_stock != null ? `Stock ${fmt(p.current_stock)} ${esc(p.unit || '')}` : '', cut(reasonEN(r.reason), 80)].filter(Boolean).join(' · ');
    return `<button class="row ${p.done ? 'done' : ''}" data-a="openPrep" data-id="${p.id}"><span class="main">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><span class="name">${esc(p.name)}</span>${r.planned_output != null ? `<span class="qty num">${fmt(r.planned_output)} <small style="font-size:16px">${esc(r.output_unit || p.unit || '')}</small></span>` : ''}</div>
      <div class="meta">${meta}${ev.length ? ` · <span class="ctx">also for ${esc(ev.map(e => e.name).join(', '))}</span>` : ''}</div></span></button>`;
  };
  const section = (h, list, extra = '') => list.length ? `<section><div class="chap"><h2>${h}</h2><span>${extra || list.length}</span></div><div class="list">${list.map(prow).join('')}</div></section>` : '';
  /* kitchen feed: what happened today */
  const feed = [
    ...(BD.peek('preplog') || []).filter(l => dCDT(l.created_at) === t).map(l => ({ at: l.created_at, x: `${l.user_name || 'Someone'} made ${fmt(l.qty)} ${l.unit || ''} ${l.item || ''}` })),
    ...(BD.peek('reports') || []).filter(r => dCDT(r.created_at) === t).map(r => ({ at: r.created_at, x: `${r.user_name || 'Team'} to Chef: ${cut(r.message, 90)}` })),
  ].sort((a, b) => a.at < b.at ? -1 : 1).slice(-14);
  return `<div class="page" style="--c:var(--today)">
    ${top}<p class="brief">${brief}</p></div>
    ${needs.length ? `<div class="list"><button class="row" data-a="go" data-s="decisions" data-scope="today"><span class="${reds ? 'dotr' : 'dotw'}"></span><span class="main"><div class="name">${needs.length} need${needs.length === 1 ? 's' : ''} you</div><div class="meta">${esc(needs.slice(0, 3).map(x => x.title).join(' · '))}${needs.length > 3 ? ' · …' : ''}</div></span><span class="chev">›</span></button></div>` : ''}
    ${evs.length ? `<section><h2>Events today and tomorrow</h2><div class="list">${evs.map(evRow).join('')}</div></section>` : ''}
    ${section('Do first', doFirst)}${section('Prep today', today)}${section('Count first', count)}
    ${defer.length ? `<section><div class="chap"><h2>Better tomorrow</h2><span>${defer.length}</span></div><div class="list">${defer.map(prow).join('')}</div></section>` : ''}
    ${!rows.length ? '<p class="note">No prep plan found in the last 7 days.</p>' : ''}
    <section><h2>Kitchen feed</h2><div class="feed">${feed.length ? feed.map(f => `<div><time>${tFmt(f.at)}</time><span>${esc(f.x)}</span></div>`).join('') : '<div><span>Nothing recorded yet today.</span></div>'}</div></section>
    <p class="note" style="font-size:14px">Prep plan: Brigade bot run of ${esc(sugg.date || '—')} · ${sugg.rows.length} prep checked. Same rule as the Prep tab in Brigade.</p>
  </div>`;
} };
function evRow(e) {
  const recs = evRecipes(e).length;
  return `<button class="row" data-a="openEvent" data-id="${e.id}"><span class="dotc"></span><span class="main"><div class="name">${esc(e.name)}</div><div class="meta">${shortDay(e.event_date)}${e.event_time ? ' · ' + esc(String(e.event_time).slice(0, 5)) : ''}${e.guest_count ? ' · ' + e.guest_count + ' guests' : ''}${recs ? ' · ' + plural(recs, 'dish') : ''}</div></span><span class="right ${/prospect|tentative/.test(e.status || '') ? 'wtx' : 'muted'}">${esc(e.status || '')}</span><span class="chev">›</span></button>`;
}

/* ============ DECISIONS (one queue; everything else links here) ============ */
SCREENS.decisions = { title: () => 'Decisions', c: '--today', render(p) {
  if (!need('office', 'recipes', 'bom', 'invwarn', 'yields', 'attention')) return `<div class="page">${backBtn()}${waiting('office', 'invwarn', 'yields', 'attention')}</div>`;
  const T = triage(), today = p.scope === 'today', list = today ? T.decisions.filter(d => d.today) : T.decisions;
  const now = list.filter(d => d.cls === 'action_now'), later = list.filter(d => d.cls === 'needs_chef');
  const comp = T.completeness.length;
  const sec = (h, l) => l.length ? `<section><div class="chap"><h2>${h}</h2><span>${l.length}</span></div><div class="list">${l.map(decCard).join('')}</div></section>` : '';
  const hist = groupBy(T.history, h => h.kind);
  const fold = (h, l) => `<section><div class="chap"><h2>${esc(h)}</h2><span>${l.length}</span></div><div class="list">${p['m_' + h] ? l.map(x => x.rid ? `<button class="row" data-a="openRecipe" data-r="${x.rid}"><span class="sev ${x.sev}" style="margin-top:0"></span><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.title)}</div>${x.why ? `<div class="meta">${esc(x.why)}</div>` : ''}</span><span class="chev">›</span></button>` : `<div class="row"><span class="sev ${x.sev}" style="margin-top:0"></span><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.title)}</div><div class="meta">${esc(x.why || '')}${x.date ? ' · ' + shortDay(dayOf(x.date)) : ''}</div></span></div>`).join('') : `<button class="more" data-a="more" data-k="m_${esc(h)}">Show ${l.length}</button>`}</div></section>`;
  return `<div class="page" style="--c:var(--today)">${backBtn()}
    ${head(today ? 'Today' : "Brigade · L'Ufficio and invoices", list.length ? `${list.length} need${list.length === 1 ? 's' : ''} you` : 'Nothing needs you', 'Checked against Brigade\'s data just now.')}
    ${sec('Act now', now)}${sec('Your decision, not today', later)}
    ${today ? `<button class="lnk" data-a="go" data-s="decisions" data-scope="all">${later.length ? `${plural(later.length, 'decision')} for later, ` : ''}history and out-of-date alerts ›</button>` : `
      ${comp ? `<div class="list"><button class="row" data-a="go" data-s="r-complete"><span class="main"><div class="name">Recipe completeness</div><div class="meta">Missing photos and procedures. Not urgent, kept in Restaurant → Recipes.</div></span><span class="chev">›</span></button></div>` : ''}
      ${T.stale.length ? fold('Out of date: already fixed', T.stale.map(x => ({ sev: 'green', title: x.title, why: x.why, rid: x.rid }))) : ''}
      ${Object.entries(hist).sort((a, b) => b[1].length - a[1].length).map(([h, l]) => fold(h, l)).join('')}`}
    <p class="note" style="font-size:14px">Read-only version: decisions are made in Brigade. When Brigade changes, this list updates on the next refresh.</p>
  </div>`;
} };

/* ============ RESTAURANT ============ */
SCREENS.restaurant = { title: () => 'Restaurant', c: '--rest', render() {
  need('sugg', 'prep', 'recipes', 'ingredients', 'vendors', 'sales', 'office', 'invwarn', 'attention');
  const n = x => BD.peek(x);
  const s = n('sugg'), act = s ? s.rows.filter(r => ['do_first', 'prep_today', 'count_first'].includes(r.status)).length : '…';
  const dno = n('vendors') ? new Set(n('vendors').filter(v => v.do_not_order).map(v => v.ingredient_id)).size : 0;
  const last = n('sales') && n('sales')[0];
  need('bom'); need('yields'); need('attention'); const T = n('office') && n('recipes') && n('bom') && n('invwarn') && n('yields') && n('attention') ? triage() : null;
  /* same count as the Decisions screen and the badge in Brigade: distinct decisions from attention_items */
  const dec = T ? T.decisions : null, att = n('attention') || [];
  const invNow = att.filter(a => a.origin === 'invoice' && isAction(a)).length, invQueue = att.filter(a => a.origin === 'invoice' && a.attention === 'backlog').length;
  const tile = (s, ic, lbl, val, cls = '', scope = '') => `<button class="big ${cls}" data-a="go" data-s="${s}" ${scope ? `data-scope="${scope}"` : ''}>${ICON[ic]}<div><div class="lbl">${lbl}</div><div class="val">${val}</div></div></button>`;
  const row = (s, name, meta) => `<button class="row" data-a="go" data-s="${s}"><span class="main"><div class="name">${name}</div><div class="meta">${meta}</div></span><span class="chev">›</span></button>`;
  return `<div class="page" style="--c:var(--rest)">
    ${head("Zeno's", 'Restaurant')}
    <div class="grid">
      ${tile('r-prep', 'prep', 'Prep', `<b>${act}</b> to do today`)}
      ${tile('r-recipes', 'book', 'Recipes', `<b>${n('recipes') ? n('recipes').length : '…'}</b> recipes`)}
      ${tile('r-ing', 'box', 'Ingredients', `<b>${n('ingredients') ? n('ingredients').length : '…'}</b>${dno ? ` · ${dno} do not order` : ''}`)}
      ${tile('r-sales', 'sales', 'Sales', last ? `<b>${money(last.net_sales)}</b> ${shortDay(last.sale_date)}` : '…')}
      ${tile('decisions', 'alert', 'Decisions', dec ? (dec.length ? `<b>${dec.length}</b> to decide` : 'All clear') : '…', dec && dec.some(d => d.cls === 'action_now') ? 'alert' : '', 'all')}
      ${tile('r-inv', 'doc', 'Invoices', T ? (invNow || invQueue ? `${invNow ? `<b>${invNow}</b> need you` : ''}${invNow && invQueue ? ' · ' : ''}${invQueue ? `${invQueue} in review` : ''}` : 'All clear') : '…', invNow ? 'alert' : '')}
    </div>
    <div class="list">
      ${row('r-brief', 'Briefing', 'Today\'s points from Brigade')}
      ${row('r-team', 'Team and stations', 'Who works, where')}
      ${row('r-closing', 'Closing checks', 'By station')}
      ${row('r-journal', 'Journal', 'Open entries')}
      ${row('r-chat', 'Team chat', 'Latest messages')}
    </div>
  </div>`;
} };
SCREENS['r-prep'] = { title: () => 'Prep', c: '--rest', render(p) {
  if (!need('prep', 'sugg', 'prepclass')) return `<div class="page">${backBtn()}${waiting('prep', 'sugg')}</div>`;
  const sm = suggMap(), cl = byId(BD.peek('prepclass'), 'prep_task_id'), q = (p.q || '').toLowerCase();
  const list = BD.peek('prep').filter(x => !q || x.name.toLowerCase().includes(q));
  const g = groupBy(list, x => (cl[x.id] && cl[x.id].canonical_station) || x.category || 'Other');
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Prep', `${BD.peek('prep').length} active prep · plan of ${esc(BD.peek('sugg').date || '—')}`)}
    <input id="q" class="search" type="search" placeholder="Find a prep" value="${esc(p.q || '')}" autocomplete="off">
    ${Object.keys(g).sort().map(k => `<section><h2>${esc(k)}</h2><div class="list">${g[k].map(x => { const r = sm[x.id]; const hot = r && ['do_first', 'prep_today', 'count_first'].includes(r.status);
      return `<button class="row ${x.done ? 'done' : ''}" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">${x.current_stock != null ? 'Stock ' + fmt(x.current_stock) + ' ' + esc(x.unit || '') : 'No stock recorded'}</div></span><span class="right ${hot ? 'wtx' : 'muted'}">${r ? SUGG_LABEL[r.status] || r.status : ''}${hot && r.planned_output != null ? ' · ' + fmt(r.planned_output) + ' ' + esc(r.output_unit || '') : ''}</span></button>`; }).join('')}</div></section>`).join('')}
  </div>`;
}, after: searchBind };
SCREENS['r-recipes'] = { title: () => 'Recipes', c: '--rest', render(p) {
  if (!need('recipes')) return `<div class="page">${backBtn()}${waiting('recipes')}</div>`;
  const q = (p.q || '').toLowerCase(), list = BD.peek('recipes').filter(r => !q || (r.title || '').toLowerCase().includes(q) || (r.pos_name || '').toLowerCase().includes(q));
  const g = groupBy(list, r => cat(r.category));
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Recipes', `${BD.peek('recipes').length} in Brigade`)}
    <input id="q" class="search" type="search" placeholder="Find a recipe" value="${esc(p.q || '')}" autocomplete="off">
    ${completenessRow()}
    ${Object.keys(g).sort().map(k => `<section><h2>${esc(k)} · ${g[k].length}</h2><div class="list">${g[k].map(r => `<button class="row" data-a="openRecipe" data-r="${r.id}"><span class="main"><div class="name">${esc(r.title)}</div><div class="meta">${esc([r.yield_text, r.menu_group].filter(Boolean).join(' · ') || ' ')}</div></span><span class="chev">›</span></button>`).join('')}</div></section>`).join('') || '<p class="note">No recipe matches.</p>'}
  </div>`;
}, after: searchBind };
/* ATTENTION01 — recipe completeness: a quiet checklist, never a decision and never in Today or the badge */
function completenessRows() {
  need('attention');
  const rec = byId(BD.peek('recipes') || []);
  return (BD.peek('attention') || []).filter(a => a.origin === 'office' && a.attention === 'backlog' && a.recipe_id && rec[a.recipe_id])
    .map(a => ({ kind: a.reason === 'deferred_by_chef' ? 'deferred' : a.family === 'missing_photo' ? 'photo' : a.family === 'missing_procedure' ? 'procedure' : 'portions', r: rec[a.recipe_id] }));
}
function completenessRow() {
  const c = completenessRows(); if (!c.length) return '';
  const k = groupBy(c, x => x.kind), parts = [k.deferred && `${k.deferred.length} deferred by Chef`, k.photo && `${k.photo.length} without a photo`, k.procedure && `${k.procedure.length} without a procedure`, k.portions && `${k.portions.length} without portions per batch`].filter(Boolean);
  return `<div class="list"><button class="row" data-a="go" data-s="r-complete"><span class="main"><div class="name">Completeness</div><div class="meta">${esc(parts.join(' · '))}</div></span><span class="chev">›</span></button></div>`;
}
SCREENS['r-complete'] = { title: () => 'Completeness', c: '--rest', render(p) {
  if (!need('attention', 'recipes')) return `<div class="page">${backBtn()}${waiting('attention', 'recipes')}</div>`;
  const k = groupBy(completenessRows(), x => x.kind);
  const LBL = { deferred: 'Deferred by Chef — to complete', photo: 'Missing photo', procedure: 'Missing procedure', portions: 'Portions per batch not set' };
  const WHY = { deferred: 'Known and still open: the yield is not decided yet. Kept out of Today on purpose; nothing was filled in.', photo: 'Helps the team recognise the plate.', procedure: 'Helps a new cook make it the same way.', portions: 'Optional. The batch size is set; portions help plan prep from sales.' };
  const sec = kind => { const l = (k[kind] || []).sort((a, b) => a.r.title.localeCompare(b.r.title)); if (!l.length) return '';
    return `<section><div class="chap"><h2>${LBL[kind]}</h2><span>${l.length}</span></div><p class="note" style="margin:0 0 8px">${WHY[kind]}</p><div class="list">${p['m_' + kind] ? l.map(x => `<button class="row" data-a="openRecipe" data-r="${x.r.id}"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(x.r.title)}</div><div class="meta">${esc(cat(x.r.category))}</div></span><span class="chev">›</span></button>`).join('') : `<button class="more" data-a="more" data-k="m_${kind}">Show ${l.length}</button>`}</div></section>`; };
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant · Recipes', 'Completeness', 'Not urgent. Nothing here counts as a decision.')}
    ${sec('deferred')}${sec('photo')}${sec('procedure')}${sec('portions')}
    ${roNote('Add photos and procedures in Brigade.')}</div>`;
} };
SCREENS['r-ing'] = { title: () => 'Ingredients', c: '--rest', render(p) {
  if (!need('ingredients', 'vendors')) return `<div class="page">${backBtn()}${waiting('ingredients', 'vendors')}</div>`;
  const vg = groupBy(BD.peek('vendors'), v => v.ingredient_id), q = (p.q || '').toLowerCase();
  const list = BD.peek('ingredients').filter(i => !q || (i.name || '').toLowerCase().includes(q) || (i.name_it || '').toLowerCase().includes(q));
  const shown = p.all || q ? list : list.slice(0, 80);
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Ingredients', `${BD.peek('ingredients').length} in Brigade`)}
    <input id="q" class="search" type="search" placeholder="Find an ingredient" value="${esc(p.q || '')}" autocomplete="off">
    <div class="list">${shown.map(i => { const vs = vg[i.id] || []; const dno = vs.some(v => v.do_not_order);
      return `<button class="row" data-a="openIng" data-id="${i.id}"><span class="main"><div class="name">${esc(i.name)}</div><div class="meta">${esc(cat(i.category))} · ${vs.length ? plural(vs.length, 'vendor') : 'no vendor'}</div></span>${dno ? '<span class="right wtx">Do not order</span>' : ''}<span class="chev">›</span></button>`; }).join('')}
    ${shown.length < list.length ? `<button class="more" data-a="more" data-k="all">Show all ${list.length}</button>` : ''}</div>
  </div>`;
}, after: searchBind };
SCREENS['r-sales'] = { title: () => 'Sales', c: '--rest', render() {
  if (!need('sales', 'salesItems')) return `<div class="page">${backBtn()}${waiting('sales', 'salesItems')}</div>`;
  const days = BD.peek('sales'), it = BD.peek('salesItems');
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant · TouchBistro', 'Sales')}
    <section><h2>Last ${days.length} days</h2><div class="list">${days.map(d => `<div class="row"><span class="main"><div class="name">${shortDay(d.sale_date)}</div><div class="meta">${d.bill_count || 0} bills</div></span><span class="qty num" style="font-size:20px">${money(d.net_sales)}</span></div>`).join('')}</div></section>
    ${it.date ? `<section><h2>Most sold · ${shortDay(it.date)}</h2><div class="list">${it.rows.slice(0, 20).map(r => `<div class="row"><span class="main"><div class="name">${esc(r.menu_item)}</div><div class="meta">${esc(r.menu_group || '')} · ${money(r.net_sales)}</div></span><span class="qty num" style="font-size:20px">${fmt(r.quantity)}</span></div>`).join('')}</div></section>` : ''}
  </div>`;
} };
SCREENS['r-inv'] = { title: () => 'Invoices', c: '--rest', render() {
  if (!need('invwarn', 'docs', 'attention')) return `<div class="page">${backBtn()}${waiting('invwarn', 'docs', 'attention')}</div>`;
  /* ATTENTION01: where each invoice goes is decided by attention_items; the cards only describe it */
  const d = BD.peek('docs'), raw = BD.peek('invwarn').length, labels = invoiceLabels(), cards = byId(invoiceCards(), 'docId');
  const att = (BD.peek('attention') || []).filter(a => a.origin === 'invoice');
  const card = a => { const c = cards[a.document_id] || {}, info = a.attention === 'info' || a.attention === 'data_quality_unknown', label = labels[a.document_id] || c.now || 'Invoice';
    const own = info && (REASON_WHY[a.reason] || !c.title);   // no card of its own, or a reason that explains it better
    return { ...c, sev: isAction(a) ? (a.attention === 'action_now' ? 'red' : 'amber') : info ? 'neutral' : 'amber',
      now: own ? '' : label, title: own ? `${label} · ${REASON_LABEL[a.reason] || 'For information'}` : (c.title || label), why: own ? (REASON_WHY[a.reason] || '') : c.why }; };
  const needs = att.filter(isAction), queue = att.filter(a => a.attention === 'backlog');
  const excluded = att.filter(a => a.reason === 'excluded'), info = att.filter(a => !isAction(a) && a.attention !== 'backlog' && a.reason !== 'excluded');
  const T = needs.length ? byId(triage().decisions.filter(x => x.area === 'invoice'), 'docId') : {};
  const sec = (h, l, f) => l.length ? `<section><div class="chap"><h2>${h}</h2><span>${l.length}</span></div><div class="list">${l.map(f).map(decCard).join('')}</div></section>` : '';
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Invoices', `${raw} open warnings in Brigade, on ${plural(att.length, 'invoice')}`)}
    ${sec('Needs you', needs, a => T[a.document_id] || card(a))}
    ${sec('Waiting in review', queue, card)}
    ${sec('For information', info, card)}
    ${excluded.length ? `<section><div class="list">${decCard({ sev: 'neutral', title: `${plural(excluded.length, 'Walmart receipt')} kept out of the kitchen`, why: 'Bought by a non-kitchen buyer, so excluded on purpose.' })}</div></section>` : ''}
    <section><div class="chap"><h2>Documents · last 30 days</h2><span>${d.length}</span></div><div class="list">${d.slice(0, 40).map(x => `<div class="row"><span class="main"><div class="name">${esc(vendorShort(x.vendor))} · ${esc(x.document_number || x.document_type || '')}</div><div class="meta">${x.document_date ? shortDay(x.document_date) : ''} · ${esc(x.status || '')}</div></span>${x.status === 'error' ? '<span class="dotr"></span>' : ''}</div>`).join('')}</div></section>
  </div>`;
} };
SCREENS['r-brief'] = { title: () => 'Briefing', c: '--rest', render() {
  if (!need('briefing')) return `<div class="page">${backBtn()}${waiting('briefing')}</div>`;
  const b = BD.peek('briefing')[0]; const pts = b ? (Array.isArray(b.points_en) ? b.points_en : String(b.points_en || '').split('\n')).filter(Boolean) : [];
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head(b ? shortDay(b.date) : 'Brigade', 'Briefing')}
    <div class="list">${pts.map(x => `<div class="row"><span class="main"><div class="name" style="font-weight:500;font-size:17px">${esc(typeof x === 'string' ? x : (x.text || JSON.stringify(x)))}</div></span></div>`).join('') || '<div class="row"><span class="main">No briefing yet.</span></div>'}</div></div>`;
} };
SCREENS['r-team'] = { title: () => 'Team', c: '--rest', render() {
  if (!need('shifts', 'staff', 'stations')) return `<div class="page">${backBtn()}${waiting('shifts', 'staff')}</div>`;
  const t = BD.today(), sh = BD.peek('shifts').filter(s => s.date === t), st = groupBy(BD.peek('stations').filter(s => s.is_default), s => s.staff_name);
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Team and stations')}
    <section><h2>On shift today</h2><div class="list">${sh.map(s => `<div class="row"><span class="main"><div class="name">${esc(s.employee_name)}</div><div class="meta">${esc(s.role_name || s.department_name || '')}</div></span><span class="right muted">${esc(s.start_label || '')}–${esc(s.end_label || '')}</span></div>`).join('') || '<div class="row"><span class="main"><div class="meta">No shifts synced from 7shifts for today.</div></span></div>'}</div></section>
    <section><h2>Team · ${BD.peek('staff').length}</h2><div class="list">${BD.peek('staff').map(u => `<div class="row"><span class="main"><div class="name">${esc(u.name)}</div><div class="meta">${esc(u.role || '')}${u.default_station ? ' · ' + esc(u.default_station) : ''}${st[u.name] ? ' · ' + esc(st[u.name].map(x => x.station).join(', ')) : ''}</div></span></div>`).join('')}</div></section></div>`;
} };
SCREENS['r-closing'] = { title: () => 'Closing', c: '--rest', render() {
  if (!need('closing')) return `<div class="page">${backBtn()}${waiting('closing')}</div>`;
  const g = groupBy(BD.peek('closing'), c => c.station || 'Other');
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Closing checks')}
    ${Object.keys(g).sort().map(k => `<section><h2>${esc(k)}</h2><div class="list">${g[k].map(c => `<div class="row"><span class="main"><div class="name">${esc(c.name)}</div>${c.note ? `<div class="meta">${esc(c.note)}</div>` : ''}</span></div>`).join('')}</div></section>`).join('')}
    ${roNote('Tick closing checks in Brigade.')}</div>`;
} };
SCREENS['r-journal'] = { title: () => 'Journal', c: '--rest', render() {
  if (!need('journal')) return `<div class="page">${backBtn()}${waiting('journal')}</div>`;
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Journal')}
    <div class="list">${BD.peek('journal').map(j => `<div class="row"><span class="main"><div class="name">${esc(j.title || cut(j.body, 80))}</div><div class="meta">${esc(j.author || '')} · ${j.entry_date ? shortDay(j.entry_date) : ''} · ${esc(j.status || '')}${j.assigned_to ? ' · ' + esc(j.assigned_to) : ''}</div></span>${j.severity === 'high' || j.severity === 'critical' ? '<span class="dotw"></span>' : ''}</div>`).join('') || '<div class="row"><span class="main">No open entries.</span></div>'}</div></div>`;
} };
SCREENS['r-chat'] = { title: () => 'Chat', c: '--rest', render() {
  if (!need('messages')) return `<div class="page">${backBtn()}${waiting('messages')}</div>`;
  return `<div class="page" style="--c:var(--rest)">${backBtn()}${head('Restaurant', 'Team chat')}
    <div class="feed">${BD.peek('messages').map(m => `<div><time>${tFmt(m.created_at)}</time><span><b>${esc(m.user_name || '')}</b> ${esc(cut(m.text, 200))}</span></div>`).join('')}</div>
    ${roNote('Write in the chat from Brigade.')}</div>`;
} };

/* ============ CATERING ============ */
SCREENS.catering = { title: () => 'Catering', c: '--cat', render() {
  if (!need('events', 'recipes')) return `<div class="page">${head("Zeno's Catering", 'Catering')}${waiting('events')}</div>`;
  const t = BD.today(), ev = BD.peek('events'), up = ev.filter(e => e.event_date >= t), past = ev.filter(e => e.event_date < t).reverse();
  const recs = new Set(up.flatMap(e => evRecipes(e).map(r => r.recipe_id)).filter(Boolean));
  return `<div class="page" style="--c:var(--cat)">${head("Zeno's Catering", 'Catering')}
    <section><h2>Coming up</h2><div class="list">${up.map(evRow).join('') || '<div class="row"><span class="main"><div class="meta">No upcoming events in Brigade.</div></span></div>'}</div></section>
    <div class="grid">
      <button class="big" data-a="go" data-s="c-prod">${ICON.fire}<div><div class="lbl">Production</div><div class="val"><b>${recs.size}</b> dishes ahead</div></div></button>
      <button class="big" data-a="go" data-s="c-shop">${ICON.cart}<div><div class="lbl">Shopping</div><div class="val">Ingredients by event</div></div></button>
    </div>
    ${past.length ? `<section><h2>Last 14 days</h2><div class="list">${past.map(evRow).join('')}</div></section>` : ''}
    <p class="note">Events come from Tripleseat through Brigade's sync. Catering profiles and a shopping list do not exist in Brigade yet, so they are not shown.</p>
  </div>`;
} };
SCREENS['c-prod'] = { title: () => 'Production', c: '--cat', render() {
  if (!need('events', 'recipes')) return `<div class="page">${backBtn()}${waiting('events')}</div>`;
  const t = BD.today(), up = BD.peek('events').filter(e => e.event_date >= t);
  return `<div class="page" style="--c:var(--cat)">${backBtn()}${head('Catering', 'Production')}
    ${up.map(e => `<section><h2>${shortDay(e.event_date)} · ${esc(e.name)}</h2><div class="list">${evRecipes(e).map(r => dishRow(r, e)).join('') || '<div class="row"><span class="main"><div class="meta">No dishes linked yet.</div></span></div>'}</div></section>`).join('') || '<p class="note">Nothing coming up.</p>'}</div>`;
} };
SCREENS['c-shop'] = { title: () => 'Shopping', c: '--cat', render() {
  if (!need('events', 'bom', 'ingredients', 'vendors', 'recipes')) return `<div class="page">${backBtn()}${waiting('events', 'bom')}</div>`;
  const t = BD.today(), up = BD.peek('events').filter(e => e.event_date >= t);
  return `<div class="page" style="--c:var(--cat)">${backBtn()}${head('Catering', 'Shopping', 'Ingredients the dishes use. Quantities are not calculated in this read-only version.')}
    ${up.map(e => { const ing = eventIngredients(e); return ing.length ? `<section><h2>${shortDay(e.event_date)} · ${esc(e.name)}</h2><div class="list">${ing.map(ingRow).join('')}</div></section>` : ''; }).join('') || '<p class="note">No linked dishes with components.</p>'}</div>`;
} };
function dishRow(r, e) {
  const fc = num(r.food_cost);
  const inner = `<span class="main"><div class="name">${esc(r.recipe_title || r.name || 'Dish')}</div><div class="meta">${r.portions ? r.portions + ' portions' : ''}${fc !== null ? ' · food cost ' + money(fc) : ''}${r.note ? ' · ' + esc(cut(r.note, 60)) : ''}</div></span>`;
  return r.recipe_id ? `<button class="row" data-a="openRecipe" data-r="${r.recipe_id}" data-from="event:${e.id}">${inner}<span class="chev">›</span></button>` : `<div class="row">${inner}<span class="right wtx">Not linked</span></div>`;
}
function components(recipeId) { return (BD.peek('bom') || []).filter(b => b.parent_recipe_id === recipeId); }
function eventIngredients(e) {
  const seen = {}, out = [];
  const walk = (rid, depth) => components(rid).forEach(b => {
    if (b.component_type === 'RECIPE' && b.sub_recipe_id && depth < 3) walk(b.sub_recipe_id, depth + 1);
    else if (b.item_id && !seen[b.item_id]) { seen[b.item_id] = 1; out.push(b.item_id); }
  });
  evRecipes(e).forEach(r => r.recipe_id && walk(r.recipe_id, 0));
  const ing = byId(BD.peek('ingredients'));
  return out.map(id => ing[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
function ingRow(i) {
  const vs = (BD.peek('vendors') || []).filter(v => v.ingredient_id === i.id && v.active !== false);
  const v = vs[0];
  return `<button class="row" data-a="openIng" data-id="${i.id}"><span class="main"><div class="name">${esc(i.name)}</div><div class="meta">${v ? esc(v.vendor) + (v.pack_description ? ' · ' + esc(v.pack_description) : '') : 'No vendor in Brigade'}</div></span>${vs.some(x => x.do_not_order) ? '<span class="right wtx">Do not order</span>' : ''}<span class="chev">›</span></button>`;
}

/* ---- EVENT (tab) ---- */
SCREENS.event = { title: p => { const e = (BD.peek('events') || []).find(x => x.id === p.id); return e ? e.name : 'Event'; }, c: '--cat', render(p) {
  if (!need('events', 'recipes', 'bom', 'ingredients', 'vendors', 'prep')) return `<div class="page">${backBtn()}${waiting('events', 'bom')}</div>`;
  const e = BD.peek('events').find(x => x.id === p.id);
  if (!e) return `<div class="page">${backBtn()}<p class="note">This event is no longer in the next or last 14 days.</p></div>`;
  const seg = p.seg || 'plan', dishes = evRecipes(e);
  let body = '';
  if (seg === 'plan') body = `${dishes.length ? `<div class="list">${dishes.map(r => dishRow(r, e)).join('')}</div>` : '<p class="note">No dishes linked to this event in Brigade yet.</p>'}
    ${e.notes ? `<section><h2>Notes from Tripleseat</h2><div class="list"><div class="pre">${esc(e.notes)}</div></div></section>` : ''}`;
  else if (seg === 'production') {
    const prep = BD.peek('prep'), rec = byId(BD.peek('recipes'));
    body = dishes.filter(r => r.recipe_id).map(r => {
      const subs = components(r.recipe_id).filter(b => b.component_type === 'RECIPE' && b.sub_recipe_id);
      const ids = [r.recipe_id, ...subs.map(b => b.sub_recipe_id)], pt = prep.filter(x => ids.includes(x.recipe_id));
      return `<section><h2>${esc(r.recipe_title || r.name || '')}</h2><div class="list">
        ${subs.map(b => `<button class="row" data-a="openRecipe" data-r="${b.sub_recipe_id}" data-from="event:${e.id}"><span class="main"><div class="name">${esc((rec[b.sub_recipe_id] || {}).title || 'Sub-recipe')}</div><div class="meta">Component · ${fmt(b.quantity)} ${esc(b.unit || '')}</div></span><span class="chev">›</span></button>`).join('')}
        ${pt.map(x => `<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">Prep · stock ${x.current_stock != null ? fmt(x.current_stock) + ' ' + esc(x.unit || '') : 'not recorded'}</div></span><span class="chev">›</span></button>`).join('')}
        ${!subs.length && !pt.length ? '<div class="row"><span class="main"><div class="meta">No sub-recipes or prep linked.</div></span></div>' : ''}</div></section>`;
    }).join('') || '<p class="note">No linked dishes.</p>';
    body = `<p class="note" style="font-size:14px">Derived from recipe components and prep links in Brigade.</p>` + body;
  } else if (seg === 'shopping') {
    const ing = eventIngredients(e);
    body = ing.length ? `<p class="note" style="font-size:14px">Ingredients the dishes use. Quantities are not calculated in this read-only version.</p><div class="list">${ing.map(ingRow).join('')}</div>` : '<p class="note">No linked dishes with components.</p>';
  } else {
    const costs = dishes.map(r => num(r.food_cost)).filter(x => x !== null), miss = dishes.length - costs.length;
    body = costs.length ? `<div class="grid"><div class="big"><div class="lbl num">${money(costs.reduce((a, b) => a + b, 0))}</div><div class="val">food cost, ${plural(costs.length, 'dish')}</div></div>${e.guest_count ? `<div class="big"><div class="lbl num">${e.guest_count}</div><div class="val">guests</div></div>` : ''}</div>${miss ? `<p class="note"><span class="wtx">${plural(miss, 'dish')} without a food cost</span> on the event card in Brigade.</p>` : ''}` : '<p class="note">No food cost recorded on this event in Brigade.</p>';
  }
  return `<div class="page" style="--c:var(--cat)">${backBtn()}
    <div><div class="eyebrow">${dayName(e.event_date)}${e.event_time ? ' · ' + esc(String(e.event_time).slice(0, 5)) : ''}</div><h1>${esc(e.name)}</h1>
      <div class="sub">${[e.guest_count ? e.guest_count + ' guests' : '', e.room_name || e.location, e.service_style || e.menu_type].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="meta muted" style="margin-top:6px;font-size:15px">${e.tripleseat_id ? 'Tripleseat #' + esc(e.tripleseat_id) : 'Entered in Brigade'}${e.last_synced_at ? ' · synced ' + shortDay(dCDT(e.last_synced_at)) : ''} · <span class="${/prospect|tentative/.test(e.status || '') ? 'wtx' : ''}">${esc(e.status || '')}</span></div></div>
    <div class="seg">${[['plan', 'Plan'], ['production', 'Production'], ['shopping', 'Shopping'], ['cost', 'Cost']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-a="seg" data-k="${k}">${l}</button>`).join('')}</div>
    ${body}</div>`;
} };

/* ============ RECIPE (tab) ============ */
const DET = {};
function det(kind, id) { const k = kind + ':' + id; if (!(k in DET)) { DET[k] = undefined; BD.detail(kind, id).then(v => { DET[k] = v === undefined ? null : v; rerender(); }).catch(() => { DET[k] = null; rerender(); }); } return DET[k]; }
SCREENS.recipe = { title: p => { const r = byId(BD.peek('recipes') || [])[p.id]; return r ? r.title : 'Recipe'; }, c: '--rest', render(p) {
  if (!need('recipes', 'bom', 'ingredients', 'prep', 'events', 'yields')) return `<div class="page">${backBtn()}${waiting('recipes', 'bom', 'yields')}</div>`;
  const rec = byId(BD.peek('recipes')), ing = byId(BD.peek('ingredients')), r = det('recipe', p.id), steps = det('steps', p.id), cost = det('cost', p.id);
  const base = rec[p.id]; if (!base) return `<div class="page">${backBtn()}<p class="note">Recipe not found in Brigade.</p></div>`;
  const x = num(p.x) || 1, comps = components(p.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const line = (name, q, u, link, note) => `<${link ? 'button' : 'div'} class="ing" style="width:100%" ${link || ''}><span>${esc(name)}${note ? `<span class="muted" style="font-size:14px"> · ${esc(note)}</span>` : ''}</span><b class="num">${q != null && num(q) !== null ? fmt(num(q) * x) + ' ' + esc(u || '') : esc(u || '')}</b></${link ? 'button' : 'div'}>`;
  let compHtml;
  if (comps.length) compHtml = comps.map(b => b.component_type === 'RECIPE' && b.sub_recipe_id
    ? line((rec[b.sub_recipe_id] || {}).title || 'Sub-recipe', b.quantity, b.unit, `data-a="openRecipe" data-r="${b.sub_recipe_id}"`, 'recipe')
    : line((ing[b.item_id] || {}).name || 'Ingredient', b.quantity, b.unit, b.item_id ? `data-a="openIng" data-id="${b.item_id}"` : '', b.notes)).join('');
  else if (r && Array.isArray(r.ingredients) && r.ingredients.length) compHtml = r.ingredients.map(i => typeof i === 'object' && i
    ? line(i.name || 'Item', i.qty, i.unit, i.sub_recipe_id ? `data-a="openRecipe" data-r="${i.sub_recipe_id}"` : i.ingredient_id ? `data-a="openIng" data-id="${i.ingredient_id}"` : '', i.comment)
    : line(String(i), null, '')).join('');
  const usedIn = (BD.peek('bom') || []).filter(b => b.sub_recipe_id === p.id).map(b => rec[b.parent_recipe_id]).filter(Boolean);
  const preps = BD.peek('prep').filter(t => t.recipe_id === p.id);
  const evs = (BD.peek('events') || []).filter(e => e.event_date >= BD.today() && evRecipes(e).some(d => d.recipe_id === p.id));
  const stepsHtml = steps && steps.length ? steps.map(s => `<div class="step"><span class="n">${s.step_number}</span><span>${s.title ? `<b>${esc(s.title)}</b><br>` : ''}${esc(s.instruction_en || '')}${s.timer_seconds ? `<br><span class="muted" style="font-size:15px">Timer ${Math.round(s.timer_seconds / 60)} min</span>` : ''}</span></div>`).join('')
    : r && (r.procedure_en || r.procedure) ? `<div class="pre">${esc(r.procedure_en || r.procedure)}</div>` : r === undefined || steps === undefined ? '<div class="skel">Loading…</div>' : '<div class="row"><span class="main"><div class="meta">No procedure in Brigade.</div></span></div>';
  const fc = num(base.food_cost_pct), c = num(cost);
  const fix = p.focus && BD.peek('office') && BD.peek('invwarn') && BD.peek('attention') ? triage().decisions.find(d => d.rid === p.id && d.focus === p.focus) : null;
  const hlY = fix && fix.focus === 'yield' ? 'hl' : '', hlB = fix && fix.focus === 'bom' ? 'hl' : '';
  return `<div class="page" style="--c:var(--rest)">${backBtn()}
    <div><div class="eyebrow">${esc(cat(base.category))}${base.prep_time_minutes ? ' · ' + base.prep_time_minutes + ' min' : ''}</div><h1>${esc(base.title)}</h1></div>
    ${fix ? `<div class="fixbox ${fix.sev}"><div class="h">To fix: ${esc(fix.title)}</div><div>${esc(fix.why)}</div>${fix.now ? `<div><b>Now:</b> ${esc(fix.now)}</div>` : ''}<div><b>Missing:</b> ${esc(fix.missing)}</div><div>${brigadeBtn('Fix in Brigade')}</div></div>` : ''}
    <div class="facts ${hlY}">${(() => { const cy = yieldsMap()[p.id] || {};
      return !cy.has_yield ? '<span class="wtx">No yield</span>'
        : (num(cy.portions) > 0 ? `<span>Makes <b>${plural(Math.round(num(cy.portions) * 100) / 100, 'portion')}</b>${cy.portions_source && cy.portions_source !== 'base_servings' ? ' <span class="muted">(calculated)</span>' : ''}</span>` : '')
        + (num(cy.yield_qty) > 0 ? `<span>Batch <b>${fmt(num(cy.yield_qty) / 1000)} ${cy.yield_dim === 'volume' ? 'L' : 'kg'}</b></span>` : '')
        + (cy.conflict ? '<span class="wtx">Yield note disagrees</span>' : ''); })()}${base.shelf_life_days ? `<span>Shelf life <b>${base.shelf_life_days} d</b></span>` : ''}${base.selling_price ? `<span>Price <b>${money(base.selling_price)}</b></span>` : ''}${fc !== null ? `<span>Food cost <b>${fmt(fc)}%</b></span>` : ''}${c !== null ? `<span>Recipe cost <b>${money(c)}</b></span>` : ''}</div>
    ${base.yield_text && base.yield_text.trim() ? `<p class="note" style="font-size:15px"><b>Note:</b> ${esc(base.yield_text.trim().replace(/\s+/g, ' '))}</p>` : ''}
    ${evs.length ? `<div class="list">${evs.map(evRow).join('')}</div>` : ''}
    <section class="${hlB}"><div class="chap"><h2>Components</h2><span>${comps.length ? comps.length : ''}</span></div>
      <div class="qbtns" style="margin-bottom:10px">${[0.5, 1, 2, 3].map(k => `<button class="${k === x ? 'on' : ''}" data-a="scale" data-x="${k}">×${k}</button>`).join('')}</div>
      <div class="list">${compHtml || (r === undefined ? '<div class="skel">Loading…</div>' : '<div class="row"><span class="main"><div class="meta">No components in Brigade.</div></span></div>')}</div>
      ${x !== 1 ? '<p class="note" style="font-size:14px">Scaled on this screen only. The recipe in Brigade is unchanged.</p>' : ''}</section>
    <section><h2>Method</h2><div class="list">${stepsHtml}</div></section>
    ${r && r.equipment ? `<section><h2>Equipment</h2><div class="list"><div class="pre">${esc(r.equipment)}</div></div></section>` : ''}
    ${preps.length ? `<section><h2>Prep</h2><div class="list">${preps.map(t => `<button class="row" data-a="openPrep" data-id="${t.id}"><span class="main"><div class="name">${esc(t.name)}</div><div class="meta">Stock ${t.current_stock != null ? fmt(t.current_stock) + ' ' + esc(t.unit || '') : 'not recorded'}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
    ${usedIn.length ? `<section><h2>Used in</h2><div class="list">${usedIn.map(u => `<button class="row" data-a="openRecipe" data-r="${u.id}"><span class="main"><div class="name">${esc(u.title)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
    ${roNote('Edit recipes in Brigade.')}
  </div>`;
} };

/* ============ INGREDIENT (tab) ============ */
SCREENS.ing = { title: p => { const i = byId(BD.peek('ingredients') || [])[p.id]; return i ? i.name : 'Ingredient'; }, c: '--rest', render(p) {
  if (!need('ingredients', 'vendors', 'bom', 'recipes', 'prep')) return `<div class="page">${backBtn()}${waiting('ingredients', 'vendors')}</div>`;
  const i = byId(BD.peek('ingredients'))[p.id]; if (!i) return `<div class="page">${backBtn()}<p class="note">Ingredient not found in Brigade.</p></div>`;
  const vs = BD.peek('vendors').filter(v => v.ingredient_id === p.id), rec = byId(BD.peek('recipes'));
  const used = [...new Set(BD.peek('bom').filter(b => b.item_id === p.id).map(b => b.parent_recipe_id))].map(id => rec[id]).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
  const preps = BD.peek('prep').filter(t => t.ingredient_id === p.id);
  return `<div class="page" style="--c:var(--rest)">${backBtn()}
    ${head('Ingredient · ' + esc(cat(i.category)), esc(i.name), i.name_it ? esc(i.name_it) : '')}
    <div class="facts">${i.base_unit ? `<span>Base unit <b>${esc(i.base_unit)}</b></span>` : ''}${i.measure_type ? `<span>Measured by <b>${esc(i.measure_type)}</b></span>` : ''}${i.avg_unit_weight_g ? `<span>Each ≈ <b>${fmt(i.avg_unit_weight_g)} g</b></span>` : ''}${i.yield_factor ? `<span>Yield <b>${fmt(i.yield_factor)}</b></span>` : ''}${i.active === false ? '<span class="wtx">Inactive</span>' : ''}</div>
    ${i.notes ? `<p class="note">${esc(i.notes)}</p>` : ''}
    <section><h2>Vendors and prices</h2><div class="list">${vs.map(v => `<div class="row"><span class="main"><div class="name">${esc(v.vendor)}${v.vendor_sku ? ` <span class="muted" style="font-size:14px">#${esc(v.vendor_sku)}</span>` : ''}</div><div class="meta">${esc(v.pack_description || v.purchase_unit || '')}${v.last_invoice_date ? ' · last invoice ' + shortDay(v.last_invoice_date) : ''}${v.price_per_100g ? ' · ' + money(v.price_per_100g) + '/100 g' : ''}${v.price_per_each ? ' · ' + money(v.price_per_each) + ' each' : ''}</div>${v.do_not_order ? `<div class="meta wtx">Do not order${v.do_not_order_reason ? ': ' + esc(v.do_not_order_reason) : ''}</div>` : ''}</span><span class="qty num" style="font-size:20px">${money(v.unit_price)}</span></div>`).join('') || '<div class="row"><span class="main"><div class="meta">No vendor in Brigade.</div></span></div>'}</div></section>
    ${used.length ? `<section><div class="chap"><h2>Used in</h2><span>${used.length}</span></div><div class="list">${used.map(r => `<button class="row" data-a="openRecipe" data-r="${r.id}"><span class="main"><div class="name">${esc(r.title)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
    ${preps.length ? `<section><h2>Prep</h2><div class="list">${preps.map(t => `<button class="row" data-a="openPrep" data-id="${t.id}"><span class="main"><div class="name">${esc(t.name)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
    ${roNote('Edit ingredients and prices in Brigade.')}
  </div>`;
} };

/* ============ PREP (tab) ============ */
SCREENS.prep = { title: p => { const t = byId(BD.peek('prep') || [])[p.id]; return t ? t.name : 'Prep'; }, c: '--rest', render(p) {
  if (!need('prep', 'sugg', 'prepclass', 'counts', 'preplog', 'recipes')) return `<div class="page">${backBtn()}${waiting('prep', 'sugg')}</div>`;
  const t = byId(BD.peek('prep'))[p.id]; if (!t) return `<div class="page">${backBtn()}<p class="note">Prep not found or archived.</p></div>`;
  const r = suggMap()[t.id], cl = byId(BD.peek('prepclass'), 'prep_task_id')[t.id], rec = t.recipe_id && byId(BD.peek('recipes'))[t.recipe_id];
  const counts = BD.peek('counts').filter(c => c.prep_task_id === t.id).slice(0, 5), made = BD.peek('preplog').filter(l => l.prep_task_id === t.id).slice(0, 5);
  return `<div class="page" style="--c:var(--rest)">${backBtn()}
    ${head(esc((cl && cl.canonical_station) || t.category || 'Prep'), esc(t.name))}
    ${r ? `<div class="list"><div class="row"><span class="main"><div class="eyebrow">Plan · ${esc(BD.peek('sugg').date)}</div><div class="name">${SUGG_LABEL[r.status] || esc(r.status)}${r.planned_output != null ? ' · ' + fmt(r.planned_output) + ' ' + esc(r.output_unit || t.unit || '') : ''}</div>${r.reason ? `<div class="meta">${esc(reasonEN(r.reason))}</div>` : ''}<div class="meta">${[r.current_stock != null ? 'Stock ' + fmt(r.current_stock) + ' ' + esc(r.stock_unit || '') : '', r.forecast != null ? 'Forecast ' + fmt(r.forecast) : '', r.coverage_days != null ? 'Covers ' + fmt(r.coverage_days) + ' d' : '', r.confidence ? 'Confidence ' + esc(r.confidence) : ''].filter(Boolean).join(' · ')}</div></span></div></div>` : '<p class="note">Not in today\'s prep plan.</p>'}
    <div class="facts"><span>Stock <b>${t.current_stock != null ? fmt(t.current_stock) + ' ' + esc(t.unit || '') : 'not recorded'}</b></span>${t.container ? `<span>Container <b>${esc(t.container)}</b></span>` : ''}${t.min_cover_days ? `<span>Cover <b>${t.min_cover_days} d</b></span>` : ''}${cl && cl.production_family ? `<span>Family <b>${esc(cl.production_family.replace(/_/g, ' '))}</b></span>` : ''}</div>
    ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
    ${rec ? `<div class="list"><button class="row" data-a="openRecipe" data-r="${rec.id}"><span class="main"><div class="name">${esc(rec.title)}</div><div class="meta">Recipe</div></span><span class="chev">›</span></button></div>` : ''}
    ${counts.length ? `<section><h2>Counts · last 7 days</h2><div class="feed">${counts.map(c => `<div><time>${shortDay(dCDT(c.counted_at)).split(',')[0]}</time><span>${fmt(c.counted_qty)} ${esc(c.unit || '')} · ${esc(c.counted_by || '')}</span></div>`).join('')}</div></section>` : ''}
    ${made.length ? `<section><h2>Made · last 2 days</h2><div class="feed">${made.map(l => `<div><time>${tFmt(l.created_at)}</time><span>${fmt(l.qty)} ${esc(l.unit || '')} · ${esc(l.user_name || '')}</span></div>`).join('')}</div></section>` : ''}
    ${roNote('Record production and counts in Brigade.')}
  </div>`;
} };

/* ============ PLANNER ============ */
SCREENS.planner = { title: () => 'Planner', c: '--plan', render() {
  if (!need('events', 'shifts', 'sugg', 'prep')) return `<div class="page">${head('Next 14 days', 'Planner')}${waiting('events', 'shifts')}</div>`;
  const t = BD.today(), days = [...Array(14)].map((_, i) => BD.addDays(t, i));
  const ev = groupBy(BD.peek('events'), e => e.event_date), sh = groupBy(BD.peek('shifts'), s => s.date);
  const defer = BD.peek('sugg').rows.filter(r => r.status === 'defer_to_tomorrow').length;
  return `<div class="page" style="--c:var(--plan)">${head('Next 14 days', 'Planner')}
    <div class="week">${days.map((d, i) => { const e = ev[d] || [], s = sh[d] || [];
      const parts = [s.length ? plural(s.length, 'shift') : '', i === 0 ? 'prep plan ready' : i === 1 && defer ? `${defer} prep moved here` : ''].filter(Boolean);
      return `<button class="day ${i === 0 ? 'today' : ''}" data-a="go" data-s="day" data-d="${d}"><div class="d"><div class="dn">${dayName(d, { weekday: 'short' })}</div><div class="dd num">${+d.slice(8)}</div></div>
        <div class="body">${e.map(x => `<div class="ev">${esc(x.name)}${x.guest_count ? ' · ' + x.guest_count : ''}</div>`).join('')}<div class="sum">${parts.join(' · ') || ' '}</div></div><span class="chev" style="align-self:center">›</span></button>`; }).join('')}</div>
    <p class="note">Brigade plans prep one day ahead, so later days show events and shifts only.</p>
  </div>`;
} };
SCREENS.day = { title: p => shortDay(p.d), c: '--plan', render(p) {
  if (!need('events', 'shifts', 'sugg', 'prep')) return `<div class="page">${backBtn()}${waiting('events')}</div>`;
  const t = BD.today(), d = p.d, ev = BD.peek('events').filter(e => e.event_date === d), sh = BD.peek('shifts').filter(s => s.date === d);
  const prep = byId(BD.peek('prep')), defer = d === BD.addDays(t, 1) ? BD.peek('sugg').rows.filter(r => r.status === 'defer_to_tomorrow' && prep[r.prep_task_id]) : [];
  return `<div class="page" style="--c:var(--plan)">${backBtn()}
    <div><div class="eyebrow">${d === t ? 'Today' : ''}</div><h1 style="font-size:40px">${dayName(d)}</h1></div>
    ${ev.length ? `<section><h2>Events</h2><div class="list">${ev.map(evRow).join('')}</div></section>` : ''}
    ${d === t ? `<div class="list"><button class="row" data-a="world" data-w="today"><span class="main"><div class="name">Today's prep plan</div><div class="meta">Open in Today</div></span><span class="chev">›</span></button></div>` : ''}
    ${defer.length ? `<section><h2>Moved to this day</h2><div class="list">${defer.map(r => `<button class="row" data-a="openPrep" data-id="${r.prep_task_id}"><span class="main"><div class="name">${esc(prep[r.prep_task_id].name)}</div><div class="meta">${esc(cut(reasonEN(r.reason), 80))}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
    <section><h2>On shift</h2><div class="list">${sh.map(s => `<div class="row"><span class="main"><div class="name">${esc(s.employee_name)}</div><div class="meta">${esc(s.role_name || s.department_name || '')}</div></span><span class="right muted">${esc(s.start_label || '')}–${esc(s.end_label || '')}</span></div>`).join('') || '<div class="row"><span class="main"><div class="meta">No shifts synced from 7shifts for this day.</div></span></div>'}</div></section>
  </div>`;
} };

/* ============ RENDER ============ */
function renderTabs() {
  const el = $('tabs'); el.hidden = !S.tabs.length;
  el.innerHTML = S.tabs.map(t => { const e = t.stack[0], c = SCREENS[e.s].c;
    return `<div class="tab ${S.active === t.id ? 'on' : ''}" style="--c:var(${c})"><button style="display:flex;align-items:center;gap:8px;min-width:0;height:100%" data-a="tab" data-id="${t.id}"><span class="dot" style="background:var(${c})"></span><span class="t">${esc(titleOf(e))}</span></button><button class="x" data-a="close" data-id="${t.id}" aria-label="Close">×</button></div>`; }).join('');
  const on = el.querySelector('.tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
function renderWorlds() {
  const b = ([k, w]) => `<button class="w ${S.active === 'home' && S.world === k ? 'on' : ''}" style="--c:var(${w.c})" data-a="world" data-w="${k}">${ICON[k]}${w.label}</button>`;
  const e = Object.entries(WORLDS);
  $('worlds').innerHTML = b(e[0]) + b(e[1]) + `<button class="w ask" data-a="ask" aria-label="Find"><span class="orb">${ICON.ask}</span>Find</button>` + b(e[2]) + b(e[3]);
}
function renderLive() {
  const el = $('live'); if (!el) return;
  if (!BD.connected) { el.className = 'live stale'; el.lastChild.textContent = 'Not connected'; return; }
  const at = BD.oldest(), err = BD.anyError();
  el.className = 'live' + (err ? ' stale' : '');
  el.lastChild.textContent = !isFinite(at) ? 'Connecting…' : (err ? 'Offline · data from ' : 'Live · ') + tFmt(new Date(at).toISOString()) + ' ↻';
}
function layout() { $('main').style.top = $('top').offsetHeight + 'px'; $('main').style.bottom = $('worlds').offsetHeight + 'px'; }
function render(keep) {
  const e = cur(), sc = SCREENS[e.s] || SCREENS.today;
  const y = $('main').scrollTop, active = document.activeElement && document.activeElement.id;
  let html; try { html = sc.render(e.p || {}); } catch (x) { console.error(x); html = `<div class="page">${backBtn()}<div class="err">This screen could not show the data: ${esc(x.message)}</div></div>`; }
  $('main').innerHTML = html;
  renderTabs(); renderWorlds(); renderLive(); layout();
  $('main').scrollTop = keep ? y : (e.y || 0);
  if (sc.after) sc.after(e.p || {}, active);
  save();
}
let rt; function rerender() { clearTimeout(rt); rt = setTimeout(() => render(true), 60); }
window.addEventListener('brigade-data', rerender);
let scT; $('main').addEventListener('scroll', () => { clearTimeout(scT); scT = setTimeout(() => { cur().y = $('main').scrollTop; save(); }, 150); });
const remember = () => { cur().y = $('main').scrollTop; };
function searchBind(p, active) {
  const i = $('q'); if (!i) return;
  if (active === 'q') { i.focus(); const v = i.value; i.setSelectionRange(v.length, v.length); }
  let t; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { cur().p.q = i.value; render(true); }, 220); });
}
/* stale data is refreshed whenever the app comes back to the screen */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  Object.keys(BD.store).forEach(n => { const s = BD.store[n]; if (s.at && Date.now() - s.at > 5 * 60 * 1000) BD.load(n, true).catch(() => {}); });
});
setInterval(renderLive, 30000);

/* ============ ACTIONS (navigation only — nothing writes to Brigade) ============ */
function goOrigin(t) { const o = t && t.origin; if (o && o.tab && tabById(o.tab)) S.active = o.tab; else { S.active = 'home'; if (o && o.w) S.world = o.w; } }
function openTab(kind, ref, entry) {
  remember();
  const origin = S.active === 'home' ? { w: S.world, label: titleOf(cur()) } : { tab: S.active, label: titleOf(tabById(S.active).stack[0]) };
  let t = S.tabs.find(x => x.kind === kind && x.ref === ref);
  if (t && t.id !== S.active) { t.origin = origin; t.stack.length = 1; Object.assign(t.stack[0].p, { focus: entry.p.focus || '' }); t.stack[0].y = 0; }
  if (!t) { t = { id: 't' + (S.seq++), kind, ref, stack: [entry], origin }; S.tabs.push(t); if (S.tabs.length > 8) S.tabs.shift(); }
  S.active = t.id; closeSheet(); render();
}
function sheet(html) { $('sheet').innerHTML = `<div class="grab"></div>${html}`; $('sheet').hidden = false; $('scrim').hidden = false; }
function closeSheet() { $('sheet').hidden = true; $('scrim').hidden = true; }
$('scrim').onclick = closeSheet;
function findResults(q) {
  q = q.trim().toLowerCase(); if (q.length < 2) return '<p class="note">Type at least 2 letters.</p>';
  const hit = (s) => String(s || '').toLowerCase().includes(q), out = [];
  (BD.peek('prep') || []).filter(x => hit(x.name)).slice(0, 6).forEach(x => out.push(`<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">Prep</div></span><span class="chev">›</span></button>`));
  (BD.peek('recipes') || []).filter(x => hit(x.title) || hit(x.pos_name)).slice(0, 8).forEach(x => out.push(`<button class="row" data-a="openRecipe" data-r="${x.id}"><span class="main"><div class="name">${esc(x.title)}</div><div class="meta">Recipe · ${esc(cat(x.category))}</div></span><span class="chev">›</span></button>`));
  (BD.peek('ingredients') || []).filter(x => hit(x.name) || hit(x.name_it)).slice(0, 8).forEach(x => out.push(`<button class="row" data-a="openIng" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">Ingredient</div></span><span class="chev">›</span></button>`));
  (BD.peek('events') || []).filter(x => hit(x.name)).slice(0, 5).forEach(x => out.push(`<button class="row" data-a="openEvent" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">Event · ${shortDay(x.event_date)}</div></span><span class="chev">›</span></button>`));
  return out.length ? `<div class="list">${out.join('')}</div>` : `<p class="note">Nothing found for “${esc(q)}”.</p>`;
}
const A = {
  world(el) { remember(); const w = el.dataset.w; closeSheet();
    if (S.active === 'home' && S.world === w) { S.ws[w].length = 1; S.ws[w][0].y = 0; }
    S.world = w; S.active = 'home'; render(); },
  tab(el) { remember(); S.active = el.dataset.id; closeSheet(); render(); },
  close(el) { const id = el.dataset.id, i = S.tabs.findIndex(t => t.id === id), t = S.tabs[i]; S.tabs.splice(i, 1); if (S.active === id) goOrigin(t); render(); },
  toOrigin() { remember(); goOrigin(tabById(S.active)); render(); },
  go(el) { remember(); const p = {}; ['scope', 'd'].forEach(k => { if (el.dataset[k] !== undefined) p[k] = el.dataset[k]; }); stack().push({ s: el.dataset.s, p }); render(); },
  back() { const s = stack(); if (s.length > 1) { s.pop(); render(); } },
  openEvent(el) { openTab('event', el.dataset.id, { s: 'event', p: { id: el.dataset.id } }); },
  openRecipe(el) { openTab('recipe', el.dataset.r, { s: 'recipe', p: { id: el.dataset.r, from: el.dataset.from || '', focus: el.dataset.focus || '' } }); },
  openIng(el) { openTab('ing', el.dataset.id, { s: 'ing', p: { id: el.dataset.id } }); },
  openPrep(el) { openTab('prep', el.dataset.id, { s: 'prep', p: { id: +el.dataset.id } }); },
  seg(el) { cur().p.seg = el.dataset.k; render(true); },
  scale(el) { cur().p.x = +el.dataset.x; render(true); },
  more(el) { cur().p[el.dataset.k] = 1; render(true); },
  refresh() { Object.keys(BD.store).forEach(n => BD.load(n, true).catch(() => {})); Object.keys(DET).forEach(k => delete DET[k]); renderLive(); },
  ask() {
    ['recipes', 'ingredients', 'prep', 'events'].forEach(n => need(n));
    sheet(`<div class="page"><h1 style="font-size:28px">Find</h1>
      <input id="ask" class="search" type="search" placeholder="Recipe, ingredient, prep, event" autocomplete="off" enterkeyhint="search">
      <div id="askout"></div>
      <p class="note" style="font-size:14px">Read-only version: recording production, counts and messages stays in Brigade for now.</p>
      <div class="list"><button class="row" data-a="resetUi"><span class="main"><div class="name">Reset this app's layout</div><div class="meta">Closes tabs and returns to Today. Brigade data is not touched.</div></span></button></div></div>`);
    const i = $('ask'); let t; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { $('askout').innerHTML = findResults(i.value); }, 200); }); i.focus();
  },
  resetUi() { S = fresh(); closeSheet(); render(); },
};
document.addEventListener('click', ev => { const el = ev.target.closest('[data-a]'); if (!el) return; const f = A[el.dataset.a]; if (f) { ev.preventDefault(); f(el); } });
window.addEventListener('resize', layout);
if (!SCREENS[cur().s]) S = fresh();
render();
})();
