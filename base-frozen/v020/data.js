/* Brigade V020 — read-only data provider.
   Reads live Brigade data through Supabase REST with the public anon key, exactly like Brigade's own pages.
   GET only: this file has no code path that inserts, updates, deletes or calls a writing function. */
(function () {
  const C = window.BRIGADE_CONFIG || {};
  const REST = (C.url || '') + '/rest/v1/';
  const TZ = 'America/Chicago';
  const TTL = 5 * 60 * 1000;                       // data older than 5 minutes is refreshed on next view

  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const hourCDT = () => +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()) % 24;

  async function get(path) {
    if (!C.anonKey) throw new Error('Not connected: config.js has no key.');
    const r = await fetch(REST + path, { method: 'GET', cache: 'no-store', headers: { apikey: C.anonKey, Authorization: 'Bearer ' + C.anonKey } });
    if (!r.ok) throw new Error('Brigade answered ' + r.status + ' for ' + path.split('?')[0]);
    return r.json();
  }
  async function all(path, page = 1000) {
    let out = [], off = 0;
    for (;;) {
      const d = await get(path + (path.includes('?') ? '&' : '?') + 'limit=' + page + '&offset=' + off);
      out = out.concat(d);
      if (d.length < page) return out;
      off += page;
    }
  }

  /* Each dataset: one read. Columns are chosen on purpose (no PINs, no birth dates, no client contacts). */
  const D = {
    recipes:   () => all('recipes?select=id,title,category,yield_text,menu_group,pos_name,selling_price,food_cost_pct,base_servings,base_weight_g,base_weight,weight_unit,serving_qty,serving_unit,prep_time_minutes,shelf_life_days&order=title'),
    yields:    () => all('recipe_yield?select=id,portions,portions_source,yield_qty,yield_dim,has_yield,conflict'),   // canonical yield (YIELD01)
    attention: () => all('attention_items?select=origin,item_id,source,family,attention,reason,decision_key,recipe_id,document_id,created_at'),   // what needs Chef (ATTENTION01)
    bom:       () => all('recipe_bom?select=parent_recipe_id,component_type,item_id,sub_recipe_id,quantity,unit,notes,prep_task_id,sort_order&order=parent_recipe_id,sort_order'),
    ingredients: () => all('ingredients?select=id,name,category,base_unit,notes,active,measure_type,name_it,avg_unit_weight_g,yield_factor&order=name'),
    vendors:   () => all('ingredient_vendors?select=ingredient_id,vendor,vendor_sku,purchase_unit,pack_description,unit_price,price_per_100g,price_per_each,last_invoice_date,price_type,active,do_not_order,do_not_order_reason'),
    prep:      () => all('prep_tasks?select=id,name,category,unit,container,recipe_id,ingredient_id,current_stock,prep_type,done,in_progress,in_progress_by,need_tomorrow,note,pack_label,min_cover_days&archived=not.is.true&order=category,name'),
    prepclass: () => all('prep_task_classifications?select=prep_task_id,production_family,work_type,canonical_station'),
    sugg:      async () => {                          // same rule as Brigade's Prep tab: latest run with >= 50 rows in the last 7 days
      const t = today();
      const rows = await all('prep_suggestions_daily?select=suggestion_date&suggestion_date=gte.' + addDays(t, -7) + '&suggestion_date=lte.' + t);
      const n = {}; rows.forEach(r => { n[r.suggestion_date] = (n[r.suggestion_date] || 0) + 1; });
      const date = Object.keys(n).filter(d => n[d] >= 50).sort().pop() || null;
      if (!date) return { date: null, rows: [] };
      const list = await all('prep_suggestions_daily?select=prep_task_id,status,confidence,planned_output,output_unit,current_stock,stock_unit,forecast,coverage_days,reason,generated_at&suggestion_date=eq.' + date);
      return { date, rows: list };
    },
    events:    () => all('events?select=id,name,event_date,event_time,guest_count,menu_type,location,room_name,status,service_style,notes,event_recipes,tripleseat_id,last_synced_at&event_date=gte.' + addDays(today(), -14) + '&order=event_date,event_time'),
    office:    () => get('office_items?select=id,created_at,source,from_user,title,summary,body,status,severity,issue_type,chef_action,last_seen_at,recipe_id,recipe_name,ingredient_id,ingredient_name,vendor_name,price_change_pct,suggested_action,station&status=eq.open&is_demo=not.is.true&order=created_at.desc&limit=600'),
    invwarn:   async () => {                       // open invoice warnings + the status of their document (imported / pending / error / ignored)
      const w = await all('invoice_warnings?select=id,document_id,vendor,document_date,document_number,code,item_description,message,question,status,severity,created_at&status=neq.resolved&order=document_date.desc');
      const ids = [...new Set(w.map(x => x.document_id).filter(Boolean))];
      const st = {};
      for (let i = 0; i < ids.length; i += 80) (await get('vendor_documents?select=id,status&id=in.(' + ids.slice(i, i + 80).join(',') + ')')).forEach(d => { st[d.id] = d.status; });
      return w.map(x => Object.assign(x, { doc_status: st[x.document_id] || null }));
    },
    docs:      () => all('vendor_documents?select=id,vendor,document_type,document_number,document_date,status&document_date=gte.' + addDays(today(), -30) + '&order=document_date.desc'),
    sales:     () => get('pos_daily_summary?select=sale_date,day_of_week,bill_count,net_sales,gross_sales&order=sale_date.desc&limit=14'),
    salesItems: async () => {
      const last = await get('pos_daily_summary?select=sale_date&order=sale_date.desc&limit=1');
      if (!last.length) return { date: null, rows: [] };
      return { date: last[0].sale_date, rows: await all('pos_sales_by_item?select=menu_item,menu_group,quantity,net_sales&sale_date=eq.' + last[0].sale_date + '&order=quantity.desc') };
    },
    preplog:   () => all('prep_log?select=created_at,user_name,station,item,qty,unit,container,prep_task_id&is_demo=not.is.true&created_at=gte.' + addDays(today(), -2) + 'T05:00:00Z&order=created_at.desc'),
    counts:    () => all('prep_stock_counts?select=prep_task_id,counted_qty,unit,counted_by,counted_at&counted_at=gte.' + addDays(today(), -7) + '&order=counted_at.desc'),
    reports:   () => get('chef_reports?select=user_name,station,message,created_at,status&is_demo=not.is.true&order=created_at.desc&limit=25'),
    messages:  () => get('messages?select=created_at,user_name,channel,text&order=created_at.desc&limit=40'),
    briefing:  () => get('briefing?select=date,points_en,points_staff_en,generated_at&order=date.desc&limit=1'),
    journal:   () => all('journal_entries?select=entry_date,author,category,title,body,severity,status,assigned_to&is_archived=not.is.true&order=entry_date.desc'),
    closing:   () => all('closing_checks?select=name,station,note&archived=not.is.true&order=station,name'),
    stations:  () => all('staff_stations?select=staff_name,station,shift,is_default'),
    staff:     () => all('users_public?select=name,role,default_station&active=is.true&order=name'),
    shifts:    () => all('shifts_schedule?select=date,employee_name,role_name,start_label,end_label,department_name,is_closing&date=gte.' + today() + '&date=lte.' + addDays(today(), 13) + '&order=date,start_hour'),
  };

  const store = {};                                  // name -> { data, at, err, p }
  function load(name, force) {
    const s = store[name] || (store[name] = {});
    const fresh = s.at && Date.now() - s.at < TTL;
    if (s.p) return s.p;
    if (fresh && !force && !s.err) return Promise.resolve(s.data);
    s.p = D[name]().then(d => { s.data = d; s.at = Date.now(); s.err = null; return d; })
      .catch(e => { s.err = e; throw e; })
      .finally(() => { s.p = null; window.dispatchEvent(new CustomEvent('brigade-data', { detail: name })); });
    return s.p;
  }
  const one = {};                                    // per-record reads: recipe body, steps, cost
  function detail(kind, id) {
    const k = kind + ':' + id;
    if (one[k] && Date.now() - one[k].at < TTL) return one[k].p;
    const p = kind === 'recipe' ? get('recipes?id=eq.' + id + '&select=id,title,category,yield_text,prep_time_minutes,ingredients,procedure,procedure_en,equipment,base_weight,weight_unit,base_servings,base_weight_g,serving_weight_g,serving_unit,serving_qty,selling_price,food_cost_pct,pos_name,menu_group,shelf_life_days,photo_url,image_url').then(r => r[0])
      : kind === 'steps' ? get('recipe_steps?recipe_id=eq.' + id + '&select=step_number,title,instruction_en,timer_seconds&order=step_number')
      : kind === 'cost' ? get('rpc/get_recipe_cost?p_recipe_id=' + id).catch(() => null)   // read-only (STABLE) function, called with GET
      : Promise.reject(new Error('unknown'));
    one[k] = { p, at: Date.now() };
    p.catch(() => { delete one[k]; });
    return p;
  }

  window.BrigadeData = {
    connected: !!C.anonKey, today, addDays, hourCDT, load, detail, store,
    peek: name => (store[name] || {}).data,
    error: name => (store[name] || {}).err,
    oldest: () => Math.min(...Object.values(store).filter(s => s.at).map(s => s.at)),
    anyError: () => Object.values(store).some(s => s.err),
  };
})();
