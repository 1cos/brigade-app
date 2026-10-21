/* Brigade 2.0 — Master Recipe Engine screen (B-49). ONE screen: read, scale, prepare, register production, suggest.
   Chef: "Modifica ricetta" on the same screen (draft → publish = new version). Visual reference: B-49 prototype 2.
   Every number comes from the shared engine (mre_engine.js, the same file the server runs). Nothing here writes to main Brigade:
   the server keeps every write inside the isolated lab (schema mre). Quantities are bold and edited in place: no boxes. */
(function () {
const API = window.AppApi, I = window.I18N;
const T = (k, v) => I.t('m_' + k, v);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const E = () => window.MRE;
const loc = () => I.locale();
const nf = (x, d) => Number(x).toLocaleString(loc(), { maximumFractionDigits: d == null ? 2 : d, useGrouping: false });
const usd = x => x == null ? '—' : '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: x < 1 ? 3 : 2, maximumFractionDigits: x < 1 ? 3 : 2 });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
const WORK = {};                 // Chef's working copy per recipe (memory only; saved to the server draft automatically)
const UI = {};                   // per recipe: production / suggestion forms, last messages (memory only)
const ui = id => UI[id] || (UI[id] = {});
let H = null;                    // helpers from app.js: { need, peek, render, toast, openRecipe, isChef, me }

function data(id) { return H.need('mre_recipe', { id }, 5 * 60000); }
function ctxFor(d, id, rootDoc, withDrafts) {
  // official numbers by default; the Chef's drafts of sub-recipes only in Preview (editing, or a lab-only proposal)
  const dd = withDrafts && d.draft_docs ? d.draft_docs : {};
  return { doc: x => x === id && rootDoc ? rootDoc : (dd[x] || d.docs[x]), facts: x => d.facts[x], measures: d.measures };
}
let PREVIEW = false;              // true while the Chef edits or looks at a lab proposal: sub-recipe drafts are shown
function lineName(d, ln) {
  if (ln.kind === 'recipe') { const s = (PREVIEW && d.draft_docs && d.draft_docs[ln.ref]) || d.docs[ln.ref]; return s ? I.dn(s.title) : '?'; }   // display name (Grated Parmesan); ids unchanged
  const f = d.facts[ln.ref] || {};
  return (I.lang === 'it' && f.name_it) || (I.lang === 'es' && f.name_es) || f.name || '?';
}
const stepText = (s) => (s && (s[I.lang] || s.it || s.en || s.es)) || '';
const stepTitle = (s) => s && (s['title_' + I.lang] || s.title_it || s.title_en || '');

/* ---------- names you can tap: ingredient → its card, sub-recipe → its recipe ---------- */
function navName(l, name) {
  if (l.kind === 'recipe') return `<button class="mr-sub" data-m="sub:${esc(l.id)}">${esc(name)} ›</button>`;
  return `<button class="mr-sub mr-ingl" data-a="openIng" data-id="${esc(l.ref)}">${esc(name)}</button>`;
}

/* ---------- bold, tappable quantity ---------- */
// R1.14: data-u is the UNIT (portion, pz, kg…), never the label shown ("porz."): the label coming back as a unit was the iPhone error
const Q = (key, n, u, extra, unit) => `<b class="mq" data-mq="${esc(key)}" data-u="${esc(unit != null ? unit : (u || ''))}"><span class="n">${esc(n)}</span>${u ? ' ' + esc(u) : ''}</b>${extra || ''}`;
const UL = { 'porz.': 'u_portion', nidi: 'u_nest', pz: 'u_pz', case: 'u_case' };
const uLabel = u => UL[u] ? T(UL[u]) : u;
const unitOf = (l, s) => E().dimOf(l.unit) === 'c' ? E().normUnit(l.unit) : s.u;

/* ============ RENDER ============ */
/* R1.13 (Chef 20/10 "TRUST · EASY · CLEAN"): what the Chef sees is the final interface. One recipe, its active draft opened by
   itself, Edit → Preview → Save draft. Technical notes (source, lock, lab) only under "Technical info". Protections unchanged. */
function mode(d, p) { return H.isChef() && p.edit && WORK[p.id] ? (p.pv ? 'preview' : 'edit') : 'view'; }
function showsDraft(d, p) { return d.source === 'lab' || (H.isChef() && !!d.draft && p.view !== 'live'); }
function shownDoc(d, p) { const m = mode(d, p); if (m !== 'view') return WORK[p.id]; return showsDraft(d, p) ? (d.draft || d.doc) : d.doc; }
function render(p) {
  const d = data(p.id);
  if (!d) return null;                                   // app shows the loading state
  if (!E()) return `<div class="mr"><p class="mr-muted">${T('loading_engine')}</p></div>`;
  // opened with "Edit" from any recipe card (B-25): start the editor on the open draft, or on the recipe in use
  if (p.startEdit && H.isChef()) { WORK[p.id] = JSON.parse(JSON.stringify(d.draft || d.doc)); p.edit = true; p.pv = false; p.adv = false; p.panel = null; p.saved = !!d.draft; delete p.startEdit; }
  const chef = H.isChef(), m = mode(d, p), edit = m === 'edit', pv = m === 'preview';
  const doc = shownDoc(d, p), draftView = m === 'view' && showsDraft(d, p) && !!d.draft;
  const f = m !== 'view' ? 1 : (p.f > 0 ? p.f : 1);
  PREVIEW = m !== 'view' || showsDraft(d, p);
  const ctx = ctxFor(d, p.id, doc, PREVIEW), pref = p.imp ? 'imperial' : 'metric';
  const y = doc.yield || {}, row = H.listRow ? H.listRow(p.id) : null;
  let h = `<div class="mr${edit ? ' mr-edit' : ''}">`;
  const fl = ui(p.id).flash; if (fl && Date.now() - fl.at < 8000) h += `<div class="mr-flash${fl.bad ? ' bad' : ''}" role="status">${esc(fl.msg)}</div>`;

  // editor bar: Edit | Preview, and Save draft — the whole path on one line
  if (m !== 'view') h += `<div class="mr-ebar"><div class="mr-vs" role="tablist"><button class="${edit ? 'on' : ''}" data-m="pv:0" role="tab" aria-selected="${edit}">${T('tab_edit')}</button><button class="${pv ? 'on' : ''}" data-m="pv:1" role="tab" aria-selected="${pv}">${T('tab_preview')}</button></div><button class="mr-btn dark" data-m="savedraft">${T('save_draft')}</button></div>`;

  // head
  const tags = [row && row.prep ? `<span class="rm-tag">Prep</span>` : '', row && row.menu ? `<span class="rm-tag menu">Menu Item</span>` : '', `<span class="mr-cat">${esc(cat(doc.category))}</span>`].join('');
  h += `<div class="mr-head"><div class="mr-row1"><span class="mr-tags">${tags}</span>${chef && m === 'view' ? `<button class="mr-editbtn" data-m="edit">${T('edit')}</button>` : ''}</div>`;
  if (chef && m === 'view' && d.source !== 'lab' && d.draft) h += `<div class="mr-vs" role="tablist"><button class="${draftView ? 'on' : ''}" data-m="view:draft">${T('v_draft', { v: d.draft._version })}</button><button class="${!draftView ? 'on' : ''}" data-m="view:live">${T('v_live')}</button></div>`;
  else if (chef && d.source === 'lab' && m === 'view') h += `<div><span class="rm-draft">${T('v_new')}</span></div>`;
  if (m !== 'view') h += `<div class="mr-estate">${T('editing2', { v: (d.draft && d.draft._version) || (Math.max(0, ...(d.versions || []).map(v => v.version)) + 1) })}${p.saved ? ' · ' + T('saved_word') : ''}</div>`;
  h += edit ? `<h1 class="mr-title" contenteditable="true" data-mt="title" data-mred="1">${esc(doc.title)}</h1>` : `<h1 class="mr-title">${esc(I.dn(doc.title))}</h1>`;
  const parts = [];
  if (edit) {      // R1.14 (Chef 21/10): a prep counted in pieces has its yield in portions; the weight is optional, never required
    parts.push(`${T('yield')} ${Q('y:p', Number(y.portions) > 0 ? nf(y.portions, 1) : '—', '')} ${Number(y.portions) === 1 ? T('portion') : T('portions')}`);
    parts.push(`<span class="mr-muted">${T('weight_opt')}</span> ${Q('y:g', Number(y.g) > 0 ? nf(y.g, 0) : '—', 'g')}`);
  } else {
    if (Number(y.g) > 0) { const s = E().showMass(y.g * f, pref, loc()); parts.push(`${T('yield')} ${Q('y:g', s.n, s.u)}`); }
    if (Number(y.portions) > 0) parts.push(`${Q('y:p', nf(y.portions * f, 1), '')} ${Math.abs(y.portions * f - 1) < 1e-9 ? T('portion') : T('portions')}`);
  }
  if (m === 'view' && !(Number(y.portions) === 1 && !(Number(y.g) > 0))) parts.push(`${Q('y:l', nf(f, 2), '')} ${f === 1 ? T('batch') : T('batches')}`);   // a single dish has no "batch"
  h += `<div class="mr-yield">${parts.join(' · ')}</div>`;
  if (ui(p.id).err && /^y:/.test(ui(p.id).err.key)) h += `<div class="mr-inlerr" role="status">${esc(ui(p.id).err.msg)}</div>`;
  if (edit) h += `<div class="mr-meta">${T('yield_label')}: <span contenteditable="true" data-mt="label" data-mred="1" class="mr-txt">${esc(y.label || '')}</span>${p.adv ? ` · ${T('stock')}: <select data-ms="has_stock" class="mr-sel"><option value="1" ${doc.has_stock ? 'selected' : ''}>${T('yes')}</option><option value="0" ${!doc.has_stock ? 'selected' : ''}>${T('no')}</option></select>` : ''}</div>`;
  if (m === 'view' && f !== 1) {
    const rounded = (doc.lines || []).filter(l => E().dimOf(l.unit) === 'c').map(l => ({ l, s: E().showLine(l, f, ctx, pref, loc()) })).filter(x => x.s.theo);
    const fromParent = p.ref && p.ref.startsWith(T('from_parent', { t: '' }).trim());   // opened from a dish: "for Butter Spinach"
    h += `<div class="mr-scaled">${fromParent ? esc(p.ref[0].toUpperCase() + p.ref.slice(1)) : T('scaled_from', { ref: esc(p.ref || '') })}${rounded.map(x => ' · ' + T('rounded', { name: esc(lineName(d, x.l).toLowerCase()), v: x.s.theo })).join('')} · <button class="mr-link acc" data-m="reset">${T('reset')}</button></div>`;
  }
  if (chef && m === 'view') { const c = !PREVIEW && d.cost ? d.cost : E().cost(p.id, 1, ctx); const pp = c.per_portion;
    h += `<div class="mr-fc"><button class="mr-link" data-m="p:cost">${T('food_cost')}</button> <b>${pp == null ? usd(c.food) + ' / ' + T('batch') : usd(pp) + ' / ' + T('portion')}</b> <span class="${c.complete ? 'mr-okc' : 'mr-bad'}">· ${c.complete ? T('fc_complete') : T('fc_partial')}</span></div>`;
    const rv = d.recipe && d.recipe.review;
    if (rv) h += `<div class="mr-ok">✓ ${T('verified_by', { by: esc(rv.by || ''), at: esc(dt(rv.at)) })}</div>`;
    h += issuesHtml(d, p.id, ctx, p.iss); }
  h += `</div>`;
  if (edit) h += approvedReminder(d);
  if (pv) h += changeBox(p, d, doc);                    // Preview: what changes comes first, then the recipe as it will read

  // ingredients + steps
  h += `<div class="mr-cols"><div class="mr-left"><div class="mr-sec"><span>${T('ingredients')}</span>${edit ? `<button class="mr-link ${p.adv ? 'acc' : ''}" data-m="adv">${T('advanced')}${p.adv ? ' ✓' : ''}</button>` : m === 'view' ? `<button class="mr-link" data-m="units">${p.imp ? 'oz · <b>g</b>' : 'g · <b>oz</b>'}</button>` : ''}</div>${edit && p.adv ? `<p class="mr-muted mr-advnote">${T('adv_note')}</p>` : ''}<ul class="mr-ings">`;
  for (const l of doc.lines || []) {
    const s = E().showLine(l, f, ctx, pref, loc()), name = lineName(d, l);
    const nameHtml = navName(l, name);
    const qty = s.status === 'da_definire' ? `<span class="mr-muted">${T('to_define')}</span>` : pv ? `<b class="mq-ro">${esc(s.n)}${s.u ? ' ' + esc(uLabel(s.u)) : ''}</b>` : Q('l:' + l.id, s.n, uLabel(s.u), '', unitOf(l, s));
    const ie = ui(p.id).err && ui(p.id).err.key === 'l:' + l.id ? `<li class="mr-inlerr" role="status">${esc(ui(p.id).err.msg)}</li>` : '';   // the message stays next to its line, never over the buttons
    if (!edit) { h += `<li><span class="mr-nm">${nameHtml}${l.note ? `<span class="mr-note">${esc(l.note)}</span>` : ''}</span>${qty}</li>${ie}`; continue; }
    const units = ['g', 'kg', 'ml', 'l', 'pz', 'oz', 'lb', 'nests'], ucur = l.unit || '';
    // editor line: name, quantity and unit first; role and technical note only under Advanced (logic unchanged)
    const stx = statusOf(d, l), bad = /mr-bad/.test(stx), adv = p.adv;
    h += `<li class="mr-eline"><span class="mr-nm">${nameHtml}${l.kind === 'recipe' ? ` <span class="mr-muted mr-kind">${T('sub_recipe')}</span>` : ''}
        ${bad || adv ? `<span class="mr-note">${stx}</span>` : ''}
        ${adv && !doc.has_stock ? `<span class="mr-note mr-adv">${T('role_sale')}</span>` : ''}${adv && doc.has_stock ? `<span class="mr-note mr-adv">${T('role')}: <select data-ms="role:${esc(l.id)}" class="mr-sel">${['produzione', 'al_piatto', 'imballo'].map(r => `<option value="${r}" ${l.role === r ? 'selected' : ''}>${T('role_' + r)}</option>`).join('')}</select></span>` : ''}${adv ? `
        <span class="mr-note mr-adv">${T('note')}: <span contenteditable="true" class="mr-txt" data-mt="note:${esc(l.id)}" data-mred="1">${esc(l.note || '')}</span></span>` : (l.note ? `<span class="mr-note">${esc(l.note)}</span>` : '')}
</span>
      <span class="mr-eq">${Q('l:' + l.id, l.qty == null ? '—' : nf(l.qty, 3), '')}<select data-ms="unit:${esc(l.id)}" class="mr-sel">${[...new Set([ucur, ...units])].map(u => `<option ${u === ucur ? 'selected' : ''}>${esc(u || '—')}</option>`).join('')}</select><button class="mr-x" data-m="del:${esc(l.id)}" aria-label="${esc(T('remove'))}" title="${esc(T('remove'))}">×</button></span></li>`;
  }
  h += `</ul>`;
  if (edit) h += addHtml(p);
  h += `</div><div class="mr-right"><div class="mr-sec"><span>${T('method')}</span></div>`;
  const steps = doc.steps || [];
  if (!steps.length && !edit) h += `<p class="mr-muted">${chef ? T('no_steps_chef') : T('no_steps')}</p>`;
  h += `<ol class="mr-steps">`;
  steps.forEach((s, i) => {
    const txt = stepText(s), title = stepTitle(s);
    const parts = E().stepParts(txt, doc, f, loc());
    if (edit) {
      const inner = parts.map(x => x.t === 'q' ? `<b class="mr-tok" contenteditable="false" data-tok="${esc(x.id)}">${esc(x.v)}</b>` : esc(x.v)).join('');
      h += `<li><p contenteditable="true" class="mr-txt" data-mt="step:${i}" data-mred="1">${inner}</p><button class="mr-link" data-m="delstep:${i}">${T('remove')}</button></li>`;
    } else {
      const html = parts.map(x => x.t === 'q' ? (pv ? `<b>${esc(x.v)}</b>` : `<b class="mq" data-mq="l:${esc(x.id)}" data-u="${esc((doc.lines.find(l => l.id === x.id) || {}).unit || '')}" data-intext="1"><span class="n">${esc(x.v)}</span></b>`) : esc(x.v)).join('');
      const loose = f !== 1 && /\d\s?(g|kg|ml|l|oz|lb)\b/i.test(parts.filter(x => x.t === 'txt').map(x => x.v).join(' '));
      h += `<li><p>${title ? `<b>${esc(title)}.</b> ` : ''}${html}${loose ? ` <span class="mr-muted">${T('loose_numbers')}</span>` : ''}</p></li>`;
    }
  });
  h += `</ol>${edit ? `<button class="mr-link acc" data-m="addstep">${T('add_step')}</button>` : ''}`;
  if (m === 'view' && !showsDraft(d, p)) h += prodHtml(p, d, doc, f, ctx);     // production is registered on the recipe in use, never on a draft
  h += `</div></div>`;

  if (m === 'view') {
    // the Chef's review: one tap marks the recipe as verified and opens the next one (not a publication)
    if (chef) { const rv = d.recipe && d.recipe.review, nx = H.next ? H.next(p.id) : null;
      h += `<div class="mr-review">${rv ? `<button class="mr-link" data-m="unreview">${T('unreview')}</button>${nx ? `<button class="mr-btn dark grow" data-m="next">${T('next')} ›</button>` : ''}`
        : `<button class="mr-btn pri grow" data-m="review">✓ ${nx ? T('verify_next') : T('verify')}</button>${nx ? `<button class="mr-btn" data-m="next">${T('skip')} ›</button>` : ''}`}</div>`; }
    const links = [];
    if (chef) links.push(['cost', T('food_cost')]);
    links.push(['struct', T('structure')], ['hist', T('history')]);
    if (chef) { const n = (d.suggestions || []).filter(s => s.status === 'in attesa').length; links.push(['sug', T('suggestions') + (n ? ' ' + T('n_new', { n }) : '')]); }
    if (chef && d.diffs && d.diffs.length) links.push(['diffs', T('differences') + ` (${d.diffs.length})`]);
    if (chef) links.push(['tech', T('tech')]);
    h += `<div class="mr-more">${links.map(([k, l]) => `<button class="mr-link ${p.panel === k ? 'acc' : ''}" data-m="p:${k}">${l}</button>`).join('')}</div>`;
    if (p.panel) h += panelHtml(p, d, doc, ctx);
  }
  if (edit) h += editFoot(p, d, doc);
  if (pv) h += pvFoot(p, d, doc);
  h += `</div>`;
  return h;
}
const cat = c => { const x = String(c || '').split('|')[0].trim(); return x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : ''; };

/* what a line still needs, from the SAME rule as the food cost (R1.14): a weight is asked only when the price is per gram */
function statusOf(d, l) {
  if (l.kind === 'recipe') { const s = (PREVIEW && d.draft_docs && d.draft_docs[l.ref]) || d.docs[l.ref]; if (!s) return `<span class="mr-bad">${T('missing_sub')}</span>`;
    const fr = E().subFraction(l.qty == null ? 0 : l.qty, l.unit, s); return fr.status === 'ok' ? esc(T('sub_recipe')) : `<span class="mr-bad">${esc(T('s_' + fr.status))}</span>`; }
  const f = d.facts[l.ref];
  if (!f) return `<span class="mr-bad">${T('missing_product')}</span>`;
  const a = E().ingredientAmount(l.qty == null ? 0 : l.qty, l.unit, f, d.measures);
  if (a.status === 'da_definire' || a.status === 'unita_sconosciuta') return `<span class="mr-bad">${T('need_unit')}</span>`;
  const c = E().leafCost({ dim: a.dim, g: a.g, ml: a.ml != null ? a.ml : (a.dim === 'v' ? a.val : null), count: a.dim === 'c' ? a.val : null, status: a.status }, f);
  const pack = l.role === 'imballo' || f.policy === 'non_food';
  if (!H.isChef()) return a.status === 'densita_mancante' ? `<span class="mr-bad">${T('need_density')}</span>` : esc(T('ok'));
  if (c.cost != null) return a.dim === 'c' && !(f.piece_g) ? esc(T('by_piece')) : esc(T('ok'));
  if (pack) return `<span class="mr-warnm">${T('pack_no_price')}</span>`;
  if (c.status === 'prezzo_mancante') return `<span class="mr-bad">${T('no_price')}</span>`;
  if (c.status === 'peso_pezzo_mancante') return `<span class="mr-bad">${T('need_piece')}</span>`;
  if (c.status === 'densita_mancante') return `<span class="mr-bad">${T('need_density')}</span>`;
  return `<span class="mr-bad">${esc(T('s_' + c.status))}</span>`;
}
/* open problems of the recipe shown (Chef): visible, folded under one line, never mixed with the review mark */
function issueText(d, x, ctx) {
  const nm = x.ref ? (((ctx.doc(x.ref) || {}).title && I.dn(ctx.doc(x.ref).title)) || ((I.lang === 'it' && (d.facts[x.ref] || {}).name_it) || (d.facts[x.ref] || {}).name) || '?') : '';
  const where = x.sub ? ' ' + T('in_sub', { t: I.dn(((ctx.doc(x.sub) || {}).title) || '') }) : '';
  const what = x.code === 'conversione' ? T('s_' + x.status) : T('i_' + x.code);
  return `${nm ? `<b>${esc(nm)}</b>: ` : ''}${esc(what)}${esc(where)}`;
}
function issuesHtml(d, id, ctx, open) {
  const iss = E().issues ? E().issues(id, ctx) : [];
  if (!iss.length) return `<div class="mr-okc mr-issok">${T('no_issues')}</div>`;
  return `<details class="mr-issues"${open ? ' open' : ''}><summary data-m="iss">${T('open_issues', { n: iss.length })}</summary><ul>${iss.map(x => `<li>${issueText(d, x, ctx)}</li>`).join('')}</ul></details>`;
}

function approvedReminder(d) {
  const a = (d.suggestions || []).filter(s => s.status === 'approvato');
  return a.map(s => `<div class="mr-scaled">${T('approved_sug')}: “${esc(s.text)}” — ${esc(s.by || '')}</div>`).join('') +
    '';
}

function addHtml(p) {
  const w = ui(p.id), r = w.search || {};
  return `<div class="mr-add"><input id="mrAdd" class="mr-input" data-mred="1" placeholder="${esc(T('add_placeholder'))}" value="${esc(w.q || '')}" autocomplete="off">
    ${(r.ingredients || []).map(x => `<button class="mr-link" data-m="addi:${x.id}">${esc((I.lang === 'it' && x.name_it) || x.name)}</button>`).join(' · ')}
    ${(r.recipes || []).length ? '<br>' + r.recipes.map(x => `<button class="mr-link" data-m="addr:${x.id}">${esc(x.title)} (${esc(T('sub_recipe'))})</button>`).join(' · ') : ''}</div>`;
}

function prodHtml(p, d, doc, f, ctx) {
  const w = ui(p.id), chef = H.isChef();
  let h = `<div class="mr-prod">`;
  if (w.prod) {
    const exp = Number(doc.yield && doc.yield.g) > 0 ? doc.yield.g * f : null;
    const real = w.prod.real != null ? w.prod.real : exp;
    h += `<div>${T('how_much')} ${real != null ? Q('real', nf(real, 0), 'g') : Q('real', '—', 'g')} ${exp != null ? `<span class="mr-muted">${T('expected', { g: nf(exp, 0) })}</span>` : ''}</div>`;
    if (w.prod.diff) {
      h += `<div>${T('tap_changed')}</div><ul class="mr-ings">`;
      for (const l of doc.lines || []) {
        if (l.role === 'al_piatto') continue;
        const s = E().showLine(l, f, ctx, 'metric', loc()), act = w.prod.used[l.id];
        h += `<li><span class="mr-nm">${esc(lineName(d, l))}${act != null ? `<span class="mr-note">${T('planned')} ${esc(s.n)} ${esc(s.u)}</span>` : ''}</span>${Q('act:' + l.id, act != null ? nf(act, 2) : s.n, s.u)}</li>`;
      }
      h += `</ul><div class="mr-acts"><button class="mr-link acc" data-m="prodsave">${T('register')}</button><button class="mr-link" data-m="prodcancel">${T('cancel')}</button></div>`;
    } else h += `<div>${T('changed_q')}</div><div class="mr-acts"><button class="mr-link acc" data-m="prodsave">${T('no_register')}</button><button class="mr-link" data-m="proddiff">${T('yes')}</button><button class="mr-link" data-m="prodcancel">${T('cancel')}</button></div>`;
  } else {
    if (w.prodMsg) h += `<div class="mr-done">${esc(w.prodMsg)}</div>`;
    h += `<div class="mr-acts"><button class="mr-link acc" data-m="prod">${T('register_prod')}</button>${!chef && !w.sugOpen ? `<button class="mr-link" data-m="sug">${T('suggest')}</button>` : ''}</div>`;
    if (!chef && w.sugOpen) h += `<div class="mr-ask"><label for="mrSug">${T('suggest_q')}</label><textarea id="mrSug" class="mr-area" rows="3" data-mred="1">${esc(w.sugText || '')}</textarea><div class="mr-acts"><button class="mr-link acc" data-m="sugsend">${T('suggest_send')}</button><button class="mr-link" data-m="sugcancel">${T('cancel')}</button></div></div>`;
    if (!chef && w.sugMsg) h += `<div class="mr-done">${esc(w.sugMsg)}</div>`;
  }
  return h + `</div>`;
}

function panelHtml(p, d, doc, ctx) {
  const kv = (a, b) => `<div class="mr-kv"><span>${a}</span><span>${b}</span></div>`;
  if (p.panel === 'cost' && H.isChef()) {
    const local = E().cost(p.id, 1, ctx), c = !PREVIEW && d.cost ? d.cost : local;
    const pp = c.per_portion;
    let h = `<div class="mr-panel">` + kv(T('lot_cost'), `<b>${usd(c.food)}</b>`) + kv(T('portion_cost', { n: doc.yield && doc.yield.portions ? nf(doc.yield.portions, 1) : '—' }), `<b>${pp == null ? '—' : usd(pp)}</b>`)
      + kv(T('state'), c.complete ? T('complete') : T('incomplete', { n: c.missing }));
    for (const l of doc.lines) {
      const b = c.byLine[l.id] || {}, f = d.facts[l.ref] || {}, pr = f.price;
      const src = l.kind === 'recipe' ? T('sub_recipe') : pr ? `${esc(pr.vendor || '')}${pr.last_invoice_date ? ' · ' + esc(pr.last_invoice_date) : ''}` : (f.policy === 'non_food' ? T('packaging') : T('no_price'));
      h += kv(`${esc(lineName(d, l))}<br><span class="mr-muted">${src}</span>`, b.missing ? `${b.cost ? usd(b.cost) + ' + ' : ''}<span class="mr-bad">${T('missing')}</span>` : usd(b.cost || 0));
    }
    if (c.pack) h += kv(T('packaging'), usd(c.pack));
    h += `<p class="mr-muted">${T('cost_note')}${Math.abs((local.food || 0) - (c.food || 0)) > 0.001 ? ' ' + T('cost_mismatch') : ''}</p></div>`;
    return h;
  }
  if (p.panel === 'struct') {
    let h = `<div class="mr-panel">`;
    for (const l of doc.lines) h += kv(`${esc(lineName(d, l))}<br><span class="mr-muted">${l.kind === 'recipe' ? T('sub_recipe') : esc((d.facts[l.ref] || {}).name || '')}</span>`, `${T('role_' + l.role)}<br><span class="mr-muted">${statusOf(d, l)}</span>`);
    h += kv(T('stock'), doc.has_stock ? T('yes') + (doc.stock && doc.stock.length ? ' · ' + doc.stock.map(s => esc(s.name)).join(', ') : '') : T('no'));
    const por = Number(doc.yield && doc.yield.portions) > 0 ? doc.yield.portions : null;
    if (por) {
      const sale = E().explode(p.id, 1 / por, 'vendita', ctx);
      h += `<p class="mr-sim">${T('sim_sale')}</p>` + simList(d, sale);
      // CD-066 rule 5: full theoretical consumption, with or without a registered production
      h += `<p class="mr-sim">${T('sim_theo')}</p>` + simList(d, E().explode(p.id, 1 / por, 'costo', ctx).filter(x => x.kind !== 'prep'));
    }
    if (doc.has_stock) { h += `<p class="mr-sim">${T('sim_prod')}</p>` + simList(d, E().explode(p.id, 1, 'produzione', ctx)); }
    h += `<p class="mr-sim">${T('stock_title')}</p><p class="mr-muted">${T('stock_note')}</p><p class="mr-muted">${T('sim_note')}</p></div>`;
    return h;
  }
  if (p.panel === 'hist') {
    let h = `<div class="mr-panel">`;
    for (const v of d.versions || []) h += kv(`<b>v${v.version}</b> · ${esc(T('state_' + v.state))} · ${esc(dt(v.at))}${v.by ? ' · ' + esc(v.by) : ''}<br><span class="mr-muted">${esc(v.reason || '')}</span>`,
      !d.publish_locked && v.version === d.recipe.current_version ? `<span class="mr-muted">${T('in_use')}</span>` : (H.isChef() && v.state !== 'bozza' ? `<button class="mr-link acc" data-m="restore:${v.version}">${T(d.publish_locked ? 'restore_draft' : 'restore')}</button>` : ''));
    if ((d.productions || []).length) { h += `<p class="mr-sim">${T('productions')}</p>`; for (const r of d.productions) h += kv(`${esc(dt(r.created_at))} · v${r.version} · ${esc(r.by || '')}<br><span class="mr-muted">${esc(r.reference || '')}</span>`, `${r.yield_real_g != null ? nf(r.yield_real_g, 0) + ' g' : ''}${r.changed && r.changed.length ? '<br><span class="mr-muted">' + r.changed.map(c => esc(c.name) + ' ' + nf(c.real, 2) + ' ' + esc(c.unit) + ' (' + T('planned') + ' ' + nf(c.planned, 2) + ')').join(', ') + '</span>' : ''}`); }
    return h + `<p class="mr-muted">${T('hist_note')}</p></div>`;
  }
  if (p.panel === 'sug' && H.isChef()) {
    const list = d.suggestions || [];
    let h = `<div class="mr-panel">${list.length ? '' : `<p class="mr-muted">${T('no_suggestions')}</p>`}`;
    for (const s of list) h += `<div class="mr-sugrow"><span class="mr-muted">${esc(dt(s.at))} · ${esc(s.by || '')} · v${s.version} · <b>${esc(T('st_' + s.status.replace(' ', '_')))}</b></span><span>${esc(s.text)}</span>
      <span class="mr-acts"><button class="mr-link acc" data-m="dec:${s.id}:approvato">${T('approve')}</button><button class="mr-link" data-m="dec:${s.id}:rifiutato">${T('reject')}</button><button class="mr-link" data-m="dec:${s.id}:in sospeso">${T('hold')}</button></span></div>`;
    return h + `<p class="mr-muted">${T('sug_note')}</p></div>`;
  }
  if (p.panel === 'tech' && H.isChef()) {          // the only place for the technical notes (source, lab, lock)
    let h = `<div class="mr-panel">` + kv(T('t_source'), d.source === 'lab' ? T('src_lab') : T('src_official', { t: dt(d.read_at) }))
      + kv(T('t_draft'), d.draft ? T('t_draft_v', { v: d.draft._version, at: dt((d.versions || []).find(v => v.state === 'bozza')?.at) }) : T('t_none'))
      + kv(T('t_publish'), d.publish_locked ? T('t_locked') : T('t_test')) + kv(T('t_review'), d.recipe && d.recipe.review ? T('verified_by', { by: esc(d.recipe.review.by || ''), at: esc(dt(d.recipe.review.at)) }) : T('t_not_reviewed'));
    return h + `<p class="mr-muted">${T('locked_note')} ${T('hist_official')}</p></div>`;
  }
  if (p.panel === 'diffs' && H.isChef()) {
    let h = `<div class="mr-panel"><p class="mr-muted">${T('diffs_intro')}</p>`;
    for (const x of d.diffs || []) h += kv(`<b>${esc(T('diff_' + x.type))}</b>${x.distinta ? `<br>${T('bom')}: ${esc(x.distinta)}` : ''}${x.testo ? `<br>${T('text')}: ${esc(x.testo)}` : ''}`, `<span class="mr-muted">${esc(x.note || '')}</span>`);
    h += d.diffs_checked ? `<p class="mr-muted">${T('diffs_checked', { by: esc(d.diffs_checked.by || ''), at: esc(dt(d.diffs_checked.at)) })}</p>` : `<button class="mr-link acc" data-m="checkdiffs">${T('mark_checked')}</button>`;
    return h + `</div>`;
  }
  return '';
}
function simList(d, rows) {
  if (!rows.length) return `<p class="mr-muted">—</p>`;
  return rows.map(x => {
    if (x.kind === 'prep') { const s = (PREVIEW && d.draft_docs && d.draft_docs[x.ref]) || d.docs[x.ref]; return `<div class="mr-kv"><span>${esc(s ? s.title : '?')} <span class="mr-muted">(${T('prep')})</span></span><span>${x.portions != null ? nf(x.portions, 2) + ' ' + (Math.abs(x.portions - 1) < 1e-9 ? T('portion') : T('portions')) : x.g != null ? nf(x.g, 1) + ' g' : nf(x.fraction, 3) + ' ' + T('batches')}</span></div>`; }
    if (x.kind === 'ingredient') { const f = d.facts[x.ref] || {}; const v = x.g != null ? nf(x.g, x.g < 1 ? 2 : 1) + ' g' : x.ml != null ? nf(x.ml, 1) + ' ml' : x.count != null ? nf(x.count, 2) + ' pz' : '—'; const st = x.status === 'peso_pezzo_mancante' && x.count != null ? 'ok' : x.status; return `<div class="mr-kv"><span>${esc((I.lang === 'it' && f.name_it) || f.name || '?')}</span><span>${v}${st !== 'ok' ? ` <span class="mr-bad">${esc(T('s_' + st))}</span>` : ''}</span></div>`; }
    return `<div class="mr-kv"><span class="mr-bad">${esc(T('s_' + x.status))}</span><span>${esc((d.docs[x.ref] || {}).title || '')}</span></div>`;
  }).join('');
}
function costPair(d, p, doc) {
  const ctxNew = ctxFor(d, p.id, doc, true), ctxOld = ctxFor(d, p.id, d.doc, d.source === 'lab');
  const a = E().cost(p.id, 1, ctxOld), b = E().cost(p.id, 1, ctxNew);
  const pa = d.doc.yield && d.doc.yield.portions, pb = doc.yield && doc.yield.portions;
  return { ctxNew, ctxOld, a, b, pa: pa ? a.food / pa : null, pb: pb ? b.food / pb : null };
}
const discardBtn = p => `<button class="mr-link" data-m="cancel">${ui(p.id).sure ? T('discard_sure') : T('discard_draft')}</button>`;
/* while editing: one quiet line with the live food cost; everything else is in Preview */
function editFoot(p, d, doc) {
  const c = costPair(d, p, doc), errs = E().validate(doc, c.ctxNew, true);
  const pair = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.0005 ? `<b>${usd(b)}</b>` : `${usd(a)} → <b>${usd(b)}</b>`;
  return `<div class="mr-foot"><div class="mr-muted">${c.pb != null ? `${T('fc_portion_c')} ${pair(c.pa, c.pb)}` : `${T('fc_lot')} ${pair(c.a.food, c.b.food)}`}${c.b.missing ? ' · ' + T('missing_prices', { n: c.b.missing }) : ''}</div>
    ${errs.length ? `<div class="mr-bad">${esc(errs.map(e => T('v_' + e.split(':')[0])).join(' · '))}</div>` : ''}
    <div class="mr-acts mr-between">${discardBtn(p)}<button class="mr-link acc" data-m="pv:1">${T('tab_preview')} ›</button></div></div>`;
}
/* Preview: the recipe exactly as it will read, then what changes (food cost, deductions) — same engine as the nightly run */
function changeBox(p, d, doc) {
  const c = costPair(d, p, doc), errs = E().validate(doc, c.ctxNew, true);
  const row = (k, a, b) => `<div class="mr-kv"><span>${k}</span><span>${a === b ? `<b>${b}</b>` : `${a} → <b>${b}</b>`}</span></div>`;
  return `<div class="mr-change"><h3>${T('what_changes')}</h3>
      ${c.pb != null || c.pa != null ? row(T('fc_portion_c'), usd(c.pa), usd(c.pb)) : ''}${Number(doc.yield && doc.yield.portions) === 1 && Number(d.doc.yield && d.doc.yield.portions) === 1 ? '' : row(T('fc_lot'), usd(c.a.food), usd(c.b.food))}
      ${c.b.missing ? `<div class="mr-muted">${T('missing_prices', { n: c.b.missing })}</div>` : ''}
      ${conseqHtml(d, p.id, c.ctxOld, c.ctxNew)}
      ${errs.length ? `<div class="mr-bad">${esc(errs.map(e => T('v_' + e.split(':')[0])).join(' · '))}</div>` : ''}
      ${issuesHtml(d, p.id, c.ctxNew, false)}</div>`;
}
function pvFoot(p, d, doc) {
  const errs = E().validate(doc, ctxFor(d, p.id, doc, true), true);
  return `<div class="mr-foot"><div class="mr-acts mr-between">${discardBtn(p)}<button class="mr-btn dark" data-m="savedraft">${T('save_draft')}</button></div>
      <div class="mr-pubrow">${d.publish_locked ? `<button class="mr-pub" data-m="publish" disabled aria-disabled="true">${T('publish_word')}</button><span class="mr-muted">${T('publish_off')}</span>` : `<button class="mr-pub" data-m="publish" ${errs.length ? 'disabled' : ''}>${T('publish', { v: d.recipe.current_version + 1 })}</button>`}</div></div>`;
}
// B-49 one number: what the change does to every module BEFORE publishing (same engine as the deductions)
function conseqHtml(d, id, ctxOld, ctxNew) {
  if (!E().consequences) return '';
  const c = E().consequences(id, ctxOld, ctxNew);
  const name = x => x.target === 'prep' ? I.dn(((ctxNew.doc(x.ref) || d.docs[x.ref] || {}).title) || '?') + ` (${T('prep')})` : (((I.lang === 'it' && (d.facts[x.ref] || {}).name_it) || (d.facts[x.ref] || {}).name) || '?');
  // consumption is shown as a plain number, what a production makes with '+'
  const n1 = (x, u) => (x > 0 ? '+' : '') + nf(Math.abs(x), Math.abs(x) < 1 ? 2 : 1) + u;
  const val = o => { const v = []; if (o.portions) v.push(n1(o.portions, '') + ' ' + (Math.abs(Math.abs(o.portions) - 1) < 1e-9 ? T('portion') : T('portions'))); if (o.g) v.push((o.g > 0 ? '+' : '') + nf(Math.abs(o.g), Math.abs(o.g) < 1 ? 2 : 1) + ' g'); if (o.count) v.push((o.count > 0 ? '+' : '') + nf(Math.abs(o.count), 2) + ' pz'); if (o.ml) v.push((o.ml > 0 ? '+' : '') + nf(Math.abs(o.ml), 1) + ' ml'); return v.join(' · ') || '0'; };
  const rows = l => l.map(x => `<div class="mr-kv"><span>${esc(name(x))}</span><span>${esc(val(x.before))} → <b>${esc(val(x.after))}</b></span></div>`).join('');
  const th = c.theoretical || [];
  if (!c.sale.length && !c.production.length && !th.length) return `<div class="mr-muted">${T('conseq_none')}</div>`;
  return `<div class="mr-conseq"><div class="mr-muted">${T('conseq_title')}</div>${c.sale.length ? `<p class="mr-sim">${T('conseq_sale')}</p>` + rows(c.sale) : ''}${c.production.length ? `<p class="mr-sim">${T('conseq_prod')}</p>` + rows(c.production) : ''}${th.length ? `<p class="mr-sim">${T('conseq_theo')}</p>` + rows(th) : ''}</div>`;
}
const dt = iso => iso ? new Intl.DateTimeFormat(loc(), { timeZone: 'America/Chicago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';

/* ============ INTERACTIONS ============ */
function entry() { return H.entry(); }
const forget = id => { API.forget('mre_recipe'); API.forget('mre_list'); API.get('mre_list', null, 0).catch(() => {}); };
/* R1.14: confirmations and errors are written INSIDE the card (top of the recipe), never floating over buttons */
function flash(id, msg, bad) { ui(id).flash = { msg, bad: !!bad, at: Date.now() }; }
async function call(op, body, okMsg) {
  try { const r = await API.call(op, body); const p = entry(); if (okMsg && p && p.id) flash(p.id, okMsg); return r; }
  catch (e) { const c = String(e.code || '').split(':')[0]; const p = entry(); if (p && p.id) { flash(p.id, T('err_' + c) !== 'm_err_' + c ? T('err_' + c) : T('error', { e: e.code || 'error' }), true); H.render(true) } return null; }
}
let saveT;
function scheduleSave(p) {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const r = await call('mre_save_draft', { id: p.id, doc: WORK[p.id], base: (H.peek('mre_recipe', { id: p.id }) || {}).recipe?.current_version });
    if (r) { p.saved = true; forget(); H.render(true); }
  }, 900);
}

function onClick(ev) {
  const el = ev.target.closest('[data-m], b.mq');
  if (!el || !el.closest('.mr')) return;
  const p = entry(); if (!p || !p.id) return;
  const d = H.peek('mre_recipe', { id: p.id }); if (!d) return;
  if (el.matches('b.mq')) { if (mode(d, p) !== 'preview') startEdit(el); ev.preventDefault(); return; }
  ev.preventDefault();
  const m = el.dataset.m, w = ui(p.id);
  const [k, a1, a2] = m.split(':');
  const work = () => WORK[p.id];
  w.err = null; w.flash = null;
  if (k === 'iss') { p.iss = !p.iss; }
  else if (k === 'reset') { p.f = 1; p.ref = ''; w.prod = null; }
  else if (k === 'units') p.imp = !p.imp;
  else if (k === 'p') p.panel = p.panel === a1 ? null : a1;
  else if (k === 'sub') { const src = shownDoc(d, p), l = src.lines.find(x => x.id === a1); if (!l) return; const sub = (PREVIEW && d.draft_docs && d.draft_docs[l.ref]) || d.docs[l.ref];
      const fr = sub && l.qty != null ? E().subFraction(l.qty * (p.edit ? 1 : (p.f || 1)), l.unit, sub) : { f: null }; H.openRecipe(l.ref, sub ? sub.title : '', fr.f || 1, T('from_parent', { t: src.title })); return; }
  else if (k === 'adv') p.adv = !p.adv;
  else if (k === 'edit') { WORK[p.id] = JSON.parse(JSON.stringify(d.draft || d.doc)); p.edit = true; p.pv = false; p.adv = false; p.panel = null; w.err = null; p.f = 1; p.saved = !!d.draft; w.sure = false; }
  else if (k === 'pv') { p.pv = a1 === '1'; w.sure = false; H.render(true); document.getElementById('main').scrollTop = 0; return; }
  else if (k === 'view') { p.view = a1; p.f = 1; p.ref = ''; w.prod = null; }
  else if (k === 'savedraft') { document.querySelectorAll('#main [data-m="savedraft"]').forEach(b => { b.disabled = true; b.textContent = T('saving') });   // the server can take a few seconds: say so
      (async () => { clearTimeout(saveT); const r = await call('mre_save_draft', { id: p.id, doc: work(), base: d.recipe.current_version }); if (!r) { H.render(true); return; }
      delete WORK[p.id]; p.edit = false; p.pv = false; p.saved = false; p.view = 'draft'; flash(p.id, T('draft_saved_toast', { v: r.draft_version })); forget(); H.render(true); document.getElementById('main').scrollTop = 0; })(); return; }
  else if (k === 'cancel') { if (!w.sure) { w.sure = true; H.render(true); setTimeout(() => { w.sure = false; }, 4000); return; }   // second tap discards: never a browser dialog
      w.sure = false; (async () => { clearTimeout(saveT); if (d.draft || p.saved) await call('mre_discard', { id: p.id }, T('discarded')); delete WORK[p.id]; p.edit = false; p.pv = false; p.saved = false; forget(); H.render(true); })(); return; }
  else if (k === 'review' || k === 'unreview') { (async () => { const r = await call('mre_review', { id: p.id, verified: k === 'review' }); if (!r) return;
      const nx = k === 'review' && H.next ? H.next(p.id) : null; forget(); if (nx) { flash(nx, T('verified_toast')); H.replace(nx); } else H.render(true); })(); return; }
  else if (k === 'next') { const nx = H.next ? H.next(p.id) : null; if (nx) H.replace(nx); return; }
  else if (k === 'publish') { (async () => { clearTimeout(saveT); const s = await call('mre_save_draft', { id: p.id, doc: work(), base: d.recipe.current_version }); if (!s) return;
      const r = await call('mre_publish', { id: p.id, reason: w.reason || '', base: d.recipe.current_version }); if (!r) return;
      flash(p.id, T('published', { v: r.version })); delete WORK[p.id]; p.edit = false; p.saved = false; p.f = 1; w.reason = ''; forget(); H.render(true); })(); return; }
  else if (k === 'role') return;
  else if (k === 'del') { work().lines = work().lines.filter(x => x.id !== a1); scheduleSave(p); }
  else if (k === 'delstep') { work().steps.splice(+a1, 1); scheduleSave(p); }
  else if (k === 'addstep') { work().steps.push({ it: '', en: '', es: '' }); scheduleSave(p); }
  else if (k === 'addi' || k === 'addr') { const nid = 'n' + Date.now().toString(36); work().lines.push({ id: nid, kind: k === 'addr' ? 'recipe' : 'ingredient', ref: a1, qty: null, unit: 'g', role: 'produzione', note: null, group: null }); w.q = ''; w.search = null;
      (async () => { await call('mre_save_draft', { id: p.id, doc: work(), base: d.recipe.current_version }); p.saved = true; forget(); H.render(true); })(); return; }
  else if (k === 'restore') { (async () => { const r = await call('mre_restore', { id: p.id, version: +a1 }); if (r) { flash(p.id, r.draft ? T('restored_draft', { v: a1 }) : T('restored', { v: a1, n: r.version })); forget(); H.render(true); } })(); return; }
  else if (k === 'checkdiffs') { (async () => { const r = await call('mre_check_diffs', { id: p.id }, T('checked')); if (r) { forget(); H.render(true); } })(); return; }
  else if (k === 'dec') { (async () => { const r = await call('mre_decide', { suggestion_id: a1, status: a2 }, T('st_' + a2.replace(' ', '_'))); if (r) { forget(); H.render(true); } })(); return; }
  else if (k === 'prod') { w.prod = { real: null, diff: false, used: {} }; w.prodMsg = null; w.sugOpen = false; }
  else if (k === 'proddiff') w.prod.diff = true;
  else if (k === 'prodcancel') w.prod = null;
  else if (k === 'prodsave') { saveProduction(p, d); return; }
  else if (k === 'sug') { w.sugOpen = true; w.sugMsg = null; }
  else if (k === 'sugcancel') w.sugOpen = false;
  else if (k === 'sugsend') { const t = (document.getElementById('mrSug') || {}).value || ''; if (t.trim().length < 2) return;
      (async () => { const r = await call('mre_suggest', { id: p.id, version: d.recipe.current_version, text: t.trim(), client_key: uuid() }); if (r) { w.sugOpen = false; w.sugText = ''; w.sugMsg = T('sug_sent'); forget(); H.render(true); } })(); return; }
  H.render(true);
}

async function saveProduction(p, d) {
  const w = ui(p.id), doc = d.doc, f = p.f > 0 ? p.f : 1, ctx = ctxFor(d, p.id, doc);
  const exp = Number(doc.yield && doc.yield.g) > 0 ? doc.yield.g * f : null;
  const changed = Object.entries(w.prod.used).map(([id, real]) => {
    const l = doc.lines.find(x => x.id === id), s = E().showLine(l, f, ctx, 'metric', loc());
    const plannedBase = E().dimOf(l.unit) === 'c' ? Math.round(l.qty * f) : (s.u === 'kg' ? Number(String(s.n).replace(',', '.')) * 1000 : Number(String(s.n).replace(',', '.')));
    return { line: id, name: lineName(d, l), planned: plannedBase, real: s.u === 'kg' ? real * 1000 : real, unit: s.u === 'kg' ? 'g' : s.u };
  }).filter(c => Math.abs(c.real - c.planned) > 0.0001);
  const r = await call('mre_production', { id: p.id, version: d.recipe.current_version, factor: f, reference: p.ref || T('base_batch'), yield_planned_g: exp, yield_real_g: w.prod.real != null ? w.prod.real : exp, changed, client_key: uuid() });
  if (!r) return;
  const real = w.prod.real != null ? w.prod.real : exp;
  w.prodMsg = T('prod_saved', { g: real != null ? nf(real, 0) : '—', v: d.recipe.current_version }) + (changed.length ? ' · ' + changed.map(c => `${c.name} ${nf(c.real, 2)} ${c.unit}`).join(', ') : '');
  w.prod = null; forget(); H.render(true);
}

/* ---- bold number editing in place ---- */
function startEdit(b) {
  const sp = b.querySelector('.n'); if (!sp || sp.isContentEditable) return;
  sp.setAttribute('contenteditable', 'true'); sp.setAttribute('inputmode', 'decimal'); sp.dataset.mred = '1'; b.dataset.orig = sp.textContent;
  if (sp.textContent === '—') sp.textContent = '';
  sp.focus();
  const r = document.createRange(); r.selectNodeContents(sp); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  let done = false;
  const finish = (cancel) => { if (done) return; done = true; sp.removeAttribute('contenteditable'); if (cancel) { H.render(true); return; } commit(b, sp.textContent); };
  sp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sp.blur(); } if (e.key === 'Escape') { e.preventDefault(); finish(true); } });
  sp.addEventListener('blur', () => finish(false), { once: true });
}
function commit(b, text) {
  const p = entry(), d = H.peek('mre_recipe', { id: p.id }); if (!d) return;
  const key = b.dataset.mq, u = b.dataset.u || '', w = ui(p.id);
  const v = parseFloat(String(text).replace(/\s/g, '').replace(',', '.'));
  const edit = H.isChef() && p.edit && WORK[p.id];
  w.err = null;
  if (edit && key === 'y:g' && !(v > 0)) { WORK[p.id].yield.g = null; scheduleSave(p); H.render(true); return; }   // weight is optional: empty or 0 removes it
  if (!(v > 0) || String(text).trim() === String(b.dataset.orig || '').trim()) { H.render(true); return; }      // a tap without a new number changes nothing
  if (edit) {
    const doc = WORK[p.id];
    if (key.startsWith('l:')) { const l = doc.lines.find(x => x.id === key.slice(2)); if (l) l.qty = v; }
    else if (key === 'y:g') { const k = E().normUnit(u) || 'g'; doc.yield.g = v * ({ kg: 1000, oz: 28.3495, lb: 453.592 }[k] || 1); }
    else if (key === 'y:p') doc.yield.portions = v;
    scheduleSave(p); H.render(true); return;
  }
  const doc = shownDoc(d, p), ctx = ctxFor(d, p.id, doc, PREVIEW);
  let f = null, ref = '';
  if (key.startsWith('l:')) { const l = doc.lines.find(x => x.id === key.slice(2)); const unit = b.dataset.intext ? l.unit : (u || l.unit);
    f = E().factorFromLine(doc, l.id, v, unit, ctx); ref = `${lineName(d, l).toLowerCase()} ${nf(v, 2)} ${b.dataset.intext ? (E().dimOf(l.unit) === 'c' ? 'pz' : l.unit) : u}`; }
  else if (key === 'y:g') { f = E().factorFromYield(doc, v, u || 'g'); ref = `${T('yield').toLowerCase()} ${nf(v, 2)} ${u || 'g'}`; }
  else if (key === 'y:p') { f = E().factorFromPortions(doc, v); ref = `${nf(v, 1)} ${T('portions')}`; }
  else if (key === 'y:l') { f = E().factorFromBatches(v); ref = `${nf(v, 2)} ${T('batches')}`; }
  else if (key === 'real') { w.prod.real = v * ({ kg: 1000 }[u] || 1); H.render(true); return; }
  else if (key.startsWith('act:')) { w.prod.used[key.slice(4)] = v; H.render(true); return; }
  if (f && isFinite(f) && f > 0) { p.f = f; p.ref = ref; w.prod = null; } else w.err = { key, msg: T('cannot_scale') };
  H.render(true);
}

/* text edits (editor): title, label, notes, steps — saved as draft */
function onBlurText(ev) {
  const t = ev.target.closest && ev.target.closest('[data-mt]'); if (!t || !t.closest('.mr')) return;
  const p = entry(), doc = WORK[p && p.id]; if (!doc) return;
  const [k, a] = t.dataset.mt.split(':');
  if (k === 'title') doc.title = t.textContent.trim() || doc.title;
  else if (k === 'label') doc.yield.label = t.textContent.trim() || null;
  else if (k === 'note') { const l = doc.lines.find(x => x.id === a); if (l) l.note = t.textContent.trim() || null; }
  else if (k === 'step') {
    let s = ''; t.childNodes.forEach(n => { s += n.nodeType === 1 && n.dataset && n.dataset.tok ? `{{${n.dataset.tok}}}` : n.textContent; });
    const st = doc.steps[+a]; if (st) st[I.lang] = s.trim();
  }
  scheduleSave(p);
}
function onChange(ev) {
  const s = ev.target.closest && ev.target.closest('[data-ms]'); if (!s || !s.closest('.mr')) return;
  const p = entry(), doc = WORK[p && p.id]; if (!doc) return;
  const [k, a] = s.dataset.ms.split(':');
  if (k === 'has_stock') doc.has_stock = s.value === '1';
  else { const l = doc.lines.find(x => x.id === a); if (!l) return; if (k === 'role') l.role = s.value; if (k === 'unit') l.unit = s.value === '—' ? null : s.value; }
  scheduleSave(p); H.render(true);
}
let qT;
function onInput(ev) {
  const p = entry(); if (!p || !p.id) return;
  if (ev.target.id === 'mrAdd') { const w = ui(p.id), q = ev.target.value; w.q = q; clearTimeout(qT);
    qT = setTimeout(async () => { if (q.trim().length < 2) { w.search = null; H.render(true); return; } const r = await call('mre_ingredients', { q }); if (r) { w.search = r; H.render(true); const i = document.getElementById('mrAdd'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }, 350); }
  if (ev.target.id === 'mrReason') ui(p.id).reason = ev.target.value;
  if (ev.target.id === 'mrSug') ui(p.id).sugText = ev.target.value;
}

window.MreUI = {
  init(helpers) { H = helpers; const m = document.getElementById('main');
    m.addEventListener('click', onClick, true); m.addEventListener('focusout', onBlurText); m.addEventListener('change', onChange); m.addEventListener('input', onInput); },
  render,
  /* sign-out / switch user: nothing of the previous person's working copies stays in memory */
  reset() { Object.keys(WORK).forEach(k => delete WORK[k]); Object.keys(UI).forEach(k => delete UI[k]); clearTimeout(saveT); clearTimeout(qT); },
  title(p) { const d = H && H.peek('mre_recipe', { id: p.id }); if (d) return I.dn(shownDoc(d, p).title);      // a tab always has a name, also while loading
    const r = H && H.listRow && H.listRow(p.id); return p.name || (r ? (H.isChef() && r.draft_title) || I.dn(r.title) : '…'); },
};
})();
