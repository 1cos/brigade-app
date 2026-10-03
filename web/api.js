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

  async function call(op, body) {
    const tok = ls.get(TOKEN);
    let r;
    try {
      r = await fetch(C.api, { method: 'POST', cache: 'no-store', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(Object.assign({ op }, body || {})) });
    } catch (e) { throw new ApiError(0, 'offline'); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { window.dispatchEvent(new CustomEvent('app-signed-out', { detail: j && j.error })); throw new ApiError(401, (j && j.error) || 'unauthorized'); }
    if (!r.ok) throw new ApiError(r.status, (j && j.error) || 'server_error');
    return j;
  }

  /* small memory cache per op+args; wiped on sign-out */
  const cache = {};
  function get(op, body, ttl = 60000) {
    const k = op + JSON.stringify(body || {});
    const c = cache[k];
    if (c && c.p) return c.p;
    if (c && Date.now() - c.at < ttl) return Promise.resolve(c.data);
    const p = call(op, body).then(d => { cache[k] = { data: d, at: Date.now() }; return d; }, e => { delete cache[k]; throw e; });
    cache[k] = Object.assign(c || {}, { p });
    p.finally(() => { if (cache[k]) delete cache[k].p; window.dispatchEvent(new CustomEvent('app-data')); });
    return p;
  }
  const peek = (op, body) => { const c = cache[op + JSON.stringify(body || {})]; return c && 'data' in c ? c.data : undefined; };
  const forget = op => Object.keys(cache).forEach(k => { if (!op || k.startsWith(op + '{')) delete cache[k]; });

  async function login(pin) {
    const j = await call('login', { pin, install_id: installId() });
    if (j && j.ok && j.token) ls.set(TOKEN, j.token);
    return j;
  }
  async function logout() {
    try { if (ls.get(TOKEN)) await call('logout'); } catch (e) {}
    ls.del(TOKEN); forget();
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const act = (kind, body) => call('act', Object.assign({ kind, client_key: uuid() }, body));

  window.AppApi = { call, get, peek, forget, login, logout, act, hasToken: () => !!ls.get(TOKEN), clearToken: () => ls.del(TOKEN), ApiError };
})();
