// TS08 — event screen: Tripleseat menu (current) vs old Brigade copy; event guests vs line quantity.
// Run: NODE_PATH=<dir with jsdom> node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const W = f => fs.readFileSync(path.join(__dirname, '..', 'web', f), 'utf8');

function screen(ev, lang = 'it') {
  const body = W('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(body, { runScripts: 'outside-only', url: 'https://app.test/' });
  const w = dom.window;
  w.localStorage.setItem('brigade-app-lang', lang);
  const data = { events: [ev] };
  w.AppApi = { peek: op => (op === 'catering' ? data : undefined), get: () => new Promise(() => {}), hasToken: () => false, call() {}, forget() {}, login() {}, logout() {}, act() {}, clearToken() {} };
  w.APP_CONFIG = { api: 'x', build: 'test' };
  for (const f of ['i18n.js', 'recipe.js']) w.eval(W(f));
  // app.js is one closure: expose its SCREENS to the test only
  w.eval(W('app.js').replace(/\}\)\(\);\s*$/, 'window.__SCREENS = SCREENS; })();'));
  return w.__SCREENS.event.render({ id: ev.id });
}

// Wedding Lauren, 10/10, Tripleseat #60442420 — real saved version (food part)
const LAUREN = { id: 'L', name: 'Wedding Lauren', date: '2026-10-10', time: null, guests: 42, status: 'definite',
  dishes: [{ recipe_id: null, name: '30 full menu - to be chosen', qty: null }],
  ts_menu: { version: 1, received_at: '2026-10-06T20:46:37Z', lines: [
    { section: 'Food', name: 'full menu to be choose', details: '', qty: 41 },
    { section: 'Food', name: 'Bruschetta tomato', details: '', qty: null },
    { section: 'Food', name: 'Penne Cacio e Pepe plus Shrimps', details: '', qty: null },
    { section: 'Food', name: 'Baked vegetables', details: 'senza <b>burro</b>', qty: null },
    { section: 'Beverage', name: 'Espresso Martini', details: '', qty: null } ] } };

test('1. Lauren: Tripleseat menu shown, 42 event guests and ×41 kept distinct', () => {
  const html = screen(LAUREN);
  assert.match(html, /Menu Tripleseat/);
  assert.match(html, /full menu to be choose[\s\S]*quantità ×41/);
  assert.match(html, /Penne Cacio e Pepe plus Shrimps/);
  assert.match(html, /42 ospiti evento \(Tripleseat\)/);
  assert.ok(html.indexOf('Food') < html.indexOf('Beverage'));
  assert.ok(!html.includes('<b>burro'), 'Tripleseat text escaped');
  assert.ok(!/\$|price|prezzo/i.test(html));
});

test('2. the old event_recipes copy is labelled old and comes after the Tripleseat menu', () => {
  const html = screen(LAUREN);
  assert.ok(html.indexOf('Vecchia copia Brigade') > html.indexOf('Menu Tripleseat'));
  assert.match(html, /30 full menu - to be chosen/);
  assert.ok(!/Cosa cucinare/.test(html));
});

test('3. event without Tripleseat document: as before', () => {
  const html = screen({ id: 'M', name: 'Manuale', date: '2026-10-12', guests: 20, dishes: [], ts_menu: null });
  assert.match(html, /Cosa cucinare/);
  assert.match(html, /Menu non ancora definito/);
  assert.match(html, /20 ospiti/);
  assert.ok(!/Tripleseat/.test(html));
});
