/* Brigade 2.0 — Smart Station Checklists, phase 1 (B-51). SIMULATION, Chef only, Pasta Station pilot.
   The server computes the priorities from real POS sales × recipes (supabase/functions/_shared/checklist_core.js).
   Ticks, corrected quantities and "ready now" counts stay ON THIS PHONE only (brigade-app-ui:smart:*, wiped at sign-out):
   nothing is sent, nothing moves stock, a ticked task is never a sale. */
(function () {
  const I = window.I18N, t = I.t;
  I.extend({
    sc_title: ['Today\'s Priorities', 'Priorità di oggi', 'Prioridades de hoy'], sc_station: ['Pasta Station', 'Pasta Station', 'Pasta Station'],
    sc_row: ['Pasta Station · Today\'s Priorities', 'Pasta Station · Priorità di oggi', 'Pasta Station · Prioridades de hoy'],
    sc_row_sub: ['Test · simulation from real POS sales', 'Prova · simulazione dalle vendite POS reali', 'Prueba · simulación con ventas POS reales'],
    sc_sim: ['Simulation: ticks and counts stay on this phone. Nothing is saved in Brigade and no stock moves.', 'Simulazione: spunte e conteggi restano su questo telefono. Niente viene salvato in Brigade e nessuna scorta si muove.', 'Simulación: marcas y conteos quedan en este teléfono. Nada se guarda en Brigade y ningún stock se mueve.'],
    sc_check: ['Check', 'Controllo', 'Control'], sc_smart: ['Smart checklist', 'Checklist intelligente', 'Checklist inteligente'], sc_prod: ['Production', 'Produzione', 'Producción'],
    sc_estimate: ['Estimate', 'Stima', 'Estimado'], sc_partial: ['Partial', 'Parziale', 'Parcial'], sc_missing: ['Missing', 'Manca', 'Falta'], sc_counted: ['Counted', 'Contato', 'Contado'],
    sc_for: ['For {d}', 'Per {d}', 'Para {d}'], sc_by: ['by {h}', 'entro le {h}', 'antes de las {h}'],
    sc_done: ['Done', 'Fatto', 'Hecho'], sc_change: ['Change amount', 'Cambia quantità', 'Cambiar cantidad'], sc_undo: ['Undo', 'Annulla', 'Deshacer'], sc_save: ['Save', 'Salva', 'Guardar'],
    sc_why: ['Why?', 'Perché?', '¿Por qué?'], sc_tonight: ['Tonight ({d}) needs ≈ {q}: should already be ready — check it.', 'Stasera ({d}) servono ≈ {q}: dovrebbero essere già pronti — controlla.', 'Esta noche ({d}) se necesitan ≈ {q}: ya deberían estar listos — revisa.'],
    sc_lead: ['Timing to confirm by the Chef.', 'Tempi da confermare dallo Chef.', 'Tiempos por confirmar por el Chef.'],
    sc_enough: ['At least 1 batch ready', 'Almeno 1 lotto pronto', 'Al menos 1 lote listo'], sc_make1: ['Not enough: make 1 batch', 'Non basta: fai 1 lotto', 'No alcanza: haz 1 lote'],
    sc_need: ['Needed {d}: ≈ {q}', 'Serve {d}: ≈ {q}', 'Se necesita {d}: ≈ {q}'], sc_batch: ['1 batch = {q}', '1 lotto = {q}', '1 lote = {q}'],
    sc_ready_q: ['How much is ready now? (count it)', 'Quanto è pronto adesso? (contalo)', '¿Cuánto hay listo ahora? (cuéntalo)'],
    sc_tomake: ['Make {b} batch(es) · {q}', 'Fai {b} lotti · {q}', 'Haz {b} lote(s) · {q}'], sc_nothing: ['Enough ready: nothing to make', 'Pronto a sufficienza: niente da fare', 'Suficiente listo: nada que hacer'],
    sc_ifnone: ['If nothing is ready: {b} batch(es)', 'Se non c\'è niente di pronto: {b} lotti', 'Si no hay nada listo: {b} lote(s)'],
    sc_made: ['Made', 'Fatto', 'Hecho'], sc_events: ['Events', 'Eventi', 'Eventos'], sc_closed: ['Closed today (no POS sales on this weekday). Showing the next service days.', 'Oggi chiuso (nessuna vendita POS in questo giorno). Mostro i prossimi giorni di servizio.', 'Hoy cerrado (sin ventas POS este día). Muestro los próximos días de servicio.'],
    sc_day: ['Day', 'Giorno', 'Día'], sc_today: ['Today', 'Oggi', 'Hoy'], sc_past: ['Simulated on a past day: compare with what was really sold.', 'Simulazione su un giorno passato: confronta con il venduto reale.', 'Simulación en un día pasado: compara con lo vendido.'],
    sc_actual: ['Really sold that day: {q}', 'Venduto davvero quel giorno: {q}', 'Vendido realmente ese día: {q}'],
    sc_samples: ['Last {n} {w}', 'Ultimi {n} {w}', 'Últimos {n} {w}'], sc_not_counted: ['Not counted', 'Non conteggiati', 'No contados'],
  });
  let H = null;
  const KEY = d => 'brigade-app-ui:smart:' + d;
  const load = d => { try { return JSON.parse(localStorage.getItem(KEY(d)) || '{}') } catch (e) { return {} } };
  const store = (d, s) => { try { localStorage.setItem(KEY(d), JSON.stringify(s)) } catch (e) {} };
  const nf = (x, dec) => Number(x).toLocaleString(I.locale(), { maximumFractionDigits: dec == null ? 1 : dec });
  const qty = (v, u) => v == null ? '—' : u === 'g' ? (v >= 1000 ? nf(v / 1000, 1) + ' kg' : nf(v, 0) + ' g') : nf(v, 0) + (u === 'pz' ? '' : ' ' + u);
  const shortD = iso => new Intl.DateTimeFormat(I.locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
  const exactG = g => g == null ? '—' : nf(g, 0) + ' g'   // batch size exactly as in the recipe yield
  const dayList = arr => arr.map(x => shortD(x.day)).join(' + ');
  const KIND = { check: ['a', 'sc_check'], smart: ['b', 'sc_smart'], production: ['c', 'sc_prod'] };
  const badge = s => `<span class="kn ${s === 'estimated' ? 'e' : s === 'partial' ? 'e' : s === 'counted' ? 'v' : 'm'}">${t(s === 'estimated' ? 'sc_estimate' : s === 'partial' ? 'sc_partial' : s === 'counted' ? 'sc_counted' : 'sc_missing')}</span>`;

  function why(c, esc) {
    const days = c.why.days.map(x => `<div class="scw-day"><b>${esc(x.weekday)} ${esc(shortD(x.day))}</b>: ${x.forecast == null ? '—' : `${qty(x.mean, c.unit)} avg → <b>${qty(x.forecast, c.unit)}</b>`}${x.trend != null ? ` <span class="muted">(last 2 weeks ${x.trend > 0 ? '+' : ''}${x.trend}%)</span>` : ''}
      <table class="scw-t">${x.samples.map(s => `<tr><td>${esc(shortD(s.date))}</td><td>${s.portions} sold</td><td>${qty(s.amount, c.unit)}</td></tr>`).join('')}</table></div>`).join('')
    return `<details class="scw"><summary>${t('sc_why')}</summary><div class="scw-b">
      <div class="muted">${esc(c.why.method)}</div>${days}
      <div><b>Dishes</b>: ${c.why.dishes.map(d => `${esc(d.title)} ${qty(d.per_portion, d.unit)}/portion <span class="muted">(${esc(d.source)}${d.path && d.path !== d.title ? ' · ' + esc(d.path) : ''})</span>`).join(' · ') || '—'}</div>
      ${c.round ? `<div class="muted">${esc(c.round)}</div>` : ''}${c.batch_src ? `<div class="muted">${esc(c.batch_src)}</div>` : ''}
      ${c.why.not_counted.length ? `<div class="wtx">${t('sc_not_counted')}: ${esc(c.why.not_counted.join(' · '))}</div>` : ''}
      ${c.lead_note ? `<div class="muted">${esc(c.lead_note)}</div>` : ''}
      ${c.actual ? `<div><b>${esc(t('sc_actual', { q: c.actual.map(a => qty(a.amount, c.unit)).join(' + ') }))}</b></div>` : ''}
    </div></details>`
  }
  function card(c, st, esc) {
    const s = st[c.key] || {}, [kc, kl] = KIND[c.kind]
    const head = `<div class="sc-top"><span class="chip ${kc}">${t(kl)}</span>${badge(c.status)}</div>`
    const when = `${t('sc_for', { d: dayList(c.for_days) })} · ${t('sc_by', { h: c.by })}`
    if (c.kind === 'smart') {
      const q = s.q != null ? s.q : c.qty
      const title = `${esc(c.verb)} <b class="num">${qty(q, c.unit)}</b> ${esc(c.what)}`
      return `<article class="sc ${s.done ? 'is-done' : ''}">${head}<div class="sc-title">${title}</div><div class="meta">${when}</div>
        ${c.tonight && !s.done ? `<div class="meta">${esc(t('sc_tonight', { d: shortD(c.tonight.day), q: qty(c.tonight.qty ?? c.tonight.need, c.unit) }))}</div>` : ''}
        ${c.lead_ok ? '' : `<div class="meta wtx">${t('sc_lead')}</div>`}
        ${s.edit ? `<div class="sc-acts"><input class="sc-in" id="sc-${c.key}" inputmode="decimal" value="${q == null ? '' : c.unit === 'g' ? nf(q / 1000, 2) : q}"><span class="muted">${c.unit === 'g' ? 'kg' : esc(c.what.toLowerCase())}</span><button class="btn" data-a="scSave" data-k="${c.key}">${t('sc_save')}</button></div>`
          : s.done ? `<div class="sc-acts"><span class="okline">✓ ${t('sc_done')} · ${qty(q, c.unit)}</span><button class="btn ghost" data-a="scUndo" data-k="${c.key}">${t('sc_undo')}</button></div>`
          : `<div class="sc-acts"><button class="btn" data-a="scDone" data-k="${c.key}">✓ ${t('sc_done')}</button><button class="btn ghost" data-a="scEdit" data-k="${c.key}">${t('sc_change')}</button></div>`}
        ${why(c, esc)}</article>`
    }
    if (c.kind === 'check') {
      return `<article class="sc ${s.done ? 'is-done' : ''}">${head}<div class="sc-title">${esc(c.verb)} ${esc(c.what)}</div>
        <div class="meta">${t('sc_need', { d: dayList(c.for_days), q: qty(c.need, c.unit) })} · ${t('sc_batch', { q: exactG(c.batch_g) })}</div><div class="meta">${t('sc_by', { h: c.by })}</div>
        ${s.done ? `<div class="sc-acts"><span class="okline">✓ ${s.answer === 'make' ? t('sc_make1') + ' · ' + t('sc_made') : t('sc_enough')}</span><button class="btn ghost" data-a="scUndo" data-k="${c.key}">${t('sc_undo')}</button></div>`
          : `<div class="sc-acts"><button class="btn" data-a="scAnswer" data-k="${c.key}" data-v="ok">✓ ${t('sc_enough')}</button><button class="btn ghost" data-a="scAnswer" data-k="${c.key}" data-v="make">${t('sc_make1')}</button></div>`}
        ${why(c, esc)}</article>`
    }
    // production: needed vs what is COUNTED ready (never a theoretical stock)
    const ready = s.ready != null ? s.ready : null
    const short = c.need != null && ready != null ? Math.max(0, c.need - ready) : null, batches = short != null && c.batch_g ? Math.ceil(short / c.batch_g) : null
    return `<article class="sc ${s.done ? 'is-done' : ''}">${head}<div class="sc-title">${esc(c.verb)} ${esc(c.what)}${batches != null ? ` — <b class="num">${batches ? qty(batches * c.batch_g, 'g') : '0'}</b>` : ''}</div>
      <div class="meta">${t('sc_need', { d: dayList(c.for_days), q: qty(c.need, c.unit) })} · ${t('sc_batch', { q: exactG(c.batch_g) })}</div>
      <div class="sc-acts"><label class="muted" for="sc-r-${c.key}">${t('sc_ready_q')}</label><input class="sc-in" id="sc-r-${c.key}" inputmode="decimal" placeholder="0" value="${ready != null ? nf(ready / 1000, 2) : ''}"><span class="muted">kg</span><button class="btn ghost" data-a="scReady" data-k="${c.key}">${t('sc_save')}</button>${ready != null ? badge('counted') : ''}</div>
      <div class="meta"><b>${batches == null ? esc(t('sc_ifnone', { b: c.batches_if_none_ready ?? '—' })) : batches ? esc(t('sc_tomake', { b: batches, q: qty(batches * c.batch_g, 'g') })) : esc(t('sc_nothing'))}</b></div>
      ${s.done ? `<div class="sc-acts"><span class="okline">✓ ${t('sc_made')}${s.q ? ' · ' + qty(s.q, 'g') : ''}</span><button class="btn ghost" data-a="scUndo" data-k="${c.key}">${t('sc_undo')}</button></div>`
        : `<div class="sc-acts"><button class="btn" data-a="scMade" data-k="${c.key}" data-q="${batches ? batches * c.batch_g : ''}">✓ ${t('sc_made')}</button></div>`}
      <div class="meta">${t('sc_by', { h: c.by })}</div>${why(c, esc)}</article>`
  }
  const screens = {
    smart: { title: () => t('sc_title'), c: '--today', render(p) {
      const { esc } = H
      if (!H.isChef()) return `<div class="page">${H.backBtn()}<p class="note">${t('chef_only')}</p></div>`
      const body = p.day ? { station: 'pasta', day: p.day } : { station: 'pasta' }
      const d = H.need('smart_checklist', body, 10 * 60000)
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('smart_checklist')}</div>`
      const st = load(d.today), done = d.items.filter(c => (st[c.key] || {}).done).length
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
      const prevFri = (() => { const x = new Date(today + 'T12:00:00Z'); do { x.setUTCDate(x.getUTCDate() - 1) } while (x.getUTCDay() !== 5); return x.toISOString().slice(0, 10) })()
      const prevSat = new Date(Date.parse(prevFri + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
      const days = [['', t('sc_today')], [prevFri, shortD(prevFri)], [prevSat, shortD(prevSat)]]
      return `<div class="page" style="--c:var(--today)">${H.backBtn()}${H.head(`${t('w_today')} › ${t('sc_station')}`, t('sc_title'), `${dayList(d.service_days)} · ${done}/${d.items.length} ${t('sc_done').toLowerCase()}`)}
        <div class="seg">${days.map(([v, l]) => `<button class="${(p.day || '') === v ? 'on' : ''}" data-a="scDay" data-v="${v}">${esc(l)}</button>`).join('')}</div>
        ${p.day ? `<p class="note">${t('sc_past')}</p>` : ''}${d.closed_today && !p.day ? `<p class="note">${t('sc_closed')}</p>` : ''}
        <div class="sc-list">${d.items.map(c => card(c, st, esc)).join('')}</div>
        ${d.events.length ? `<section><h2>${t('sc_events')}</h2><div class="list">${d.events.map(e => `<div class="row"><span class="main"><div class="name">${esc(e.name)} · ${e.guests ?? '—'} guests</div><div class="meta">${esc(shortD(e.date))} · ${esc(e.why || 'included')}</div></span></div>`).join('')}</div></section>` : ''}
        <p class="note" style="font-size:14px">${t('sc_sim')}</p></div>`
    } },
  }
  const row = () => `<div class="list"><button class="row" data-a="openSmart"><span class="main"><div class="name">${t('sc_row')}</div><div class="meta">${t('sc_row_sub')}</div></span><span class="chev">›</span></button></div>`
  // actions: everything stays on this phone
  const cardOf = k => { const p = H.entry(), d = H.peek('smart_checklist', p.day ? { station: 'pasta', day: p.day } : { station: 'pasta' }); return d ? { d, c: d.items.find(x => x.key === k) } : {} }
  const upd = (k, fn) => { const { d } = cardOf(k); if (!d) return; const st = load(d.today); st[k] = fn(st[k] || {}); store(d.today, st); H.render(true) }
  const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : null }
  const actions = {
    openSmart() { H.openTab('smart', 'pasta', { s: 'smart', p: {} }) },
    scDay(el) { H.entry().day = el.dataset.v || ''; H.render() },
    scDone(el) { upd(el.dataset.k, s => Object.assign(s, { done: true, edit: false })) },
    scEdit(el) { upd(el.dataset.k, s => Object.assign(s, { edit: true })) },
    scSave(el) { const k = el.dataset.k, { c } = cardOf(k), v = num((document.getElementById('sc-' + k) || {}).value); if (v == null || !c) return H.toast(t('check_qty'))
      upd(k, s => Object.assign(s, { q: c.unit === 'g' ? Math.round(v * 1000) : Math.round(v), edit: false, done: true })) },
    scUndo(el) { upd(el.dataset.k, () => ({})) },
    scAnswer(el) { upd(el.dataset.k, s => Object.assign(s, { done: true, answer: el.dataset.v })) },
    scReady(el) { const k = el.dataset.k, v = num((document.getElementById('sc-r-' + k) || {}).value); if (v == null) return H.toast(t('check_qty')); upd(k, s => Object.assign(s, { ready: Math.round(v * 1000) })) },
    scMade(el) { upd(el.dataset.k, s => Object.assign(s, { done: true, q: num(el.dataset.q) })) },
  }
  window.ChecklistUI = { init(h) { H = h }, screens, row, actions }
})();
