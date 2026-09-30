/**
 * End-to-end check of the pack against the genuine DSH `LocaleRuntime`.
 *
 *   node test/dsh-runtime.mjs [path/to/node_modules/@deepseek-ai]
 *
 * The real `@deepseek-ai/dsh-client-locale` client bundle is loaded in a bare
 * `vm` sandbox — no browser and no DSH restart — and this pack is applied to
 * it, so the assertions are made by the same code that serves the running UI:
 *
 *   1. before the pack, a ru-RU browser falls back to English;
 *   2. after it, `ru` is registered and auto-selected;
 *   3. every one of the 2588 keys resolves to its Russian value;
 *   4. switching en → ru → en keeps working, and an unknown key still shows
 *      itself rather than crashing.
 *
 * The DSH root is looked up in this order: the first argument, `DSH_ROOT`, the
 * usual local install locations. When none is found the test reports a skip and
 * exits 0, so CI without a DSH checkout stays green.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const RU_JSON = path.join(ROOT, 'ru', 'ru.json');
const PLUGIN_BUNDLE = path.join(ROOT, 'client.js');

/* ------------------------------------------------- locating the DSH install */

function candidates() {
  const list = [];
  if (process.argv[2]) list.push(process.argv[2]);
  if (process.env.DSH_ROOT) list.push(process.env.DSH_ROOT);
  const require = createRequire(import.meta.url);
  for (const probe of ['@deepseek-ai/dsh-client-locale/package.json', '@deepseek-ai/dsh-core/package.json']) {
    try {
      list.push(path.dirname(path.dirname(require.resolve(probe))));
    } catch {
      /* not installed next to this checkout */
    }
  }
  const npxCache = path.join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
  if (fs.existsSync(npxCache)) {
    for (const entry of fs.readdirSync(npxCache)) {
      list.push(path.join(npxCache, entry, 'node_modules', '@deepseek-ai'));
    }
  }
  for (const base of [ROOT, process.cwd()]) {
    list.push(path.join(base, 'node_modules', '@deepseek-ai'));
  }
  return list;
}

const dshRoot = candidates().find((candidate) => candidate
  && fs.existsSync(path.join(candidate, 'dsh-client-locale', 'lib', 'client.js')));
if (!dshRoot) {
  console.log('dsh-runtime: skipped — no DSH installation found.');
  console.log('  pass the path explicitly: node test/dsh-runtime.mjs C:\\path\\to\\node_modules\\@deepseek-ai');
  process.exit(0);
}
const LOCALE_BUNDLE = path.join(dshRoot, 'dsh-client-locale', 'lib', 'client.js');

/* ------------------------------------------------------------- vm plumbing */

const cache = new Map();
const EXTRA_KEYS = ['memo', 'forwardRef', 'createElement', 'Fragment', 'useState', 'useEffect', '__esModule', 'default', 'apply', 'inject', 'name'];
function stub(label) {
  if (cache.has(label)) return cache.get(label);
  const fn = function () {};
  const value = new Proxy(fn, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return undefined;
      if (prop === 'then') return undefined;
      if (prop === 'length') return 0;
      if (prop === 'name') return label;
      if (prop === '__esModule') return true;
      if (prop === 'constructor') return Object;
      if (typeof prop === 'symbol') return undefined;
      return stub(label + '.' + String(prop));
    },
    set() { return true; },
    has() { return true; },
    ownKeys: (target) => Array.from(new Set([...Reflect.ownKeys(target), ...EXTRA_KEYS])),
    getOwnPropertyDescriptor(target, prop) {
      return Object.getOwnPropertyDescriptor(target, prop)
        ?? { value: stub(label + '.' + String(prop)), enumerable: true, configurable: true, writable: true };
    },
    apply: () => stub(label + '()'),
    construct: () => stub('new ' + label),
  });
  cache.set(label, value);
  return value;
}

/** Load one `window.__ModuleLoader__.load({...})` bundle and return its plugin. */
function loadPlugin(file, languages) {
  const code = fs.readFileSync(file, 'utf8');
  const win = {
    __ModuleLoader__: { load(def) { win.__def = def; } },
    navigator: { language: languages[0], languages },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame() {},
    getComputedStyle: () => stub('computedStyle'),
    document: {
      createElement: () => stub('element'),
      head: stub('head'),
      body: stub('body'),
      documentElement: stub('html'),
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    fetch: () => Promise.reject(new Error('no network')),
    crypto: { randomUUID: () => 'x', getRandomValues: (a) => a },
  };
  win.window = win;
  win.self = win;
  const sandbox = {
    window: win,
    self: win,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    JSON,
    Map,
    Set,
    WeakMap,
    Symbol,
    RegExp,
    Error,
    TypeError,
    Function,
    Reflect,
    Proxy,
    AbortController,
    URL,
    URLSearchParams,
    navigator: win.navigator,
    document: win.document,
    localStorage: win.localStorage,
    location: win.location,
    matchMedia: win.matchMedia,
    getComputedStyle: win.getComputedStyle,
    fetch: win.fetch,
    crypto: win.crypto,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { name: path.basename(file) });
  vm.runInContext(code, context, { filename: file, timeout: 20000 });
  const def = win.__def;
  if (!def || typeof def.factory !== 'function') throw new Error('bundle did not register a module: ' + file);
  const exported = def.factory((spec) => stub('require(' + spec + ')'));
  const plugin = exported && exported.default ? exported.default : exported;
  if (!plugin || typeof plugin.apply !== 'function') throw new Error('bundle exports no apply(): ' + file);
  return plugin;
}

/* ------------------------------------------------------- the locale service */

const provided = new Map();
function makeContext(locale) {
  const services = new Map();
  const base = {
    locale,
    slots: {
      installLocale() {},
      inject(_name, fn) { return typeof fn === 'function' ? fn() : undefined; },
      register() { return () => {}; },
    },
    effect(fn) { const disposer = fn(); return typeof disposer === 'function' ? disposer : () => {}; },
    provide(name, value) { provided.set(name, value); },
    on() { return () => {}; },
    emit() {},
    fiber: { uid: 1 },
    configForms: { get: () => undefined, describe: () => ({}) },
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      if (!services.has(prop)) services.set(prop, stub('ctx.' + String(prop)));
      return services.get(prop);
    },
  });
}

const passed = [];
const failed = [];
const expect = (condition, message) => (condition ? passed : failed).push(message);

if (!fs.existsSync(PLUGIN_BUNDLE)) {
  console.error('build first: node build.mjs');
  process.exit(2);
}

const languages = ['ru-RU', 'ru', 'en-US', 'en'];
const localePlugin = loadPlugin(LOCALE_BUNDLE, languages);
await localePlugin.apply(makeContext(undefined));
const runtime = provided.get('locale');
if (!runtime) {
  console.error('the DSH locale bundle did not provide the locale service');
  process.exit(2);
}

const before = runtime.getSnapshot();
expect(before.active === 'en', 'before the pack, a ru-RU browser falls back to "en" (got "' + before.active + '")');

await loadPlugin(PLUGIN_BUNDLE, languages).apply(makeContext(runtime));

const snapshot = runtime.getSnapshot();
expect(snapshot.locales.map((entry) => entry.id).includes('ru'),
  'the ru language is registered (' + snapshot.locales.map((entry) => entry.id).join(', ') + ')');
expect(snapshot.active === 'ru', 'a ru-RU browser auto-selects ru (got "' + snapshot.active + '")');

const ru = JSON.parse(fs.readFileSync(RU_JSON, 'utf8'));
let unresolved = 0;
let wrong = 0;
let total = 0;
for (const [namespace, dictionary] of Object.entries(ru)) {
  for (const [key, expected] of Object.entries(dictionary)) {
    total += 1;
    const actual = runtime.translate(namespace, key);
    if (expected.trim() === '') continue;
    if (actual === key && expected !== key) {
      unresolved += 1;
      if (unresolved <= 5) failed.push('unresolved key: ' + namespace + ' :: ' + key);
      continue;
    }
    if (actual !== expected) {
      wrong += 1;
      if (wrong <= 5) failed.push('wrong value: ' + namespace + ' :: ' + key + ' → ' + JSON.stringify(actual));
    }
  }
}
expect(unresolved === 0, 'every one of the ' + total + ' keys resolves through the real LocaleRuntime (unresolved: ' + unresolved + ')');
expect(wrong === 0, 'every value matches ru/ru.json (mismatches: ' + wrong + ')');

const probe = runtime.translate('common', 'cancel');
expect(probe === ru.common.cancel, 'common.cancel renders Russian (' + JSON.stringify(probe) + ')');
expect(runtime.translate('__no_such_namespace__', 'whatever') === 'whatever',
  'an unknown namespace still shows the key itself');

runtime.setLocale('en');
expect(runtime.translate('common', 'cancel') !== ru.common.cancel, 'switching to en leaves Russian copy behind');
runtime.setLocale('ru');
expect(runtime.translate('common', 'cancel') === ru.common.cancel, 'switching back to ru restores Russian copy');

console.log('locale runtime :', LOCALE_BUNDLE);
console.log('plugin bundle  :', PLUGIN_BUNDLE);
console.log('namespaces     :', Object.keys(ru).length, '| keys checked:', total);
console.log('');
for (const line of passed) console.log('  OK   ' + line);
for (const line of failed) console.log('  FAIL ' + line);
console.log('');
if (failed.length > 0) {
  console.log('FAILED: ' + failed.length + ' check(s)');
  process.exit(1);
}
console.log('ALL CHECKS PASSED (' + passed.length + ')');
