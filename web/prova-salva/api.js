/* Brigade app — server access. One door (brigade-app-api); identity comes from the session token. */
(function () {
  const C = window.APP_CONFIG;
  const TOKEN = 'brigade-app-token', INSTALL = 'brigade-app-install';
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };
  function installId() {
    let id = ls.get(INSTALL);
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); ls.set(INSTALL, id); }
    return id;
  }
  class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

  /* GEN changes at every sign-out / switch: an answer that arrives later for the previous person is thrown away */
  let GEN = 0;
  async function call(op, body, tokOverride) {
    const tok = tokOverride || ls.get(TOKEN), gen = GEN;
    let r;
    try {
      r = await fetch(C.api, { method: 'POST', cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(Object.assign({ op }, body || {})) });
    } catch (e) { throw new ApiError(0, 'offline'); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (gen !== GEN || (tok && tok !== ls.get(TOKEN) && !tokOverride)) throw new ApiError(0, 'stale');   // not for the person signed in now
    if (r.status === 401) { if (!tokOverride) window.dispatchEvent(new CustomEvent('app-signed-out', { detail: j && j.error })); throw new ApiError(401, (j && j.error) || 'unauthorized'); }
    if (!r.ok) throw new ApiError(r.status, (j && j.error) || 'server_error');
    return j;
  }

  /* small memory cache per op+args; wiped on sign-out */
  const cache = {};
  /* R1.18: the recipe list is also kept on this phone, for the person signed in: at the next start it shows at once
     and is refreshed from the server in the background (never shown to another person: the key carries the session) */
  const KEEP = { mre_list: 1 }, PK = 'brigade-app-pc:';
  const pkey = (op, k) => { const t = ls.get(TOKEN); return t ? PK + op + ':' + t.slice(-16) + ':' + k.length : null; };
  function loadKept(op, k) { if (!KEEP[op] || cache[k]) return; const pk = pkey(op, k); if (!pk) return;
    try { const v = JSON.parse(ls.get(pk) || 'null'); if (v && v.data) cache[k] = { data: v.data, at: 0, kept: true }; } catch (e) {} }
  function keep(op, k, d) { if (!KEEP[op]) return; const pk = pkey(op, k); if (pk) ls.set(pk, JSON.stringify({ data: d, at: Date.now() })); }
  function dropKept() { try { Object.keys(localStorage).filter(x => x.startsWith(PK)).forEach(x => localStorage.removeItem(x)); } catch (e) {} }
  function get(op, body, ttl = 60000) {
    const k = op + JSON.stringify(body || {});
    loadKept(op, k);
    const c = cache[k];
    if (c && c.p) return c.p;
    if (c && Date.now() - c.at < ttl) return Promise.resolve(c.data);
    const gen = GEN;
    const p = call(op, body).then(d => { if (gen !== GEN) throw new ApiError(0, 'stale'); cache[k] = { data: d, at: Date.now() }; keep(op, k, d); return d; }, e => { if (gen === GEN && !(cache[k] && cache[k].kept)) delete cache[k]; throw e; });
    cache[k] = Object.assign(c || {}, { p });
    p.finally(() => { if (cache[k]) delete cache[k].p; window.dispatchEvent(new CustomEvent('app-data')); }).catch(() => {});   // the caller handles the error
    return p;
  }
  const peek = (op, body) => { const k = op + JSON.stringify(body || {}); loadKept(op, k); const c = cache[k]; return c && 'data' in c ? c.data : undefined; };
  const forget = op => { if (!op) { GEN++; dropKept(); } Object.keys(cache).forEach(k => { if (!op || k.startsWith(op + '{')) delete cache[k]; }); };
  /* R1.18: read ahead (a recipe the finger is on, the next ones in the list); one at a time, never in front of a real request */
  const AHEAD = []; let aheadBusy = false;
  function ahead(op, body, ttl) { const k = op + JSON.stringify(body || {}); if (cache[k] || AHEAD.some(x => x.k === k)) return; AHEAD.push({ k, op, body, ttl }); pump(); }
  function pump() { if (aheadBusy || !AHEAD.length) return; const x = AHEAD.shift(); aheadBusy = true;
    const done = () => { aheadBusy = false; setTimeout(pump, 50); }; get(x.op, x.body, x.ttl).then(done, done); }

  async function login(pin) {
    const j = await call('login', { pin, install_id: installId() });
    if (j && j.ok && j.token) ls.set(TOKEN, j.token);
    return j;
  }
  /* sign-out is immediate on the phone: token and memory go first, then the server closes the session */
  async function logout() {
    const tok = ls.get(TOKEN);
    ls.del(TOKEN); forget();
    if (tok) { try { await call('logout', null, tok); } catch (e) {} }
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const act = (kind, body) => call('act', Object.assign({ kind, client_key: uuid() }, body));

  window.AppApi = { call, get, peek, forget, ahead, login, logout, act, hasToken: () => !!ls.get(TOKEN), clearToken: () => ls.del(TOKEN), ApiError };
})();
