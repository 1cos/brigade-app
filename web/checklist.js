/* Brigade 2.0 — Smart Station Checklists (B-51). R1.11 Progressive Trust — SIMULATION, Chef only, Pasta Station pilot.
   Step 1: one question, one tick ("Do we have 18 lobsters ready for today?"). The server computes the amounts from real
   POS sales × recipes (supabase/functions/_shared/checklist_core.js) and decides the level; this screen never raises it.
   Step 2 (how many are ready?) is built here but only drawn when the server says level 2 — today it never does.
   Ticks stay ON THIS PHONE only (brigade-app-ui:smart:*, wiped at sign-out): nothing is sent, nothing moves stock. */
(function () {
  const I = window.I18N, t = I.t;
  const MAX_UI_LEVEL = 2   // step 3 has no screen: stock & production are design only
  I.extend({
    sc_title: ['Today\'s Checklist', 'Checklist di oggi', 'Checklist de hoy'], sc_station: ['Pasta Station', 'Pasta Station', 'Pasta Station'],
    sc_row: ['Pasta Station · Today\'s Checklist', 'Pasta Station · Checklist di oggi', 'Pasta Station · Checklist de hoy'],
    sc_row_sub: ['Test · simulation from real POS sales', 'Prova · simulazione dalle vendite POS reali', 'Prueba · simulación con ventas POS reales'],
    sc_sim: ['Simulation: ticks stay on this phone only and are not saved.', 'Simulazione: le spunte restano solo su questo telefono e non vengono salvate.', 'Simulación: las marcas quedan solo en este teléfono y no se guardan.'],
    q_ready_today: ['Do we have {q} ready for today?', 'Abbiamo {q} pronti per oggi?', '¿Tenemos {q} listos para hoy?'],
    q_ready_day: ['Do we have {q} ready for {d}?', 'Abbiamo {q} pronti per {d}?', '¿Tenemos {q} listos para {d}?'],
    q_pulled: ['Is {q} pulled for {d}?', '{q} tirati fuori per {d}?', '¿{q} sacados para {d}?'],
    q_count: ['How many {w} are ready?', 'Quanti {w} sono pronti?', '¿Cuántos {w} hay listos?'],
    q_count_kg: ['How much {w} is ready? (kg)', 'Quanto {w} è pronto? (kg)', '¿Cuánto {w} hay listo? (kg)'],
    sc_yes: ['Yes, ready', 'Sì, pronto', 'Sí, listo'], sc_yes_pulled: ['Yes, pulled', 'Sì, fatto', 'Sí, hecho'], sc_ready: ['Ready', 'Pronto', 'Listo'],
    sc_undo: ['Undo', 'Annulla', 'Deshacer'], sc_save: ['Save', 'Salva', 'Guardar'],
    sc_enough: ['Enough for today', 'Basta per oggi', 'Alcanza para hoy'], sc_more: ['{q} more needed', 'Ne servono altri {q}', 'Faltan {q}'],
    sc_thaw: ['Thaw this morning (about 15 min). Need more during service? Thaw them then.', 'Scongela stamattina (circa 15 min). Ne servono altre in servizio? Scongelale al momento.', 'Descongela esta mañana (unos 15 min). ¿Faltan en servicio? Descongélalas en el momento.'],
    sc_left: ['Leftovers from {d}: use them only if checked and still good.', 'Avanzi di {d}: usali solo se controllati e ancora buoni.', 'Sobras del {d}: úsalas solo si están revisadas y en buen estado.'],
    sc_why: ['Why?', 'Perché?', '¿Por qué?'], sc_events: ['Events', 'Eventi', 'Eventos'],
    sc_closed: ['Closed today (no POS sales on this weekday). Showing the next service day.', 'Oggi chiuso (nessuna vendita POS in questo giorno). Mostro il prossimo giorno di servizio.', 'Hoy cerrado (sin ventas POS este día). Muestro el próximo día de servicio.'],
    sc_today: ['Today', 'Oggi', 'Hoy'], sc_tomorrow: ['tomorrow', 'domani', 'mañana'],
    sc_past: ['Simulated on a past day: compare with what was really sold.', 'Simulazione su un giorno passato: confronta con il venduto reale.', 'Simulación en un día pasado: compara con lo vendido.'],
    sc_actual: ['Really sold that day: {q}', 'Venduto davvero quel giorno: {q}', 'Vendido realmente ese día: {q}'],
    sc_not_counted: ['Not counted', 'Non conteggiati', 'No contados'], sc_of: ['{a} of {b} ready', '{a} di {b} pronti', '{a} de {b} listos'],
    sc_view_chef: ['Chef', 'Chef', 'Chef'], sc_view_cook: ['Cook view', 'Vista cuoco', 'Vista cocinero'],
  });
  let H = null;
  const KEY = d => 'brigade-app-ui:smart:' + d;
  const load = d => { try { return JSON.parse(localStorage.getItem(KEY(d)) || '{}') } catch (e) { return {} } };
  const store = (d, s) => { try { localStorage.setItem(KEY(d), JSON.stringify(s)) } catch (e) {} };
  const nf = (x, dec) => Number(x).toLocaleString(I.locale(), { maximumFractionDigits: dec == null ? 1 : dec });
  const qty = (v, u) => v == null ? '—' : u === 'g' ? (v >= 1000 ? nf(v / 1000, 1) + ' kg' : nf(v, 0) + ' g') : nf(v, 0) + (u === 'pz' ? '' : ' ' + u);
  const shortD = iso => new Intl.DateTimeFormat(I.locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
  const longD = iso => new Intl.DateTimeFormat(I.locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
  const addDay = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
  const what = (c, esc) => `<b class="num">${qty(c.qty, c.unit)}</b> ${esc(c.what)}`;
  function question(c, d, esc) {
    const fd = c.for_day || {}
    if (c.ask === 'pulled') return t('q_pulled', { q: what(c, esc), d: fd.day === addDay(d.today, 1) ? t('sc_tomorrow') : esc(longD(fd.day)) })
    return fd.today ? t('q_ready_today', { q: what(c, esc) }) : t('q_ready_day', { q: what(c, esc), d: esc(longD(fd.day)) })
  }

  // Chef only: where the number comes from. A cook never needs it.
  function why(c, esc) {
    const x = c.why.day
    const day = x ? `<div class="scw-day"><b>${esc(x.weekday)} ${esc(shortD(x.day))}</b>: ${x.forecast == null ? '—' : `${qty(x.mean, c.unit)} avg + ${c.why.margin}% → <b>${qty(x.forecast, c.unit)}</b> → ${qty(c.qty, c.unit)}`}${x.trend != null ? ` <span class="muted">(last 2 weeks ${x.trend > 0 ? '+' : ''}${x.trend}%)</span>` : ''}
      <table class="scw-t">${x.samples.map(s => `<tr><td>${esc(shortD(s.date))}</td><td>${s.portions} sold</td><td>${qty(s.amount, c.unit)}</td></tr>`).join('')}</table></div>` : ''
    return `<details class="scw"><summary>${t('sc_why')}</summary><div class="scw-b">
      <div class="muted">${esc(c.why.method)}</div>${day}
      <div><b>Dishes</b>: ${c.why.dishes.map(dd => `${esc(dd.title)} ${qty(dd.per_portion, dd.unit)}/portion <span class="muted">(${esc(dd.source)}${dd.path && dd.path !== dd.title ? ' · ' + esc(dd.path) : ''})</span>`).join(' · ') || '—'}</div>
      ${c.why.round ? `<div class="muted">${esc(c.why.round)}</div>` : ''}${c.why.batch ? `<div class="muted">${esc(c.why.batch)}</div>` : ''}
      ${c.why.not_counted.length ? `<div class="wtx">${t('sc_not_counted')}: ${esc(c.why.not_counted.join(' · '))}</div>` : ''}
      ${c.why.lead_note ? `<div class="muted">${esc(c.why.lead_note)}</div>` : ''}
      ${c.actual != null ? `<div><b>${esc(t('sc_actual', { q: qty(c.actual, c.unit) }))}</b></div>` : ''}
    </div></details>`
  }
  function card(c, d, st, esc, chefView, level) {
    const s = st[c.key] || {}
    const hints = [c.how === 'thaw_morning' && !s.done ? t('sc_thaw') : '', c.leftovers_from && !s.done ? esc(t('sc_left', { d: longD(c.leftovers_from.day) })) : '']
      .filter(Boolean).map(h => `<div class="meta">${h}</div>`).join('')
    let acts
    if (level >= 2) {   // Step 2 (built, off): how many are ready? → enough / N more. Still only on this phone.
      const r = s.ready != null ? s.ready : null, short = r == null || c.qty == null ? null : Math.max(0, c.qty - r)
      const lbl = c.unit === 'pz' ? t('q_count', { w: esc(c.what) }) : t('q_count_kg', { w: esc(c.what) })
      acts = `<div class="sc-acts"><label class="muted" for="sc-r-${c.key}">${lbl}</label><input class="sc-in" id="sc-r-${c.key}" inputmode="decimal" placeholder="0" value="${r == null ? '' : c.unit === 'g' ? nf(r / 1000, 2) : r}"><button class="btn" data-a="scCount" data-k="${c.key}">${t('sc_save')}</button></div>
        ${short == null ? '' : `<div class="okline${short > 0 ? ' wtx' : ''}">${short > 0 ? esc(t('sc_more', { q: qty(short, c.unit) })) : '✓ ' + t('sc_enough')}</div>`}`
    } else acts = s.done
      ? `<div class="sc-acts"><span class="okline">✓ ${t('sc_ready')}</span><button class="btn ghost" data-a="scUndo" data-k="${c.key}">${t('sc_undo')}</button></div>`
      : `<div class="sc-acts"><button class="btn sc-yes" data-a="scDone" data-k="${c.key}">✓ ${t(c.ask === 'pulled' ? 'sc_yes_pulled' : 'sc_yes')}</button></div>`
    return `<article class="sc ${s.done ? 'is-done' : ''}" data-k="${c.key}"><div class="sc-q">${c.qty == null ? esc(c.what) : question(c, d, esc)}</div>${hints}${acts}${chefView && c.why ? why(c, esc) : ''}</article>`
  }
  const screens = {
    smart: { title: () => t('sc_title'), c: '--today', render(p) {
      const { esc } = H
      if (!H.isChef()) return `<div class="page">${H.backBtn()}<p class="note">${t('chef_only')}</p></div>`
      const body = p.day ? { station: 'pasta', day: p.day } : { station: 'pasta' }
      const d = H.need('smart_checklist', body, 10 * 60000)
      if (!d) return `<div class="page">${H.backBtn()}${H.waiting('smart_checklist')}</div>`
      const level = Math.max(1, Math.min(Number(d.level) || 1, MAX_UI_LEVEL))   // only the server decides; never above step 2
      const cook = !!p.cook, chefView = !cook
      const st = load(d.today), done = d.items.filter(c => (st[c.key] || {}).done).length
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
      const prevFri = (() => { const x = new Date(today + 'T12:00:00Z'); do { x.setUTCDate(x.getUTCDate() - 1) } while (x.getUTCDay() !== 5); return x.toISOString().slice(0, 10) })()
      const prevSat = addDay(prevFri, 1)
      const days = [['', t('sc_today')], [prevFri, shortD(prevFri)], [prevSat, shortD(prevSat)]]
      return `<div class="page" style="--c:var(--today)">${H.backBtn()}${H.head(`${t('w_today')} › ${t('sc_station')}`, t('sc_title'), `${esc(shortD(d.today))} · ${t('sc_of', { a: done, b: d.items.length })}`)}
        <div class="seg"><button class="${cook ? '' : 'on'}" data-a="scView" data-v="">${t('sc_view_chef')}</button><button class="${cook ? 'on' : ''}" data-a="scView" data-v="1">${t('sc_view_cook')}</button></div>
        ${chefView ? `<div class="seg">${days.map(([v, l]) => `<button class="${(p.day || '') === v ? 'on' : ''}" data-a="scDay" data-v="${v}">${esc(l)}</button>`).join('')}</div>` : ''}
        ${p.day && chefView ? `<p class="note">${t('sc_past')}</p>` : ''}${d.closed_today && !p.day ? `<p class="note">${t('sc_closed')}</p>` : ''}
        <div class="sc-list">${d.items.map(c => card(c, d, st, esc, chefView, level)).join('')}</div>
        ${chefView && d.events && d.events.length ? `<section><h2>${t('sc_events')}</h2><div class="list">${d.events.map(e => `<div class="row"><span class="main"><div class="name">${esc(e.name)} · ${e.guests ?? '—'} guests</div><div class="meta">${esc(shortD(e.date))} · ${esc(e.why || 'included')}</div></span></div>`).join('')}</div></section>` : ''}
        <p class="note" style="font-size:14px">${t('sc_sim')}</p></div>`
    } },
  }
  const row = () => `<div class="list"><button class="row" data-a="openSmart"><span class="main"><div class="name">${t('sc_row')}</div><div class="meta">${t('sc_row_sub')}</div></span><span class="chev">›</span></button></div>`
  // actions: everything stays on this phone
  const dataOf = () => { const p = H.entry(); return H.peek('smart_checklist', p.day ? { station: 'pasta', day: p.day } : { station: 'pasta' }) }
  const upd = (k, fn) => { const d = dataOf(); if (!d) return; const st = load(d.today); st[k] = fn(st[k] || {}); store(d.today, st); H.render(true) }
  const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : null }
  const actions = {
    openSmart() { H.openTab('smart', 'pasta', { s: 'smart', p: {} }) },
    scDay(el) { H.entry().day = el.dataset.v || ''; H.render() },
    scView(el) { const p = H.entry(); p.cook = !!el.dataset.v; if (p.cook) p.day = ''; H.render() },
    scDone(el) { upd(el.dataset.k, s => Object.assign(s, { done: true })) },
    scUndo(el) { upd(el.dataset.k, () => ({})) },
    scCount(el) { const k = el.dataset.k, d = dataOf(), c = d && d.items.find(x => x.key === k), v = num((document.getElementById('sc-r-' + k) || {}).value)
      if (v == null || !c) return H.toast(t('check_qty')); upd(k, s => Object.assign(s, { ready: c.unit === 'g' ? Math.round(v * 1000) : Math.round(v) })) },
  }
  window.ChecklistUI = { init(h) { H = h }, screens, row, actions, MAX_UI_LEVEL }
})();
