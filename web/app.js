/* Brigade 2.0 — reserved to Max + Pablo.
   UI = V020-B Clean Pass (frozen base, tag base-v020b-frozen-2026-10-03): worlds at the bottom,
   open things as tabs, back always names where it goes, closing a tab returns where it was opened from.
   Same components for Chef and staff: content and permissions differ, the visual language does not.
   Recipe card = Brigade's BR-UI02 card (recipe.js). All interface text goes through I18N (en / it / es). */
(function () {
const API = window.AppApi, I = window.I18N, t = I.t, RC = window.RecipeCard;

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
const WORLDS = { today: { k: 'w_today', c: '--today' }, restaurant: { k: 'w_rest', c: '--rest' }, catering: { k: 'w_cat', c: '--cat' }, planner: { k: 'w_plan', c: '--plan' } };

/* ============ HELPERS ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const fmt = v => { const n = num(v); if (n === null) return ''; return (Math.round(n * 100) / 100).toLocaleString(I.locale(), { maximumFractionDigits: 2 }); };
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const cat = c => { const x = String(c || 'Other').split('|')[0].trim(); return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : 'Other'; };
const tFmt = iso => iso ? new Intl.DateTimeFormat(I.locale(), { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';
const dayName = (d, opt = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(d + 'T12:00:00Z').toLocaleDateString(I.locale(), Object.assign({ timeZone: 'UTC' }, opt));
const shortDay = d => dayName(d, { weekday: 'short', day: 'numeric', month: 'short' });
const hourCDT = () => +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()) % 24;
const PLAN = { do_first: 'do_first', prep_today: 'prep_today', count_first: 'count_first' };
const qtyU = (q, u) => q == null ? '' : `${fmt(q)} ${esc(u || '')}`;

/* ============ SESSION ============ */
let ME = null;                                   // {id,name,station,role,lang} — always from the server
const isChef = () => ME && ME.role === 'chef';

/* ============ UI STATE (per user, per device) ============ */
const uiKey = () => 'brigade-app-ui:' + (ME ? ME.id : 'none');
const fresh = () => ({ v: 1, world: 'today', active: 'home', ws: { today: [{ s: 'today' }], restaurant: [{ s: 'restaurant' }], catering: [{ s: 'catering' }], planner: [{ s: 'planner' }] }, tabs: [], seq: 1 });
let S = fresh();
const loadUi = () => { S = fresh(); try { const x = JSON.parse(localStorage.getItem(uiKey())); if (x && x.v === 1) S = x; } catch (e) {} };
const save = () => { if (!ME) return; try { localStorage.setItem(uiKey(), JSON.stringify(S)); } catch (e) {} };
function wipeLocal() {                           // sign-out: nothing of the previous person stays on the phone
  try { Object.keys(localStorage).filter(k => k.startsWith('brigade-app-ui:')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  I.clearChoice(); S = fresh(); DRAFT = {}; API.forget();
}
let DRAFT = {};                                  // unsent text in sheets, memory only

const tabById = id => S.tabs.find(x => x.id === id);
const stack = () => S.active === 'home' ? S.ws[S.world] : (tabById(S.active) || { stack: [{ s: 'today' }] }).stack;
const cur = () => { const s = stack(); return s[s.length - 1]; };

const SCREENS = {};
const titleOf = e => { const sc = SCREENS[e.s]; try { return sc ? sc.title(e.p || {}) : ''; } catch (x) { return ''; } };
function backBtn() {
  const s = stack();
  if (s.length > 1) return `<button class="back" data-a="back">${ICON.back}${esc(titleOf(s[s.length - 2]))}</button>`;
  if (S.active !== 'home') { const tb = tabById(S.active); if (tb && tb.origin) return `<button class="back" data-a="toOrigin">${ICON.back}${esc(originLabel(tb.origin))}</button>`; }
  return '';
}
/* the origin label is recomputed, so it follows the current language */
const originLabel = o => o.tab && tabById(o.tab) ? titleOf(tabById(o.tab).stack[0]) : o.w ? t(WORLDS[o.w].k) : (o.label || '');
const head = (eyebrow, h, sub) => `<div><div class="eyebrow">${eyebrow}</div><h1>${h}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

/* data gate: returns the data when in memory; otherwise starts loading and returns undefined */
const ERR = {};
function need(op, body, ttl) {
  const d = API.peek(op, body);
  API.get(op, body, ttl).then(() => { delete ERR[op]; }, e => { ERR[op] = e; });
  return d;
}
function waiting(op) {
  const e = ERR[op];
  if (e && e.status !== 401) return `<div class="err"><b>${t('no_answer')}</b><br>${e.code === 'offline' ? t('no_conn') : esc(e.code)}<br><button class="lnk" data-a="refresh">${t('try_again')}</button></div>`;
  return `<div class="skel">${t('loading')}</div>`;
}
const testNote = () => `<p class="note" style="font-size:14px">${t('test_note')}</p>`;

/* ============ MY SHIFT (Today world) ============ */
const shiftData = () => need('shift', null, 30000);
function prepRow(i) {
  const a = i.app || {};
  const st = a.done ? `<span class="pill ok">${t('pill_done', { q: qtyU(a.done.qty, a.done.unit) })}</span>`
    : a.started ? `<span class="pill">${t('started_at', { t: tFmt(a.started.at) })}${a.started.by && a.started.by !== ME.name ? ' · ' + esc(a.started.by) : ''}</span>`
    : a.count ? `<span class="pill">${t('pill_counted', { q: qtyU(a.count.qty, a.count.unit) })}</span>` : '';
  return `<button class="row ${a.done ? 'donebg' : ''}" data-a="openPrep" data-id="${i.id}"><span class="main">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><span class="name">${esc(i.name)}</span>${i.qty != null && i.plan !== 'count_first' ? `<span class="qty num">${fmt(i.qty)} <small style="font-size:16px">${esc(i.qty_unit || '')}</small></span>` : ''}</div>
    <div class="meta">${isChef() ? esc(i.station || '') + ' · ' : ''}${i.plan === 'count_first' ? t('count_what') : esc(cut(i.reason, 70))}</div>${st ? `<div style="margin-top:6px">${st}</div>` : ''}</span></button>`;
}
SCREENS.today = { title: () => t('w_today'), c: '--today', render() {
  const h = hourCDT(), first = ME.name.split(' ')[0];
  const greet = `${t(h < 12 ? 'gm' : h < 17 ? 'ga' : 'ge')}, ${esc(first)}.`;
  const d = shiftData();
  const top = `<div class="greet"><div class="eyebrow">${d ? dayName(d.today) : ''}${ME.station && !isChef() ? ' · ' + esc(ME.station) : ''}</div><h1>${greet}</h1>`;
  if (!d) return `<div class="page">${top}</div>${waiting('shift')}</div>`;
  const seg = isChef() ? (cur().p || {}).st || 'all' : 'mine';
  const items = d.items.filter(i => seg === 'all' || seg === 'mine' || i.station === seg);
  const open = items.filter(i => !(i.app && i.app.done) && i.plan !== 'count_first');
  const unread = d.messages.filter(m => !m.read);
  const brief = d.plan_date && d.plan_date !== d.today ? t('plan_old', { d: shortDay(d.plan_date) }) : '';
  const next = open.length ? t('start_with', { n: esc(open[0].name), c: I.plural(open.length, 'preps') }) : items.length ? t('all_done') : t('nothing_station');
  const sec = k => { const l = items.filter(i => i.plan === k); return l.length ? `<section><div class="chap"><h2>${t(PLAN[k])}</h2><span>${l.length}</span></div><div class="list">${l.map(prepRow).join('')}</div></section>` : ''; };
  const stations = isChef() ? [...new Set(d.items.map(i => i.station))].sort() : [];
  const msgs = d.messages.slice(0, 6);
  const msgHtml = msgs.map(m => `<button class="msg ${m.read ? '' : 'unread'}" data-a="readMsg" data-id="${m.id}">${m.read ? '' : '<span class="dotw" style="margin-top:6px"></span>'}<span class="main"><div class="who">${esc(m.from)}${isChef() ? ' → ' + (m.to === 'all' ? t('everyone') : esc(m.to)) : ' · ' + (m.to === 'all' ? t('to_everyone') : t('to_you'))} · ${tFmt(m.at)}</div><div class="txt">${esc(m.text)}</div></span></button>`).join('');
  const reports = isChef() ? d.reports || [] : [], repUnread = reports.filter(r => !r.read);
  return `<div class="page" style="--c:var(--today)">
    ${top}<p class="brief">${brief}${next}</p></div>
    ${isChef() ? `<div class="acts"><button class="btn" data-a="compose">${t('msg_team')}</button></div>` : ''}
    ${msgs.length ? `<section><div class="chap"><h2>${t(isChef() ? 'your_msgs' : 'from_chef')}</h2><span>${unread.length ? t('new_n', { n: unread.length }) : ''}</span></div><div class="list">${msgHtml}</div></section>` : ''}
    ${isChef() ? `<section><div class="chap"><h2>${t('problems')}</h2><span>${repUnread.length ? t('new_n', { n: repUnread.length }) : ''}</span></div><div class="list">${reports.slice(0, 8).map(r => `<button class="msg ${r.read ? '' : 'unread'}" data-a="readReport" data-id="${r.id}">${r.read ? '' : '<span class="dotw" style="margin-top:6px"></span>'}<span class="main"><div class="who">${esc(r.from)} · ${tFmt(r.at)}${r.prep ? ' · ' + esc(r.prep) : ''}</div><div class="txt">${esc(r.text)}</div></span></button>`).join('') || `<div class="row"><span class="main"><div class="meta">${t('no_problems')}</div></span></div>`}</div></section>` : ''}
    ${stations.length ? `<div class="seg">${['all', ...stations].map(s => `<button class="${s === seg ? 'on' : ''}" data-a="station" data-k="${esc(s)}">${s === 'all' ? t('all') : esc(s.replace(/ Station$/, ''))}</button>`).join('')}</div>` : ''}
    ${sec('do_first')}${sec('prep_today')}${sec('count_first')}
    ${!items.length ? `<p class="note">${t('no_prep_station')}</p>` : ''}
    ${d.done_today.length ? `<section><h2>${t('done_today')}</h2><div class="feed">${d.done_today.map(x => `<div><time>${tFmt(x.at)}</time><span>${isChef() ? esc(x.by) + ' · ' : ''}${esc(x.name)} · ${qtyU(x.qty, x.unit)}</span></div>`).join('')}</div></section>` : ''}
    <div class="list"><button class="row" data-a="report"><span class="main"><div class="name">${t('report')}</div><div class="meta">${t('report_sub')}</div></span><span class="chev">›</span></button></div>
    ${!isChef() && d.my_reports && d.my_reports.length ? `<section><h2>${t('you_reported')}</h2><div class="feed">${d.my_reports.slice(0, 5).map(r => `<div><time>${tFmt(r.at)}</time><span>${esc(cut(r.text, 90))}</span></div>`).join('')}</div></section>` : ''}
    ${testNote()}
  </div>`;
} };

/* ============ PREP (tab) ============ */
SCREENS.prep = { title: p => { const d = API.peek('prep', { id: p.id }); return d ? d.prep.name : (p.name || t('prep_word')); }, c: '--today', render(p) {
  const d = need('prep', { id: p.id }, 20000); need('shift', null, 30000);   // shift carries today's Start/Done/Count status
  if (!d) return `<div class="page">${backBtn()}${waiting('prep')}</div>`;
  const tk = d.prep, a = statusOf(tk.id);
  return `<div class="page" style="--c:var(--today)">${backBtn()}
    ${head(esc(tk.category || t('prep_word')), esc(tk.name))}
    ${d.plan ? `<div class="list"><div class="row"><span class="main"><div class="eyebrow">${t('plan')} · ${d.plan_date ? shortDay(d.plan_date) : ''}</div><div class="name">${t(PLAN[d.plan.status] || d.plan.status)}${d.plan.qty != null && d.plan.status !== 'count_first' ? ' · ' + qtyU(d.plan.qty, d.plan.unit) : ''}</div>${d.plan.reason ? `<div class="meta">${esc(d.plan.reason)}</div>` : ''}</span></div></div>` : `<p class="note">${t('not_in_plan')}</p>`}
    <div class="facts"><span>${t('brigade_stock')} <b>${tk.current_stock != null ? qtyU(tk.current_stock, tk.unit) : t('not_recorded')}</b></span>${tk.container ? `<span>${t('container')} <b>${esc(tk.container)}</b></span>` : ''}</div>
    ${tk.note ? `<p class="note">${esc(tk.note)}</p>` : ''}
    ${actButtons(tk.id, a)}
    ${d.recipe ? `<div class="list"><button class="row" data-a="openRecipe" data-r="${d.recipe.id}" data-prep="${tk.id}"><span class="main"><div class="name">${esc(d.recipe.title)}</div><div class="meta">${t('recipe_sub')}</div></span><span class="chev">›</span></button></div>` : ''}
    ${d.history.length ? `<section><h2>${t('last2')}</h2><div class="feed">${d.history.map(h => `<div><time>${tFmt(h.at)}</time><span>${esc(h.by)} · ${h.kind === 'prep_done' ? t('made') + ' ' + qtyU(h.qty, h.unit) : h.kind === 'count' ? t('counted') + ' ' + qtyU(h.qty, h.unit) : t('started')}</span></div>`).join('')}</div></section>` : ''}
    <div class="list"><button class="row" data-a="report" data-prep="${tk.id}"><span class="main"><div class="name">${t('report_prep')}</div></span><span class="chev">›</span></button></div>
    ${testNote()}
  </div>`;
} };
function statusOf(id) { const d = API.peek('shift'); const i = d && d.items.find(x => x.id === id); return (i && i.app) || {}; }
function actButtons(id, a) {
  const started = a.started && !a.done;
  return `<div class="acts">
    ${started ? `<button class="btn ghost" disabled>${t('started_at', { t: tFmt(a.started.at) })}</button>` : `<button class="btn ghost" data-a="start" data-id="${id}">${t('start')}</button>`}
    <button class="btn ok" data-a="done" data-id="${id}">${t('done')}</button>
    <button class="btn ghost" data-a="count" data-id="${id}">${t('count')}</button></div>
    ${a.done ? `<p class="note" style="font-size:15px">${t('done_at', { t: tFmt(a.done.at), q: qtyU(a.done.qty, a.done.unit) })}${a.done.by && a.done.by !== ME.name ? ' · ' + esc(a.done.by) : ''}</p>` : ''}
    ${a.count ? `<p class="note" style="font-size:15px">${t('counted_at', { t: tFmt(a.count.at), q: qtyU(a.count.qty, a.count.unit) })}</p>` : ''}`;
}

/* ============ RECIPES (Restaurant world) ============ */
SCREENS.restaurant = { title: () => t('w_rest'), c: '--rest', render(p) {
  const d = need('recipes', null, 10 * 60000);
  const top = head(t('read_only'), t('w_rest'));
  if (!d) return `<div class="page">${top}${waiting('recipes')}</div>`;
  const q = (p.q || '').trim().toLowerCase();
  const list = d.recipes.filter(r => !q || r.title.toLowerCase().includes(q));
  const groups = {}; list.forEach(r => { (groups[cat(r.category)] = groups[cat(r.category)] || []).push(r); });
  return `<div class="page" style="--c:var(--rest)">${top}
    <input id="q" class="search" type="search" placeholder="${esc(t('search_n', { n: d.recipes.length }))}" value="${esc(p.q || '')}" autocomplete="off" enterkeyhint="search">
    ${Object.keys(groups).sort().map(g => `<section><div class="chap"><h2>${esc(g)}</h2><span>${groups[g].length}</span></div><div class="list">${groups[g].map(r => `<button class="row" data-a="openRecipe" data-r="${r.id}"><span class="main"><div class="name">${esc(r.title)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>`).join('') || `<p class="note">${esc(t('nothing_for', { q }))}</p>`}
  </div>`;
}, after(p, active) { searchBind(active); } };
function searchBind(active) {
  const i = $('q'); if (!i) return;
  if (active === 'q') { i.focus(); const v = i.value; i.setSelectionRange(v.length, v.length); }
  let tm; i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { cur().p.q = i.value; render(true); }, 220); });
}

/* ---- recipe tab: BR-UI02 card inside the V020-B tab ---- */
function recipeBody(v, p, d) {
  if (v.tab === 'cost') { const c = API.peek('recipe_cost', { id: p.id }); return RC.costView(v, c !== undefined ? c : ERR.recipe_cost ? null : undefined); }
  if (v.tab === 'struct') { const tr = API.peek('recipe_tree', { id: p.id }); return RC.structView(v, tr !== undefined ? tr : ERR.recipe_tree ? null : undefined); }
  return RC.prepView(v)
    + (d.preps.length ? `<section><h2>${RC.R('prep_list')}</h2><div class="list">${d.preps.map(x => `<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : '')
    + (d.used_in.length ? `<section><h2>${RC.R('used_in')}</h2><div class="list">${d.used_in.map(u => `<button class="row" data-a="openRecipe" data-r="${u.id}"><span class="main"><div class="name">${esc(u.title)}</div></span><span class="chev">›</span></button>`).join('')}</div></section>` : '');
}
SCREENS.recipe = { title: p => { const d = API.peek('recipe', { id: p.id }); return d ? d.recipe.title : (p.name || t('recipe_word')); }, c: '--rest', render(p) {
  const d = need('recipe', { id: p.id }, 10 * 60000);
  if (!d) return `<div class="page">${backBtn()}${waiting('recipe')}</div>`;
  const v = RC.model(d, p);
  if (!RC.tabs(v).includes(v.tab)) v.tab = 'prep';
  if (v.tab === 'cost') need('recipe_cost', { id: p.id }, 10 * 60000);
  if (v.tab === 'struct') need('recipe_tree', { id: p.id }, 10 * 60000);
  const fromPrep = p.prep ? +p.prep : null;
  return `<div class="page" style="--c:var(--rest)">${backBtn()}
    <div><div class="eyebrow">${esc(RC.headMeta(v))}</div><h1>${esc(v.rec.title)}</h1></div>
    <div class="rc-sticky">${RC.amountHtml(v)}${RC.segHtml(v)}</div>
    ${RC.notes(v)}
    ${fromPrep ? actButtons(fromPrep, statusOf(fromPrep)) : ''}
    <div id="rcBody" class="rc-body">${recipeBody(v, p, d)}</div>
  </div>`;
}, after(p, active) {
  const inp = $('rcAmount'), rng = $('rcRange'); if (!inp) return;
  const d = API.peek('recipe', { id: p.id }); if (!d) return;
  const v = () => RC.model(d, p);
  const refresh = (fromRange) => {          // partial update: the field keeps focus and what you are typing
    const m = v();
    $('rcBody').innerHTML = recipeBody(m, p, d);
    $('rcSub').textContent = Math.abs(m.factor - 1) < 1e-9 ? RC.R('original') : '× ' + (Math.round(m.factor * 1000) / 1000).toLocaleString(I.locale());
    const a = RC._.amountOf(m), rg = RC._.range(m.yb), over = $('rcOver');
    if (!fromRange) rng.value = String(Math.min(rg.max, Math.max(rg.min, a)));
    if (fromRange) inp.value = (Math.round(a * 100) / 100).toLocaleString(I.locale(), { useGrouping: false, maximumFractionDigits: 2 });
    over.hidden = !(a > rg.max); if (a > rg.max) over.textContent = RC.R('over_slider', { x: (Math.round(a * 100) / 100).toLocaleString(I.locale()) });
    save();
  };
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('input', () => {
    const f = RC.setAmount(v(), inp.value), over = $('rcOver');
    if (f === null) { over.hidden = false; over.textContent = RC.R('invalid_amt'); return; }
    p.factor = f; refresh(false);
  });
  inp.addEventListener('blur', () => {      // normalise the field only: never rebuild the card under a finger moving to the slider
    const m = v(), a = RC._.amountOf(m), dec = m.yb.mode === 'portions' ? 1 : 2;
    inp.value = (Math.round(a * 10 ** dec) / 10 ** dec).toLocaleString(I.locale(), { useGrouping: false, maximumFractionDigits: dec });
    const rg = RC._.range(m.yb), over = $('rcOver'); over.hidden = !(a > rg.max); if (a > rg.max) over.textContent = RC.R('over_slider', { x: (Math.round(a * 100) / 100).toLocaleString(I.locale()) });
  });
  rng.addEventListener('input', () => { const f = RC.setAmount(v(), rng.value); if (f !== null) { p.factor = f; refresh(true); } });
  if (active === 'rcAmount') { inp.focus(); }
} };

/* ============ CATERING (only what to cook) ============ */
SCREENS.catering = { title: () => t('w_cat'), c: '--cat', render() {
  const d = need('catering', null, 5 * 60000);
  const top = head(t('next2'), t('w_cat'));
  if (!d) return `<div class="page">${top}${waiting('catering')}</div>`;
  return `<div class="page" style="--c:var(--cat)">${top}
    <div class="list">${d.events.map(e => `<button class="row" data-a="openEvent" data-id="${e.id}"><span class="dotc"></span><span class="main"><div class="name">${esc(e.name)}</div><div class="meta">${shortDay(e.date)}${e.time ? ' · ' + esc(String(e.time).slice(0, 5)) : ''}${e.guests ? ' · ' + t('guests', { n: e.guests }) : ''} · ${e.ts_menu ? t('ts_menu') + ' · ' + e.ts_menu.lines.length : I.plural(e.dishes.length, 'dishes')}</div></span><span class="chev">›</span></button>`).join('') || `<div class="row"><span class="main"><div class="meta">${t('no_events')}</div></span></div>`}</div>
  </div>`;
} };
SCREENS.event = { title: p => { const d = API.peek('catering'); const e = d && d.events.find(x => x.id === p.id); return e ? e.name : t('w_cat'); }, c: '--cat', render(p) {
  const d = need('catering', null, 5 * 60000);
  if (!d) return `<div class="page">${backBtn()}${waiting('catering')}</div>`;
  const e = d.events.find(x => x.id === p.id); if (!e) return `<div class="page">${backBtn()}<p class="note">${t('event_nf')}</p></div>`;
  const dish = x => x.recipe_id ? `<button class="row" data-a="openRecipe" data-r="${x.recipe_id}"><span class="main"><div class="name">${esc(x.name)}</div>${x.qty ? `<div class="meta">${esc(x.qty)}</div>` : ''}</span><span class="chev">›</span></button>` : `<div class="row"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">${t('no_recipe_link')}</div></span></div>`;
  // TS08: guests = event guests from Tripleseat; ×N = quantity of that menu line (package), never merged with guests
  const m = e.ts_menu;
  const tsLine = l => `<div class="row"><span class="main"><div class="name">${esc(l.name)}</div>${l.qty != null && l.qty !== '' ? `<div class="meta">${t('ts_qty', { n: esc(l.qty) })}</div>` : ''}${l.details ? `<div class="meta">${esc(l.details)}</div>` : ''}</span></div>`;
  const tsHtml = m ? `<section><h2>${t('ts_menu')}</h2><div class="list">${m.lines.map((l, i) => (l.section && (i === 0 || m.lines[i - 1].section !== l.section) ? `<div class="row"><span class="main"><div class="meta"><b>${esc(l.section)}</b></div></span></div>` : '') + tsLine(l)).join('') || `<div class="row"><span class="main"><div class="meta">${t('ts_empty')}</div></span></div>`}</div>
    <p class="note">${t('ts_updated', { v: m.version, d: m.received_at ? esc(new Date(m.received_at).toLocaleString(I.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '—' })}</p></section>` : '';
  const oldHtml = m ? (e.dishes.length ? `<section><h2>${t('old_copy')}</h2><p class="note">${t('old_copy_note')}</p><div class="list">${e.dishes.map(dish).join('')}</div></section>` : '')
    : `<section><h2>${t('what_cook')}</h2><div class="list">${e.dishes.map(dish).join('') || `<div class="row"><span class="main"><div class="meta">${t('menu_not_set')}</div></span></div>`}</div></section>`;
  return `<div class="page" style="--c:var(--cat)">${backBtn()}
    ${head(shortDay(e.date) + (e.time ? ' · ' + esc(String(e.time).slice(0, 5)) : ''), esc(e.name), e.guests ? t(m ? 'guests_event' : 'guests', { n: e.guests }) : '')}
    ${tsHtml}${oldHtml}
  </div>`;
} };

/* ============ PLANNER (my shifts; the to-do planner is its own pending module) ============ */
SCREENS.planner = { title: () => t('w_plan'), c: '--plan', render() {
  const d = need('planner', null, 10 * 60000);
  const top = head(t('next2'), t('my_shifts'));
  if (!d) return `<div class="page">${top}${waiting('planner')}</div>`;
  return `<div class="page" style="--c:var(--plan)">${top}
    <div class="list">${d.shifts.map(s => `<div class="row"><span class="main"><div class="name">${shortDay(s.date)}</div><div class="meta">${esc(s.role_name || s.department_name || '')}${s.is_closing ? ' · ' + t('closing') : ''}</div></span><span class="right">${esc(s.start_label || '')}–${esc(s.end_label || '')}</span></div>`).join('') || `<div class="row"><span class="main"><div class="meta">${t('no_shifts')}</div></span></div>`}</div>
    <p class="note" style="font-size:14px">${t('planner_todo_pending')}</p>
  </div>`;
} };

/* ============ RENDER (V020-B engine) ============ */
function renderTabs() {
  const el = $('tabs'); el.hidden = !S.tabs.length;
  el.innerHTML = S.tabs.map(tb => { const e = tb.stack[0], c = (SCREENS[e.s] || SCREENS.today).c;
    return `<div class="tab ${S.active === tb.id ? 'on' : ''}" style="--c:var(${c})"><button style="display:flex;align-items:center;gap:8px;min-width:0;height:100%" data-a="tab" data-id="${tb.id}"><span class="dot" style="background:var(${c})"></span><span class="t">${esc(titleOf(e))}</span></button><button class="x" data-a="close" data-id="${tb.id}" aria-label="${t('close')}">×</button></div>`; }).join('');
  const on = el.querySelector('.tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
function renderWorlds() {
  const b = ([k, w]) => `<button class="w ${S.active === 'home' && S.world === k ? 'on' : ''}" style="--c:var(${w.c})" data-a="world" data-w="${k}">${ICON[k]}${t(w.k)}</button>`;
  const e = Object.entries(WORLDS);
  $('worlds').innerHTML = b(e[0]) + b(e[1]) + `<button class="w ask" data-a="ask" aria-label="${t('find')}"><span class="orb">${ICON.ask}</span>${t('find')}</button>` + b(e[2]) + b(e[3]);
}
function layout() { $('main').style.top = $('top').offsetHeight + 'px'; $('main').style.bottom = $('worlds').offsetHeight + 'px'; }
function render(keep) {
  if (!ME) return;
  const e = cur(), sc = SCREENS[e.s] || SCREENS.today;
  const y = $('main').scrollTop, active = document.activeElement && document.activeElement.id;
  let html; try { html = sc.render(e.p || {}); } catch (x) { console.error(x); html = `<div class="page">${backBtn()}<div class="err">${esc(x.message)}</div></div>`; }
  $('main').innerHTML = html;
  $('who').textContent = ME.name + (isChef() ? ' · ' + t('chef') : ME.station ? ' · ' + ME.station : '');
  $('mode').textContent = t('test_mode');
  renderTabs(); renderWorlds(); layout();
  $('main').scrollTop = keep ? y : (e.y || 0);
  if (sc.after) sc.after(e.p || {}, active);
  save();
}
let rt; function rerender() { clearTimeout(rt); rt = setTimeout(() => { const a = document.activeElement; if (a && a.id === 'rcAmount') return; render(true); }, 60); }
window.addEventListener('app-data', rerender);
let scT; $('main').addEventListener('scroll', () => { clearTimeout(scT); scT = setTimeout(() => { cur().y = $('main').scrollTop; save(); }, 150); });
const remember = () => { cur().y = $('main').scrollTop; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ME) { API.forget('shift'); rerender(); } });

/* ============ NAVIGATION ============ */
function goOrigin(tb) { const o = tb && tb.origin; if (o && o.tab && tabById(o.tab)) S.active = o.tab; else { S.active = 'home'; if (o && o.w) S.world = o.w; } }
function openTab(kind, ref, entry) {
  remember();
  const origin = S.active === 'home' ? { w: S.world } : { tab: S.active };
  let tb = S.tabs.find(x => x.kind === kind && x.ref === ref);
  if (tb && tb.id !== S.active) { tb.origin = origin; tb.stack.length = 1; tb.stack[0].p = Object.assign({}, tb.stack[0].p, entry.p); tb.stack[0].y = 0; }
  if (!tb) { tb = { id: 't' + (S.seq++), kind, ref, stack: [entry], origin }; S.tabs.push(tb); if (S.tabs.length > 8) S.tabs.shift(); }
  S.active = tb.id; closeSheet(); render();
}
function sheet(html) { $('sheet').innerHTML = `<div class="grab"></div>${html}`; $('sheet').hidden = false; $('scrim').hidden = false; }
function closeSheet() { $('sheet').hidden = true; $('scrim').hidden = true; $('sheet').innerHTML = ''; }
$('scrim').onclick = closeSheet;
let toastT; function toast(msg) { let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.style.bottom = ($('worlds').offsetHeight + 12) + 'px'; el.innerHTML = `<span>${esc(msg)}</span>`; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
const errText = e => e && e.code === 'offline' ? t('offline_save') : e && e.code === 'bad_qty' ? t('check_qty') : e && e.code === 'bad_unit' ? t('choose_unit') : t('not_saved');
async function write(kind, body, okMsg) {
  try { await API.act(kind, body); API.forget('shift'); API.forget('prep'); closeSheet(); toast(okMsg); rerender(); return true; }
  catch (e) { if (e.status !== 401) toast(errText(e)); return false; }
}

/* quantity sheet: Done (what you made) and Count (what is there now) are different questions */
function qtySheet(kind, id) {
  const d = API.peek('prep', { id }) || {}, tk = d.prep || (API.peek('shift') || { items: [] }).items.find(x => x.id === id) || {};
  const plan = d.plan || {};
  const allowed = (d.units || ['kg', 'g', 'L', 'qt', 'each', '1/6 pan', '1/3 pan']).concat(tk.unit ? [tk.unit] : []);
  const units = [...new Set([kind === 'done' ? plan.unit : null, tk.unit, 'kg', 'g', 'L', 'qt', 'each', '1/6 pan', '1/3 pan'].filter(u => u && allowed.includes(u)))];
  const k = kind + ':' + id; const dr = DRAFT[k] || (DRAFT[k] = { unit: (kind === 'done' ? plan.unit : null) || tk.unit || units[0] });
  const y = d.yield || {}, batch = num(y.yield_qty) > 0 ? `${fmt(num(y.yield_qty) / 1000)} ${y.yield_dim === 'volume' ? 'L' : 'kg'}` : '';
  const q = kind === 'done'
    ? { h: t('how_made'), sub: `${esc(tk.name || '')}${plan.qty != null ? t('plan_says', { q: qtyU(plan.qty, plan.unit) }) : ''}${batch ? t('recipe_makes', { q: batch }) : ''}${plan.qty != null || batch ? t('only_ref') : ''}`, btn: t('save_done') }
    : { h: t('how_there'), sub: `${esc(tk.name || '')}${t('count_help')}`, btn: t('save_count') };
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
  close(el) { const id = el.dataset.id, i = S.tabs.findIndex(x => x.id === id), tb = S.tabs[i]; if (i < 0) return; S.tabs.splice(i, 1); if (S.active === id) goOrigin(tb); render(); },
  toOrigin() { remember(); goOrigin(tabById(S.active)); render(); },
  back() { const s = stack(); if (s.length > 1) { s.pop(); render(); } },
  openPrep(el) { const id = +el.dataset.id; const i = (API.peek('shift') || { items: [] }).items.find(x => x.id === id); openTab('prep', String(id), { s: 'prep', p: { id, name: i ? i.name : '' } }); },
  openRecipe(el) { openTab('recipe', el.dataset.r, { s: 'recipe', p: { id: el.dataset.r, prep: el.dataset.prep || '', factor: 1, subWarn: null } }); },
  /* a sub-recipe opens in its own tab at the quantity the parent needs; closing it returns to the parent */
  openSub(el) { const p = cur().p, d = API.peek('recipe', { id: p.id }); if (!d) return; const s = RC.subFor(RC.model(d, p), +el.dataset.i); if (!s) return;
    openTab('recipe', s.id, { s: 'recipe', p: { id: s.id, name: s.name, factor: s.factor, subWarn: s.warn, prep: '', tab: p.tab } }); },
  openSubId(el) { const f = num(el.dataset.f); openTab('recipe', el.dataset.r, { s: 'recipe', p: { id: el.dataset.r, factor: f > 0 ? f : 1, subWarn: null, prep: '', tab: cur().p.tab } }); },
  rcTab(el) { cur().p.tab = el.dataset.k; render(true); },
  openEvent(el) { openTab('event', el.dataset.id, { s: 'event', p: { id: el.dataset.id } }); },
  station(el) { cur().p = Object.assign(cur().p || {}, { st: el.dataset.k }); render(true); },
  refresh() { Object.keys(ERR).forEach(k => delete ERR[k]); API.forget(); render(true); },
  start(el) { write('prep_start', { prep_task_id: +el.dataset.id }, t('t_started')); },
  done(el) { qtySheet('done', +el.dataset.id); },
  count(el) { qtySheet('count', +el.dataset.id); },
  unit(el) { DRAFT[el.dataset.k].unit = el.dataset.u; el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  async saveQty(el) {
    const kind = el.dataset.kind, id = +el.dataset.id, dr = DRAFT[kind + ':' + id] || {}, q = num($('qv').value);
    if (q === null || q < 0 || (kind === 'done' && q === 0)) { toast(kind === 'done' ? t('write_made') : t('write_there')); return; }
    if (!dr.unit) { toast(t('choose_unit')); return; }
    el.disabled = true;
    const ok = await write(kind === 'done' ? 'prep_done' : 'count', { prep_task_id: id, qty: q, unit: dr.unit }, t(kind === 'done' ? 't_done' : 't_counted', { q: `${fmt(q)} ${dr.unit}` }));
    if (ok) delete DRAFT[kind + ':' + id]; else el.disabled = false;
  },
  report(el) {
    const prep = el.dataset.prep ? +el.dataset.prep : null, k = 'report:' + (prep || '');
    sheet(`<div class="page" style="--c:var(--today)"><h1 style="font-size:28px">${t('report')}</h1>
      <p class="note" style="font-size:15px">${t('report_who')}${prep ? t('report_prep_too') : ''}.</p>
      <textarea id="rt" class="search" placeholder="${esc(t('what_wrong'))}" maxlength="1000">${esc(DRAFT[k] || '')}</textarea>
      <button class="btn" style="min-height:56px;font-size:18px" data-a="sendReport" data-prep="${prep || ''}">${t('send_chef')}</button></div>`);
    const x = $('rt'); x.addEventListener('input', () => { DRAFT[k] = x.value; }); setTimeout(() => x.focus(), 50);
  },
  async sendReport(el) {
    const v = $('rt').value.trim(); if (v.length < 2) { toast(t('write_wrong')); return; }
    el.disabled = true; const prep = el.dataset.prep ? +el.dataset.prep : null;
    const ok = await write('report', Object.assign({ text: v }, prep ? { prep_task_id: prep } : {}), t('sent_chef'));
    if (ok) delete DRAFT['report:' + (prep || '')]; else el.disabled = false;
  },
  compose() {
    if (!isChef()) return;
    const d = API.peek('shift') || {}, people = d.people || [], dr = DRAFT.msg || (DRAFT.msg = { to: 'all', text: '' });
    sheet(`<div class="page" style="--c:var(--today)"><h1 style="font-size:28px">${t('message')}</h1>
      <div class="qbtns">${[{ id: 'all', name: t('everyone') }, ...people].map(x => `<button class="${String(x.id) === String(dr.to) ? 'on' : ''}" data-a="msgTo" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <textarea id="mt" class="search" placeholder="${esc(t('write_team'))}" maxlength="1000">${esc(dr.text)}</textarea>
      <button class="btn" style="min-height:56px;font-size:18px" data-a="sendMsg">${t('send')}</button>
      <p class="note" style="font-size:14px">${t('msg_note')}</p></div>`);
    const x = $('mt'); x.addEventListener('input', () => { dr.text = x.value; }); setTimeout(() => x.focus(), 50);
  },
  msgTo(el) { DRAFT.msg.to = el.dataset.id; el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  async sendMsg(el) {
    const dr = DRAFT.msg, v = $('mt').value.trim(); if (!v) { toast(t('write_msg')); return; }
    el.disabled = true;
    const ok = await write('chef_message', Object.assign({ text: v }, dr.to === 'all' ? {} : { to_user_id: +dr.to }), t('msg_sent'));
    if (ok) delete DRAFT.msg; else el.disabled = false;
  },
  readMsg(el) { const d = API.peek('shift'); const m = d && d.messages.find(x => x.id === el.dataset.id); if (m && !m.read) { m.read = true; render(true); API.act('message_read', { ref_id: m.id }).catch(() => {}); } },
  readReport(el) { const d = API.peek('shift'); const r = d && (d.reports || []).find(x => x.id === el.dataset.id); if (r && !r.read) { r.read = true; render(true); API.act('report_read', { ref_id: r.id }).catch(() => {}); } },
  ask() {
    need('recipes', null, 10 * 60000);
    sheet(`<div class="page"><h1 style="font-size:28px">${t('find')}</h1>
      <input id="ask" class="search" type="search" placeholder="${esc(t('find_ph'))}" autocomplete="off" enterkeyhint="search">
      <div id="askout"></div>
      <section><h2>${t('language')}</h2><div class="seg">${I.langs.map(l => `<button class="${I.lang === l ? 'on' : ''}" data-a="lang" data-k="${l}">${I.names[l]}</button>`).join('')}</div></section>
      <section><h2>${esc(ME.name)}</h2><div class="list">
        <button class="row" data-a="switchUser"><span class="main"><div class="name">${t('switch_user')}</div><div class="meta">${t('switch_sub')}</div></span></button>
        <button class="row" data-a="resetUi"><span class="main"><div class="name">${t('reset')}</div><div class="meta">${t('reset_sub')}</div></span></button>
      </div></section>
      <p class="note" style="font-size:13px">Brigade 2.0 ${esc(window.APP_CONFIG.build)} · ${t('reserved')}</p></div>`);
    const i = $('ask'); let tm; i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { $('askout').innerHTML = findResults(i.value); }, 200); });
  },
  lang(el) { I.set(el.dataset.k, true); closeSheet(); render(true); },
  resetUi() { S = fresh(); closeSheet(); render(); },
  async switchUser() { closeSheet(); await API.logout(); signedOut(); },
  pin(el) { pinPress(el.dataset.k); },
};
function findResults(q) {
  q = q.trim().toLowerCase(); if (q.length < 2) return '';
  const hit = s => String(s || '').toLowerCase().includes(q), out = [];
  ((API.peek('shift') || {}).items || []).filter(x => hit(x.name)).slice(0, 6).forEach(x => out.push(`<button class="row" data-a="openPrep" data-id="${x.id}"><span class="main"><div class="name">${esc(x.name)}</div><div class="meta">${t('prep_word')} · ${esc(x.station || '')}</div></span><span class="chev">›</span></button>`));
  ((API.peek('recipes') || {}).recipes || []).filter(x => hit(x.title)).slice(0, 10).forEach(x => out.push(`<button class="row" data-a="openRecipe" data-r="${x.id}"><span class="main"><div class="name">${esc(x.title)}</div><div class="meta">${t('recipe_word')} · ${esc(cat(x.category))}</div></span><span class="chev">›</span></button>`));
  return out.length ? `<div class="list">${out.join('')}</div>` : `<p class="note">${esc(t('nothing_for', { q }))}</p>`;
}
document.addEventListener('click', ev => { const el = ev.target.closest('[data-a]'); if (!el) return; const f = A[el.dataset.a]; if (f) { ev.preventDefault(); f(el); } });
window.addEventListener('resize', layout);

/* ============ LOGIN (once per phone; the server keeps the session 30 days from last use) ============ */
let pinBuf = '', pinBusy = false;
function showLogin(msg) {
  const Lg = $('login'); Lg.hidden = false;
  ['top', 'main', 'worlds'].forEach(id => { $(id).style.visibility = 'hidden'; });
  Lg.innerHTML = `<div style="text-align:center"><div class="eyebrow">${t('kitchen')}</div><h1>Brigade</h1><div class="sub" style="margin-top:8px">${t('enter_pin')}</div></div>
    <div class="dots" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="loginerr" id="lerr">${esc(msg || '')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-a="pin" data-k="${k}">${k}</button>`).join('')}<button class="k0" data-a="pin" data-k="0">0</button><button class="del" data-a="pin" data-k="del">${t('delete')}</button></div>
    <div class="seg" style="width:100%;max-width:320px">${I.langs.map(l => `<button class="${I.lang === l ? 'on' : ''}" data-a="loginLang" data-k="${l}">${I.names[l]}</button>`).join('')}</div>`;
}
A.loginLang = el => { I.set(el.dataset.k, true); showLogin(''); };
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
  showLogin(j && j.error === 'offline' ? t('no_conn') : j && j.error === 'cooldown' ? t('cooldown') : t('pin_bad'));
  const d = $('dots'); if (d) d.classList.add('shake');
}
function signedIn(user) {
  if (ME && ME.id !== user.id) wipeLocal();
  ME = user;
  if (!I.hasChoice() && ['en', 'it', 'es'].includes(user.lang)) I.set(user.lang, false);   // the person's Brigade language, unless chosen on this phone
  loadUi(); hideLogin(); render();
}
function signedOut() { ME = null; wipeLocal(); $('main').innerHTML = ''; $('tabs').innerHTML = ''; closeSheet(); showLogin(''); }
window.addEventListener('app-signed-out', () => { API.clearToken(); if (ME) toast(t('signed_out')); signedOut(); });

(async function boot() {
  I.set(I.lang, false);
  if (!API.hasToken()) { signedOut(); return; }
  try { const j = await API.call('me'); signedIn(j.user); }
  catch (e) {
    if (e.status === 401) return;                // handled by app-signed-out
    $('main').innerHTML = `<div class="page"><div class="err"><b>${t('no_conn')}</b><br><button class="lnk" onclick="location.reload()">${t('try_again')}</button></div></div>`;
  }
})();
})();
