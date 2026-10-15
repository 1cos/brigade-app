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
  function get(op, body, ttl = 60000) {
    const k = op + JSON.stringify(body || {});
    const c = cache[k];
    if (c && c.p) return c.p;
    if (c && Date.now() - c.at < ttl) return Promise.resolve(c.data);
    const gen = GEN;
    const p = call(op, body).then(d => { if (gen !== GEN) throw new ApiError(0, 'stale'); cache[k] = { data: d, at: Date.now() }; return d; }, e => { if (gen === GEN) delete cache[k]; throw e; });
    cache[k] = Object.assign(c || {}, { p });
    p.finally(() => { if (cache[k]) delete cache[k].p; window.dispatchEvent(new CustomEvent('app-data')); }).catch(() => {});   // the caller handles the error
    return p;
  }
  const peek = (op, body) => { const c = cache[op + JSON.stringify(body || {})]; return c && 'data' in c ? c.data : undefined; };
  const forget = op => { if (!op) GEN++; Object.keys(cache).forEach(k => { if (!op || k.startsWith(op + '{')) delete cache[k]; }); };

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

  window.AppApi = { call, get, peek, forget, login, logout, act, hasToken: () => !!ls.get(TOKEN), clearToken: () => ls.del(TOKEN), ApiError };
})();
