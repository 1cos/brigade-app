/* Brigade app R1 — reserved to Max + Pablo.
   UI = V020-B Clean Pass (frozen base, tag base-v020b-frozen-2026-10-03): worlds at the bottom,
   open things as tabs, back always names where it goes, closing a tab returns where it was opened from.
   Same components for Chef and staff: content and permissions differ, the visual language does not. */
(function () {
const API = window.AppApi;

/* ============ ICONS (from V020-B) ============ */
const sv = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  today: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  restaurant: sv('<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2.5 1-4 4-4 8h4"/>'),
  catering: sv('<path d="M3 17h18M4 17a8 8 0 0 1 16 0M12 9V7M10 7h4M2 20h20"/>'),
  planner: sv('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/>'),
  ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
};
const WORLDS = { today: { label: 'My Shift', c: '--today' }, restaurant: { label: 'Recipes', c: '--rest' }, catering: { label: 'Catering', c: '--cat' }, planner: { label: 'Planner', c: '--plan' } };

/* ============ HELPERS ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const fmt = v => { const n = num(v); if (n === null) return ''; return (Math.round(n * 100) / 100).toString(); };
const money = v => { const n = num(v); return n === null ? '' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const cat = c => { const x = String(c || 'Other').split('|')[0].trim(); return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : 'Other'; };
const tFmt = iso => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';
const dayName = (d, opt = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, opt));
const shortDay = d => dayName(d, { weekday: 'short', day: 'numeric', month: 'short' });
const hourCDT = () => +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()) % 24;
const PLAN = { do_first: 'Do first', prep_today: 'Prep today', count_first: 'Count first' };
const qtyU = (q, u) => q == null ? '' : `${fmt(q)} ${esc(u || '')}`;

/* ============ SESSION ============ */
let ME = null;                                   // {id,name,station,role} — always from the server
const isChef = () => ME && ME.role === 'chef';

/* ============ UI STATE (per user, per device) ============ */
const uiKey = () => 'brigade-app-ui:' + (ME ? ME.id : 'none');
const fresh = () => ({ v: 1, world: 'today', active: 'home', ws: { today: [{ s: 'today' }], restaurant: [{ s: 'restaurant' }], catering: [{ s: 'catering' }], planner: [{ s: 'planner' }] }, tabs: [], seq: 1 });
let S = fresh();
const loadUi = () => { S = fresh(); try { const x = JSON.parse(localStorage.getItem(uiKey())); if (x && x.v === 1) S = x; } catch (e) {} };
const save = () => { if (!ME) return; try { localStorage.setItem(uiKey(), JSON.stringify(S)); } catch (e) {} };
function wipeLocal() {                           // sign-out: nothing of the previous person stays on the phone
  try { Object.keys(localStorage).filter(k => k.startsWith('brigade-app-ui:')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  S = fresh(); DRAFT = {}; API.forget();
}
let DRAFT = {};                                  // unsent text in sheets, memory only

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

/* data gate: returns the data when in memory; otherwise starts loading and returns undefined */
function need(op, body, ttl) {
  const d = API.peek(op, body);
  API.get(op, body, ttl).catch(e => { ERR[op] = e; });
  return d;
}
const ERR = {};
function waiting(op) {
  const e = ERR[op];
  if (e && e.status !== 401) return `<div class="err"><b>Brigade did not answer.</b><br>${e.code === 'offline' ? 'No connection.' : esc(e.code)}<br><button class="lnk" data-a="refresh">Try again</button></div>`;
  return `<div class="skel">Loading…</div>`;
}
const testNote = () => `<p class="note" style="font-size:14px">Test mode: Start, Done, counts, reports and messages are saved in this app only. They do not change Brigade's prep, stock or costs, and nobody else is notified.</p>`;

/* ============ MY SHIFT (Today world) ============ */
const shiftData = () => need('shift', null, 30000);
function prepRow(i) {
  const a = i.app || {};
  const st = a.done ? `<span class="pill ok">Done · ${qtyU(a.done.qty, a.done.unit)}</span>`
    : a.started ? `<span class="pill">Started ${tFmt(a.started.at)}${a.started.by && a.started.by !== ME.name ? ' · ' + esc(a.started.by) : ''}</span>`
    : a.count ? `<span class="pill">Counted ${qtyU(a.count.qty, a.count.unit)}</span>` : '';
  return `<button class="row ${a.done ? 'donebg' : ''}" data-a="openPrep" data-id="${i.id}"><span class="main">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><span class="name">${esc(i.name)}</span>${i.qty != null && i.plan !== 'count_first' ? `<span class="qty num">${fmt(i.qty)} <small style="font-size:16px">${esc(i.qty_unit || '')}</small></span>` : ''}</div>
    <div class="meta">${isChef() ? esc(i.station || '') + ' · ' : ''}${i.plan === 'count_first' ? 'Count what is there' : esc(cut(i.reason, 70))}</div>${st ? `<div style="margin-top:6px">${st}</div>` : ''}</span></button>`;
}
SCREENS.today = { title: () => 'My Shift', c: '--today', render() {
  const h = hourCDT(), first = ME.name.split(' ')[0];
  const greet = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${esc(first)}.`;
  const d = shiftData();
  const top = `<div class="greet"><div class="eyebrow">${d ? dayName(d.today) : ''}${ME.station && !isChef() ? ' · ' + esc(ME.station) : ''}</div><h1>${greet}</h1>`;
  if (!d) return `<div class="page">${top}</div>${waiting('shift')}</div>`;
  const seg = isChef() ? (cur().p || {}).st || 'all' : 'mine';
  const items = d.items.filter(i => seg === 'all' || seg === 'mine' || i.station === seg);
  const open = items.filter(i => !(i.app && i.app.done) && i.plan !== 'count_first');
  const unread = d.messages.filter(m => !m.read);
  const brief = d.plan_date && d.plan_date !== d.today ? `Today's prep plan is not out yet. This is the plan of <b>${shortDay(d.plan_date)}</b>. ` : '';
  const next = open.length ? `Start with <b>${esc(open[0].name)}</b>. ${plural(open.length, 'prep')} to make.` : items.length ? 'Your prep is done for now.' : 'Nothing in the plan for your station.';
  const sec = (k) => { const l = items.filter(i => i.plan === k); return l.length ? `<section><div class="chap"><h2>${PLAN[k]}</h2><span>${l.length}</span></div><div class="list">${l.map(prepRow).join('')}</div></section>` : ''; };
  const stations = isChef() ? [...new Set(d.items.map(i => i.station))].sort() : [];
  const msgs = d.messages.slice(0, 6);
  const msgHtml = msgs.map(m => `<button class="msg ${m.read ? '' : 'unread'}" data-a="readMsg" data-id="${m.id}">${m.read ? '' : '<span class="dotw" style="margin-top:6px"></span>'}<span class="main"><div class="who">${esc(m.from)}${isChef() ? ' → ' + (m.to === 'all' ? 'everyone' : esc(m.to)) : m.to === 'all' ? ' · to everyone' : ' · to you'} · ${tFmt(m.at)}</div><div class="txt">${esc(m.text)}</div></span></button>`).join('');
  const reports = isChef() ? d.reports || [] : [];
  const repUnread = reports.filter(r => !r.read);
  return `<div class="page" style="--c:var(--today)">
    ${top}<p class="brief">${brief}${next}</p></div>
    ${isChef() ? `<div class="acts"><button class="btn" data-a="compose">Message the team</button></div>` : ''}
    ${msgs.length ? `<section><div class="chap"><h2>${isChef() ? 'Your messages' : 'From Chef'}</h2><span>${unread.length ? unread.length + ' new' : ''}</span></div><div class="list">${msgHtml}</div></section>` : ''}
    ${isChef() ? `<section><div class="chap"><h2>Problems reported</h2><span>${repUnread.length ? repUnread.length + ' new' : ''}</span></div><div class="list">${reports.slice(0, 8).map(r => `<button class="msg ${r.read ? '' : 'unread'}" data-a="readReport" data-id="${r.id}">${r.read ? '' : '<span class="dotw" style="margin-top:6px"></span>'}<span class="main"><div class="who">${esc(r.from)} · ${tFmt(r.at)}${r.prep ? ' · ' + esc(r.prep) : ''}</div><div class="txt">${esc(r.text)}</div></span></button>`).join('') || '<div class="row"><span class="main"><div class="meta">No problems reported.</div></span></div>'}</div></section>` : ''}
    ${stations.length ? `<div class="seg">${['all', ...stations].map(s => `<button class="${s === seg ? 'on' : ''}" data-a="station" data-k="${esc(s)}">${s === 'all' ? 'All' : esc(s.replace(/ Station$/, ''))}</button>`).join('')}</div>` : ''}
    ${sec('do_first')}${sec('prep_today')}${sec('count_first')}
    ${!items.length ? '<p class="note">No prep in the plan for this station.</p>' : ''}
    ${d.done_today.length ? `<section><h2>Done today</h2><div class="feed">${d.done_today.map(x => `<div><time>${tFmt(x.at)}</time><span>${isChef() ? esc(x.by) + ' · ' : ''}${esc(x.name)} · ${qtyU(x.qty, x.unit)}</span></div>`).join('')}</div></section>` : ''}
    <div class="list"><button class="row" data-a="report"><span class="main"><div class="name">Report a problem</div><div class="meta">Goes straight to Chef, with your name.</div></span><span class="chev">›</span></button></div>
    ${!isChef() && d.my_reports && d.my_reports.length ? `<section><h2>You reported</h2><div class="feed">${d.my_reports.slice(0, 5).map(r => `<div><time>${tFmt(r.at)}</time><span>${esc(cut(r.text, 90))}</span></div>`).join('')}</div></section>` : ''}
    ${testNote()}
  </div>`;
} };

/* ============ PREP (tab) ============ */
SCREENS.prep = { title: p => { const d = API.peek('prep', { id: p.id }); return d ? d.prep.name : (p.name || 'Prep'); }, c: '--today', render(p) {
  const d = need('prep', { id: p.id }, 20000); need('shift', null, 30000);   // shift carries today's Start/Done/Count status
  if (!d) return `<div class="page">${backBtn()}${waiting('prep')}</div>`;
  const t = d.prep, a = statusOf(t.id);
  return `<div class="page" style="--c:var(--today)">${backBtn()}
    ${head(esc(t.category || 'Prep'), esc(t.name))}
    ${d.plan ? `<div class="list"><div class="row"><span class="main"><div class="eyebrow">Plan · ${d.plan_date ? shortDay(d.plan_date) : ''}</div><div class="name">${PLAN[d.plan.status] || esc(d.plan.status)}${d.plan.qty != null && d.plan.status !== 'count_first' ? ' · ' + qtyU(d.plan.qty, d.plan.unit) : ''}</div>${d.plan.reason ? `<div class="meta">${esc(d.plan.reason)}</div>` : ''}</span></div></div>` : '<p class="note">Not in the prep plan today.</p>'}
    <div class="facts"><span>Brigade stock <b>${t.current_stock != null ? qtyU(t.current_stock, t.unit) : 'not recorded'}</b></span>${t.container ? `<span>Container <b>${esc(t.container)}</b></span>` : ''}</div>
    ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
    ${actButtons(t.id, a)}
    ${d.recipe ? `<div class="list"><button class="row" data-a="openRecipe" data-r="${d.recipe.id}" data-prep="${t.id}"><span class="main"><div class="name">${esc(d.recipe.title)}</div><div class="meta">Recipe · quantities and method</div></span><span class="chev">›</span></button></div>` : ''}
    ${d.history.length ? `<section><h2>Last 2 days</h2><div class="feed">${d.history.map(h => `<div><time>${tFmt(h.at)}</time><span>${esc(h.by)} · ${h.kind === 'prep_done' ? 'made ' + qtyU(h.qty, h.unit) : h.kind === 'count' ? 'counted ' + qtyU(h.qty, h.unit) : 'started'}</span></div>`).join('')}</div></section>` : ''}
    <div class="list"><button class="row" data-a="report" data-prep="${t.id}"><span class="main"><div class="name">Report a problem with this prep</div></span><span class="chev">›</span></button></div>
    ${testNote()}
  </div>`;
} };
function statusOf(id) { const d = API.peek('shift'); const i = d && d.items.find(x => x.id === id); return (i && i.app) || {}; }
function actButtons(id, a) {
  const started = a.started && !a.done;
  return `<div class="acts">
    ${started ? `<button class="btn ghost" disabled>Started ${tFmt(a.started.at)}</button>` : `<button class="btn ghost" data-a="start" data-id="${id}">Start</button>`}
    <button class="btn ok" data-a="done" data-id="${id}">Done</button>
    <button class="btn ghost" data-a="count" data-id="${id}">Count</button></div>
    ${a.done ? `<p class="note" style="font-size:15px">Done at ${tFmt(a.done.at)} · ${qtyU(a.done.qty, a.done.unit)}${a.done.by && a.done.by !== ME.name ? ' · ' + esc(a.done.by) : ''}</p>` : ''}
    ${a.count ? `<p class="note" style="font-size:15px">Counted at ${tFmt(a.count.at)} · ${qtyU(a.count.qty, a.count.unit)} there</p>` : ''}`;
}

/* ============ RECIPES (Restaurant world, read-only, no prices for staff) ============ */
SCREENS.restaurant = { title: () => 'Recipes', c: '--rest', render(p) {
  const d = need('recipes', null, 10 * 60000);
  const top = head('Read-only', 'Recipes');
  if (!d) return `<div class="page">${top}${waiting('recipes')}</div>`;
  const q = (p.q || '').trim().toLowerCase();
  const list = d.recipes.filter(r => !q || r.title.toLowerCase().includes(q));
  const groups = {}; list.forEach(r => { (groups[cat(r.category)] = groups[cat(r.category)] || []).push(r); });
  return `<div class="page" style="--c:var(--rest)">${top}
    <input id="q" class="search" type="search" placeholder="Search ${d.recipes.length} recipes" value="${esc(p.q || '')}" autocomplete="off" enterkeyhint="search">
    ${Object.keys(groups).sort().map(g => `<section><div class="chap"><h2>${esc(g)}</h2><span>${groups[g].length}</span></div><div class="list">${groups[g].slice(0, q ? 50 : 400).map(r => `<button class="row" data-a="openRecipe" data-r="${r.id}"><span class="main"><div class="name">${esc(r.title)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>`).join('') || `<p class="note">Nothing found for “${esc(q)}”.</p>`}
  </div>`;
}, after(p, active) { searchBind(active); } };
function searchBind(active) {
  const i = $('q'); if (!i) return;
  if (active === 'q') { i.focus(); const v = i.value; i.setSelectionRange(v.length, v.length); }
  let t; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { cur().p.q = i.value; render(true); }, 220); });
}
SCREENS.recipe = { title: p => { const d = API.peek('recipe', { id: p.id }); return d ? d.recipe.title : (p.name || 'Recipe'); }, c: '--rest', render(p) {
  const d = need('recipe', { id: p.id }, 10 * 60000);
  if (!d) return `<div class="page">${backBtn()}${waiting('recipe')}</div>`;
  const r = d.recipe, x = num(p.x) || 1, y = d.yield || {};
  const line = (c) => `<${c.recipe_id ? `button data-a="openRecipe" data-r="${c.recipe_id}"` : 'div'} class="ing" style="width:100%"><span>${esc(c.name)}${c.note ? `<span class="muted" style="font-size:14px"> · ${esc(c.note)}</span>` : ''}${c.recipe_id ? '<span class="muted" style="font-size:14px"> · recipe</span>' : ''}</span><b class="num">${c.qty != null && num(c.qty) !== null ? fmt(num(c.qty) * x) + ' ' + esc(c.unit || '') : esc(c.unit || '')}</b></${c.recipe_id ? 'button' : 'div'}>`;
  let comps = d.components.map(line).join('');
  if (!comps && Array.isArray(r.ingredients) && r.ingredients.length) comps = r.ingredients.map(i => typeof i === 'object' && i ? line({ name: i.name || 'Item', qty: i.qty, unit: i.unit, note: i.comment }) : line({ name: String(i) })).join('');
  const steps = d.steps.length ? d.steps.map(s => `<div class="step"><span class="n">${s.step_number}</span><span>${s.title ? `<b>${esc(s.title)}</b><br>` : ''}${esc(s.instruction_en || '')}${s.timer_seconds ? `<br><span class="muted" style="font-size:15px">Timer ${Math.round(s.timer_seconds / 60)} min</span>` : ''}</span></div>`).join('')
    : (r.procedure_en || r.procedure) ? `<div class="pre" style="padding:14px 16px;white-space:pre-wrap">${esc(r.procedure_en || r.procedure)}</div>` : '<div class="row"><span class="main"><div class="meta">No method written yet.</div></span></div>';
  const batch = num(y.yield_qty) > 0 ? `${fmt(num(y.yield_qty) / 1000)} ${y.yield_dim === 'volume' ? 'L' : 'kg'}` : '';
  const fromPrep = p.prep ? +p.prep : null;
  return `<div class="page" style="--c:var(--rest)">${backBtn()}
    <div><div class="eyebrow">${esc(cat(r.category))}${r.prep_time_minutes ? ' · ' + r.prep_time_minutes + ' min' : ''}</div><h1>${esc(r.title)}</h1></div>
    <div class="facts">${batch ? `<span>Batch <b>${batch}</b></span>` : ''}${num(y.portions) > 0 ? `<span>Makes <b>${plural(Math.round(num(y.portions) * 100) / 100, 'portion')}</b></span>` : ''}${r.shelf_life_days ? `<span>Shelf life <b>${r.shelf_life_days} d</b></span>` : ''}${isChef() && r.selling_price ? `<span>Price <b>${money(r.selling_price)}</b></span>` : ''}${isChef() && num(r.food_cost_pct) !== null ? `<span>Food cost <b>${fmt(r.food_cost_pct)}%</b></span>` : ''}</div>
    ${r.yield_text && r.yield_text.trim() ? `<p class="note" style="font-size:15px">${esc(r.yield_text.trim().replace(/\s+/g, ' '))}</p>` : ''}
    ${fromPrep && need('shift', null, 30000) !== null ? actButtons(fromPrep, statusOf(fromPrep)) : ''}
    <section><div class="chap"><h2>Quantities</h2><span></span></div>
      <div class="qbtns" style="margin-bottom:10px">${[0.5, 1, 2, 3].map(k => `<button class="${k === x ? 'on' : ''}" data-a="scale" data-x="${k}">×${k}</button>`).join('')}</div>
      <div class="list">${comps || '<div class="row"><span class="main"><div class="meta">No quantities written yet.</div></span></div>'}</div>
      ${x !== 1 ? '<p class="note" style="font-size:14px">Scaled on this screen only. The recipe is unchanged.</p>' : ''}</section>
    <section><h2>Method</h2><div class="list">${steps}</div></section>
    ${r.equipment ? `<section><h2>Equipment</h2><div class="list"><div class="pre" style="padding:14px 16px;white-space:pre-wrap">${esc(r.equipment)}</div></div></section>` : ''}
    ${!fromPrep && d.preps.length ? `<section><h2>Prep</h2><div class="list">${d.preps.map(t => `<button class="row" data-a="openPrep" data-id="${t.id}"><span class="main"><div class="name">${esc(t.name)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : ''}
  </div>`;
} };

/* ============ CATERING (only what to cook) ============ */
SCREENS.catering = { title: () => 'Catering', c: '--cat', render() {
  const d = need('catering', null, 5 * 60000);
  const top = head('Next 2 weeks', 'Catering');
  if (!d) return `<div class="page">${top}${waiting('catering')}</div>`;
  return `<div class="page" style="--c:var(--cat)">${top}
    <div class="list">${d.events.map(e => `<button class="row" data-a="openEvent" data-id="${e.id}"><span class="dotc"></span><span class="main"><div class="name">${esc(e.name)}</div><div class="meta">${shortDay(e.date)}${e.time ? ' · ' + esc(String(e.time).slice(0, 5)) : ''}${e.guests ? ' · ' + e.guests + ' guests' : ''} · ${plural(e.dishes.length, 'dish').replace('dishs', 'dishes')}</div></span><span class="chev">›</span></button>`).join('') || '<div class="row"><span class="main"><div class="meta">No events in the next 2 weeks.</div></span></div>'}</div>
  </div>`;
} };
SCREENS.event = { title: p => { const d = API.peek('catering'); const e = d && d.events.find(x => x.id === p.id); return e ? e.name : 'Event'; }, c: '--cat', render(p) {
  const d = need('catering', null, 5 * 60000);
  if (!d) return `<div class="page">${backBtn()}${waiting('catering')}</div>`;
  const e = d.events.find(x => x.id === p.id); if (!e) return `<div class="page">${backBtn()}<p class="note">Event not found.</p></div>`;
  return `<div class="page" style="--c:var(--cat)">${backBtn()}
    ${head(shortDay(e.date) + (e.time ? ' · ' + esc(String(e.time).slice(0, 5)) : ''), esc(e.name), e.guests ? e.guests + ' guests' : '')}
    <section><h2>What to cook</h2><div class="list">${e.dishes.map(x => x.recipe_id ? `<button class="row" data-a="openRecipe" data-r="${x.recipe_id}"><span class="main"><div class="name">${esc(x.name)}</div>${x.qty ? `<div class="meta">${esc(x.qty)}</div>` : ''}</span><span class="chev">›</span></button>` : `<div class="row"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">No recipe linked</div></span></div>`).join('') || '<div class="row"><span class="main"><div class="meta">Menu not set yet.</div></span></div>'}</div></section>
  </div>`;
} };

/* ============ PLANNER (my shifts) ============ */
SCREENS.planner = { title: () => 'Planner', c: '--plan', render() {
  const d = need('planner', null, 10 * 60000);
  const top = head('Next 2 weeks', 'My shifts');
  if (!d) return `<div class="page">${top}${waiting('planner')}</div>`;
  return `<div class="page" style="--c:var(--plan)">${top}
    <div class="list">${d.shifts.map(s => `<div class="row"><span class="main"><div class="name">${shortDay(s.date)}</div><div class="meta">${esc(s.role_name || s.department_name || '')}${s.is_closing ? ' · closing' : ''}</div></span><span class="right">${esc(s.start_label || '')}–${esc(s.end_label || '')}</span></div>`).join('') || '<div class="row"><span class="main"><div class="meta">No shifts from 7shifts in the next 2 weeks.</div></span></div>'}</div>
  </div>`;
} };

/* ============ RENDER (V020-B engine) ============ */
function renderTabs() {
  const el = $('tabs'); el.hidden = !S.tabs.length;
  el.innerHTML = S.tabs.map(t => { const e = t.stack[0], c = (SCREENS[e.s] || SCREENS.today).c;
    return `<div class="tab ${S.active === t.id ? 'on' : ''}" style="--c:var(${c})"><button style="display:flex;align-items:center;gap:8px;min-width:0;height:100%" data-a="tab" data-id="${t.id}"><span class="dot" style="background:var(${c})"></span><span class="t">${esc(titleOf(e))}</span></button><button class="x" data-a="close" data-id="${t.id}" aria-label="Close">×</button></div>`; }).join('');
  const on = el.querySelector('.tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
function renderWorlds() {
  const b = ([k, w]) => `<button class="w ${S.active === 'home' && S.world === k ? 'on' : ''}" style="--c:var(${w.c})" data-a="world" data-w="${k}">${ICON[k]}${w.label}</button>`;
  const e = Object.entries(WORLDS);
  $('worlds').innerHTML = b(e[0]) + b(e[1]) + `<button class="w ask" data-a="ask" aria-label="Find"><span class="orb">${ICON.ask}</span>Find</button>` + b(e[2]) + b(e[3]);
}
function layout() { $('main').style.top = $('top').offsetHeight + 'px'; $('main').style.bottom = $('worlds').offsetHeight + 'px'; }
function render(keep) {
  if (!ME) return;
  const e = cur(), sc = SCREENS[e.s] || SCREENS.today;
  const y = $('main').scrollTop, active = document.activeElement && document.activeElement.id;
  let html; try { html = sc.render(e.p || {}); } catch (x) { console.error(x); html = `<div class="page">${backBtn()}<div class="err">This screen could not show the data: ${esc(x.message)}</div></div>`; }
  $('main').innerHTML = html;
  $('who').textContent = ME.name + (isChef() ? ' · Chef' : ME.station ? ' · ' + ME.station : '');
  renderTabs(); renderWorlds(); layout();
  $('main').scrollTop = keep ? y : (e.y || 0);
  if (sc.after) sc.after(e.p || {}, active);
  save();
}
let rt; function rerender() { clearTimeout(rt); rt = setTimeout(() => render(true), 60); }
window.addEventListener('app-data', rerender);
let scT; $('main').addEventListener('scroll', () => { clearTimeout(scT); scT = setTimeout(() => { cur().y = $('main').scrollTop; save(); }, 150); });
const remember = () => { cur().y = $('main').scrollTop; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ME) { API.forget('shift'); rerender(); } });

/* ============ NAVIGATION ============ */
function goOrigin(t) { const o = t && t.origin; if (o && o.tab && tabById(o.tab)) S.active = o.tab; else { S.active = 'home'; if (o && o.w) S.world = o.w; } }
function openTab(kind, ref, entry) {
  remember();
  const origin = S.active === 'home' ? { w: S.world, label: titleOf(cur()) } : { tab: S.active, label: titleOf(tabById(S.active).stack[0]) };
  let t = S.tabs.find(x => x.kind === kind && x.ref === ref);
  if (t && t.id !== S.active) { t.origin = origin; t.stack.length = 1; Object.assign(t.stack[0].p, entry.p); t.stack[0].y = 0; }
  if (!t) { t = { id: 't' + (S.seq++), kind, ref, stack: [entry], origin }; S.tabs.push(t); if (S.tabs.length > 8) S.tabs.shift(); }
  S.active = t.id; closeSheet(); render();
}
function sheet(html) { $('sheet').innerHTML = `<div class="grab"></div>${html}`; $('sheet').hidden = false; $('scrim').hidden = false; }
function closeSheet() { $('sheet').hidden = true; $('scrim').hidden = true; $('sheet').innerHTML = ''; }
$('scrim').onclick = closeSheet;
let toastT; function toast(msg) { let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.style.bottom = ($('worlds').offsetHeight + 12) + 'px'; el.innerHTML = `<span>${esc(msg)}</span>`; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
const errText = e => e && e.code === 'offline' ? 'No connection. Nothing was saved — try again.' : e && e.code === 'bad_qty' ? 'Check the quantity.' : e && e.code === 'bad_unit' ? 'Choose a unit.' : 'Not saved. Try again.';
async function write(kind, body, okMsg) {
  try { await API.act(kind, body); API.forget('shift'); API.forget('prep'); closeSheet(); toast(okMsg); rerender(); return true; }
  catch (e) { if (e.status !== 401) toast(errText(e)); return false; }
}

/* quantity sheet: Done (what you made) and Count (what is there now) are different questions */
function qtySheet(kind, id) {
  const d = API.peek('prep', { id }) || {}, t = d.prep || (API.peek('shift') || { items: [] }).items.find(x => x.id === id) || {};
  const plan = d.plan || {};
  const allowed = (d.units || ['kg', 'g', 'L', 'qt', 'each', '1/6 pan', '1/3 pan']).concat(t.unit ? [t.unit] : []);   // the server accepts these
  const units = [...new Set([kind === 'done' ? plan.unit : null, t.unit, 'kg', 'g', 'L', 'qt', 'each', '1/6 pan', '1/3 pan'].filter(u => u && allowed.includes(u)))];
  const k = kind + ':' + id; const dr = DRAFT[k] || (DRAFT[k] = { unit: (kind === 'done' ? plan.unit : null) || t.unit || units[0] });
  const y = d.yield || {}, batch = num(y.yield_qty) > 0 ? `${fmt(num(y.yield_qty) / 1000)} ${y.yield_dim === 'volume' ? 'L' : 'kg'}` : '';
  const q = kind === 'done'
    ? { h: 'How much did you make?', sub: `${esc(t.name || '')}${plan.qty != null ? ` · the plan says ${qtyU(plan.qty, plan.unit)}` : ''}${batch ? ` · the recipe makes about ${batch}` : ''}${plan.qty != null || batch ? '. Only a reference: write what you really made.' : ''}`, btn: 'Save Done' }
    : { h: 'How much is there now?', sub: `${esc(t.name || '')} · count what is in the walk-in and on the line. This is a count, not production.`, btn: 'Save count' };
  sheet(`<div class="page" style="--c:var(--today)"><h1 style="font-size:28px">${q.h}</h1><p class="note" style="font-size:15px">${q.sub}</p>
    <div class="qtyin"><input id="qv" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${esc(dr.qty || '')}"></div>
    <div class="qbtns">${units.map(u => `<button class="${u === dr.unit ? 'on' : ''}" data-a="unit" data-k="${esc(k)}" data-u="${esc(u)}">${esc(u)}</button>`).join('')}</div>
    <button class="btn ${kind === 'done' ? 'ok' : ''}" style="min-height:56px;font-size:18px" data-a="saveQty" data-kind="${kind}" data-id="${id}">${q.btn}</button></div>`);
  const i = $('qv'); i.addEventListener('input', () => { dr.qty = i.value; }); setTimeout(() => i.focus(), 50);
}

/* ============ ACTIONS ============ */
const A = {
  world(el) { remember(); const w = el.dataset.w; closeSheet();
    if (S.active === 'home' && S.world === w) { S.ws[w].length = 1; S.ws[w][0].y = 0; }
    S.world = w; S.active = 'home'; render(); },
  tab(el) { remember(); S.active = el.dataset.id; closeSheet(); render(); },
  close(el) { const id = el.dataset.id, i = S.tabs.findIndex(t => t.id === id), t = S.tabs[i]; if (i < 0) return; S.tabs.splice(i, 1); if (S.active === id) goOrigin(t); render(); },
  toOrigin() { remember(); goOrigin(tabById(S.active)); render(); },
  back() { const s = stack(); if (s.length > 1) { s.pop(); render(); } },
  openPrep(el) { const id = +el.dataset.id; const i = (API.peek('shift') || { items: [] }).items.find(x => x.id === id); openTab('prep', String(id), { s: 'prep', p: { id, name: i ? i.name : '' } }); },
  openRecipe(el) { openTab('recipe', el.dataset.r, { s: 'recipe', p: { id: el.dataset.r, prep: el.dataset.prep || '' } }); },
  openEvent(el) { openTab('event', el.dataset.id, { s: 'event', p: { id: el.dataset.id } }); },
  scale(el) { cur().p.x = +el.dataset.x; render(true); },
  station(el) { cur().p = Object.assign(cur().p || {}, { st: el.dataset.k }); render(true); },
  refresh() { Object.keys(ERR).forEach(k => delete ERR[k]); API.forget(); render(true); },
  start(el) { write('prep_start', { prep_task_id: +el.dataset.id }, 'Started.'); },
  done(el) { qtySheet('done', +el.dataset.id); },
  count(el) { qtySheet('count', +el.dataset.id); },
  unit(el) { DRAFT[el.dataset.k].unit = el.dataset.u; el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  async saveQty(el) {
    const kind = el.dataset.kind, id = +el.dataset.id, dr = DRAFT[kind + ':' + id] || {}, q = num($('qv').value);
    if (q === null || q < 0 || (kind === 'done' && q === 0)) { toast(kind === 'done' ? 'Write how much you made.' : 'Write how much is there (0 is fine).'); return; }
    if (!dr.unit) { toast('Choose a unit.'); return; }
    el.disabled = true;
    const ok = await write(kind === 'done' ? 'prep_done' : 'count', { prep_task_id: id, qty: q, unit: dr.unit }, kind === 'done' ? `Done · ${fmt(q)} ${dr.unit}` : `Counted · ${fmt(q)} ${dr.unit}`);
    if (ok) delete DRAFT[kind + ':' + id]; else el.disabled = false;
  },
  report(el) {
    const prep = el.dataset.prep ? +el.dataset.prep : null, k = 'report:' + (prep || '');
    sheet(`<div class="page" style="--c:var(--today)"><h1 style="font-size:28px">Report a problem</h1>
      <p class="note" style="font-size:15px">Chef sees it with your name${prep ? ' and this prep' : ''}.</p>
      <textarea id="rt" class="search" placeholder="What is wrong?" maxlength="1000">${esc(DRAFT[k] || '')}</textarea>
      <button class="btn" style="min-height:56px;font-size:18px" data-a="sendReport" data-prep="${prep || ''}">Send to Chef</button></div>`);
    const t = $('rt'); t.addEventListener('input', () => { DRAFT[k] = t.value; }); setTimeout(() => t.focus(), 50);
  },
  async sendReport(el) {
    const v = $('rt').value.trim(); if (v.length < 2) { toast('Write what is wrong.'); return; }
    el.disabled = true; const prep = el.dataset.prep ? +el.dataset.prep : null;
    const ok = await write('report', Object.assign({ text: v }, prep ? { prep_task_id: prep } : {}), 'Sent to Chef.');
    if (ok) delete DRAFT['report:' + (prep || '')]; else el.disabled = false;
  },
  compose() {
    if (!isChef()) return;
    const d = API.peek('shift') || {}, people = d.people || [], dr = DRAFT.msg || (DRAFT.msg = { to: 'all', text: '' });
    sheet(`<div class="page" style="--c:var(--today)"><h1 style="font-size:28px">Message</h1>
      <div class="qbtns">${[{ id: 'all', name: 'Everyone' }, ...people].map(p => `<button class="${String(p.id) === String(dr.to) ? 'on' : ''}" data-a="msgTo" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>
      <textarea id="mt" class="search" placeholder="Write to the team" maxlength="1000">${esc(dr.text)}</textarea>
      <button class="btn" style="min-height:56px;font-size:18px" data-a="sendMsg">Send</button>
      <p class="note" style="font-size:14px">They see it in their My Shift. Test mode: only Max and Pablo use this app.</p></div>`);
    const t = $('mt'); t.addEventListener('input', () => { dr.text = t.value; }); setTimeout(() => t.focus(), 50);
  },
  msgTo(el) { DRAFT.msg.to = el.dataset.id; el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  async sendMsg(el) {
    const dr = DRAFT.msg, v = $('mt').value.trim(); if (!v) { toast('Write a message.'); return; }
    el.disabled = true;
    const ok = await write('chef_message', Object.assign({ text: v }, dr.to === 'all' ? {} : { to_user_id: +dr.to }), 'Message sent.');
    if (ok) delete DRAFT.msg; else el.disabled = false;
  },
  readMsg(el) { const d = API.peek('shift'); const m = d && d.messages.find(x => x.id === el.dataset.id); if (m && !m.read) { m.read = true; render(true); API.act('message_read', { ref_id: m.id }).catch(() => {}); } },
  readReport(el) { const d = API.peek('shift'); const r = d && (d.reports || []).find(x => x.id === el.dataset.id); if (r && !r.read) { r.read = true; render(true); API.act('report_read', { ref_id: r.id }).catch(() => {}); } },
  ask() {
    need('recipes', null, 10 * 60000);
    sheet(`<div class="page"><h1 style="font-size:28px">Find</h1>
      <input id="ask" class="search" type="search" placeholder="Recipe or prep" autocomplete="off" enterkeyhint="search">
      <div id="askout"></div>
      <section><h2>${esc(ME.name)}</h2><div class="list">
        <button class="row" data-a="switchUser"><span class="main"><div class="name">Switch user</div><div class="meta">Signs you out. Tabs and drafts are cleared.</div></span></button>
        <button class="row" data-a="resetUi"><span class="main"><div class="name">Reset layout</div><div class="meta">Closes tabs and returns to My Shift.</div></span></button>
      </div></section>
      <p class="note" style="font-size:13px">Brigade app ${esc(window.APP_CONFIG.build)} · reserved test</p></div>`);
    const i = $('ask'); let t; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { $('askout').innerHTML = findResults(i.value); }, 200); });
  },
  resetUi() { S = fresh(); closeSheet(); render(); },
  async switchUser() { closeSheet(); await API.logout(); signedOut(); },
  pin(el) { pinPress(el.dataset.k); },
};
function findResults(q) {
  q = q.trim().toLowerCase(); if (q.length < 2) return '';
  const hit = s => String(s || '').toLowerCase().includes(q), out = [];
  ((API.peek('shift') || {}).items || []).filter(x => hit(x.name)).slice(0, 6).forEach(x => out.push(`<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">Prep · ${esc(x.station || '')}</div></span><span class="chev">›</span></button>`));
  ((API.peek('recipes') || {}).recipes || []).filter(x => hit(x.title)).slice(0, 10).forEach(x => out.push(`<button class="row" data-a="openRecipe" data-r="${x.id}"><span class="main"><div class="name">${esc(x.title)}</div><div class="meta">Recipe · ${esc(cat(x.category))}</div></span><span class="chev">›</span></button>`));
  return out.length ? `<div class="list">${out.join('')}</div>` : `<p class="note">Nothing found for “${esc(q)}”.</p>`;
}
document.addEventListener('click', ev => { const el = ev.target.closest('[data-a]'); if (!el) return; const f = A[el.dataset.a]; if (f) { ev.preventDefault(); f(el); } });
window.addEventListener('resize', layout);

/* ============ LOGIN (once per phone; the server keeps the session 30 days from last use) ============ */
let pinBuf = '', pinBusy = false;
function showLogin(msg) {
  const L = $('login'); L.hidden = false;
  ['top', 'main', 'worlds'].forEach(id => { $(id).style.visibility = 'hidden'; });
  L.innerHTML = `<div style="text-align:center"><div class="eyebrow">Zeno's kitchen</div><h1>Brigade</h1><div class="sub" style="margin-top:8px">Enter your PIN</div></div>
    <div class="dots" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="loginerr" id="lerr">${esc(msg || '')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-a="pin" data-k="${k}">${k}</button>`).join('')}<button class="k0" data-a="pin" data-k="0">0</button><button class="del" data-a="pin" data-k="del">Delete</button></div>`;
}
function hideLogin() { $('login').hidden = true; $('login').innerHTML = ''; ['top', 'main', 'worlds'].forEach(id => { $(id).style.visibility = ''; }); }
async function pinPress(k) {
  if (pinBusy) return;
  if (k === 'del') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k;
  showLogin('');
  if (pinBuf.length < 4) return;
  pinBusy = true;
  let j; try { j = await API.login(pinBuf); } catch (e) { j = { ok: false, error: e.code }; }
  pinBuf = ''; pinBusy = false;
  if (j && j.ok) { signedIn(j.user); return; }
  showLogin(j && j.error === 'offline' ? 'No connection. Try again.' : j && j.error === 'cooldown' ? 'Too many tries. Wait a few minutes.' : 'PIN not valid for this app.');
  const d = $('dots'); if (d) d.classList.add('shake');
}
function signedIn(user) {
  if (ME && ME.id !== user.id) wipeLocal();
  ME = user; loadUi(); hideLogin(); render();
}
function signedOut() { ME = null; wipeLocal(); $('main').innerHTML = ''; $('tabs').innerHTML = ''; closeSheet(); showLogin(''); }
window.addEventListener('app-signed-out', () => { API.clearToken(); if (ME) toast('Signed out.'); signedOut(); });

(async function boot() {
  if (!API.hasToken()) { signedOut(); return; }
  try { const j = await API.call('me'); signedIn(j.user); }
  catch (e) {
    if (e.status === 401) return;                // handled by app-signed-out
    $('main').innerHTML = `<div class="page"><div class="err"><b>No connection.</b><br>Your session is kept. <button class="lnk" onclick="location.reload()">Try again</button></div></div>`;
  }
})();
})();
