/**
 * Self-check for the `dsh-locale-ru` language pack. No framework, no network:
 *
 *   node test/verify.mjs
 *
 * It guards the four things that break a language pack silently:
 *
 *   1. the dictionary — coverage, empty values, zero-width padding, CJK leakage;
 *   2. the schema — that the repository carries key names and placeholder
 *      signatures only, never the English copy the translations derive from;
 *   3. the sources — that `ru/parts/*.json` really rebuild `ru/ru.json`;
 *   4. the bundle — that `client.js` registers `ru` and every namespace through
 *      the `locale` service, disposes cleanly, and needs nothing else.
 *
 * `node test/dsh-runtime.mjs` additionally runs the pack against the genuine
 * DSH `LocaleRuntime` when a DSH installation is reachable.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));

const passed = [];
const failed = [];
const expect = (condition, message) => (condition ? passed : failed).push(message);

const ru = readJson('ru/ru.json');
const schema = readJson('schema/keys.en.json');
const namespaces = Object.keys(ru);
const schemaNamespaces = Object.keys(schema);
const strings = namespaces.reduce((sum, ns) => sum + Object.keys(ru[ns]).length, 0);
const schemaKeys = schemaNamespaces.reduce((sum, ns) => sum + Object.keys(schema[ns]).length, 0);

/* ------------------------------------------------------------- 1. dictionary */

expect(namespaces.length === schemaNamespaces.length, 'the dictionary covers every namespace (' + namespaces.length + ')');
expect(strings === schemaKeys, 'the dictionary holds one string per DSH key (' + strings + ')');
expect(namespaces.every((ns) => Object.keys(ru[ns]).length > 0), 'no namespace is empty');

const emptyAllowed = new Set();
for (const ns of schemaNamespaces) {
  for (const [key, signature] of Object.entries(schema[ns])) {
    if (signature === null) emptyAllowed.add(ns + ' :: ' + key);
  }
}
expect(emptyAllowed.size === 3, 'exactly three DSH keys have an empty source (' + emptyAllowed.size + ')');

let nonString = 0;
let unexpectedlyEmpty = 0;
let zeroWidth = 0;
let cjk = 0;
let untranslated = 0;
for (const namespace of namespaces) {
  for (const [key, value] of Object.entries(ru[namespace])) {
    if (typeof value !== 'string') {
      nonString += 1;
      continue;
    }
    if (value.trim() === '' && !emptyAllowed.has(namespace + ' :: ' + key)) unexpectedlyEmpty += 1;
    if (/[\u200B-\u200D\uFEFF\u2060]/.test(value)) zeroWidth += 1;
    if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value)) cjk += 1;
    // A value identical to its key means the lookup would look "untranslated"
    // to a reader; the three empty-source keys are excluded above.
    if (value === key && !emptyAllowed.has(namespace + ' :: ' + key)) untranslated += 1;
  }
}
expect(nonString === 0, 'every value is a string (bad: ' + nonString + ')');
expect(unexpectedlyEmpty === 0, 'only a source-empty key may be empty (bad: ' + unexpectedlyEmpty + ')');
expect(zeroWidth === 0, 'no value is padded with zero-width characters (bad: ' + zeroWidth + ')');
expect(cjk === 0, 'no Russian value contains CJK characters (bad: ' + cjk + ')');
expect(untranslated === 0, 'no value is a copy of its key (bad: ' + untranslated + ')');

/* ----------------------------------------------------------------- 2. schema */

// A signature is a `|`-joined list of `{placeholder}` names; empty means the
// string has no placeholders at all.
const placeholderPattern = /^(\{[A-Za-z0-9_]+\}(\|\{[A-Za-z0-9_]+\})*)?$/;
let schemaLeak = 0;
let schemaNulls = 0;
for (const namespace of schemaNamespaces) {
  for (const [, signature] of Object.entries(schema[namespace])) {
    if (signature === null) {
      schemaNulls += 1;
      continue;
    }
    // Only placeholder names are allowed: anything with a space, punctuation or
    // a lowercase sentence would be English copy republished by accident.
    if (typeof signature !== 'string' || !placeholderPattern.test(signature)) schemaLeak += 1;
  }
}
expect(schemaNulls === 3, 'the schema marks the three empty sources with null');
expect(schemaLeak === 0, 'the schema stores placeholder signatures only, no English copy (leaks: ' + schemaLeak + ')');
expect(Object.values(schema).every((entry) => typeof entry === 'object' && entry !== null),
  'every schema namespace maps keys to signatures');

const placeholders = (text) => (String(text).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join('|');
let missing = 0;
let mismatched = 0;
let extra = 0;
for (const namespace of schemaNamespaces) {
  const dictionary = ru[namespace];
  if (!dictionary) {
    missing += 1;
    continue;
  }
  for (const [key, signature] of Object.entries(schema[namespace])) {
    const value = dictionary[key];
    if (typeof value !== 'string') {
      missing += 1;
      continue;
    }
    if (signature !== null && value.trim() !== '' && placeholders(value) !== signature) mismatched += 1;
  }
  for (const key of Object.keys(dictionary)) {
    if (!(key in schema[namespace])) extra += 1;
  }
}
expect(missing === 0, 'every DSH key has a Russian value (missing: ' + missing + ')');
expect(mismatched === 0, 'every placeholder survives translation (mismatched: ' + mismatched + ')');
expect(extra === 0, 'no translation targets a key DSH does not ship (extra: ' + extra + ')');

/* ----------------------------------------------------------------- 3. sources */

function flatten(node, out, trail) {
  if (node === null || typeof node !== 'object') return;
  const keys = Object.keys(node);
  const isDictionary = keys.length > 0 && keys.every((key) => typeof node[key] === 'string');
  if (isDictionary && trail.length > 0) {
    const namespace = trail[trail.length - 1];
    out[namespace] = Object.assign({}, out[namespace], node);
    return;
  }
  for (const key of keys) flatten(node[key], out, trail.concat(key));
}

const partFiles = fs.readdirSync(path.join(ROOT, 'ru', 'parts')).filter((name) => name.endsWith('.json')).sort();
expect(partFiles.length === 16, 'the review parts are present (' + partFiles.length + ' files)');
const merged = {};
for (const name of partFiles) {
  let payload;
  try {
    payload = JSON.parse(read(path.join('ru', 'parts', name)));
  } catch (error) {
    expect(false, 'part ' + name + ' is invalid JSON: ' + error.message);
    continue;
  }
  flatten(payload, merged, []);
}
expect(JSON.stringify(merged) === JSON.stringify(ru), 'ru/parts rebuild ru/ru.json exactly — `npm run assemble` is a no-op after a commit');
expect(read('ru/ru.json').endsWith('}\n'), 'ru/ru.json is written with a trailing newline');

/* ------------------------------------------------------------------ 4. bundle */

const required = [];
const win = {};
const sandbox = {
  window: win,
  self: win,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
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
  URL,
};
sandbox.globalThis = sandbox;
win.__ModuleLoader__ = { load(definition) { win.__definition = definition; } };
win.window = win;

vm.runInContext(read('client.js'), vm.createContext(sandbox), { filename: 'client.js' });

const definition = win.__definition;
expect(definition?.id === 'dsh-locale-ru', 'the client module registers under the package name');
expect(typeof definition?.factory === 'function', 'the client module exposes a factory');

const plugin = definition.factory((spec) => {
  required.push(spec);
  throw new Error('unexpected require: ' + spec);
});
expect(required.length === 0, 'the bundle requires no other module at all');
expect(plugin.inject.length === 1 && plugin.inject[0] === 'locale', 'the plugin injects only the locale service');
expect(typeof plugin.apply === 'function', 'the plugin exposes apply()');

/** A fake locale service recording every registration and disposal. */
function makeCtx(options = {}) {
  const calls = { languages: [], dictionaries: [], effects: [], disposers: [], disposed: [] };
  return {
    calls,
    locale: {
      addLanguage(language) {
        calls.languages.push(language);
        if (options.failAddLanguage) throw new Error('duplicate language');
        return () => calls.disposed.push('language');
      },
      register(namespace, id, dictionary) {
        calls.dictionaries.push({ namespace, id, dictionary });
        return () => calls.disposed.push(namespace);
      },
    },
    effect(fn, label) {
      calls.effects.push(label);
      const dispose = fn();
      calls.disposers.push(dispose);
      return typeof dispose === 'function' ? dispose : () => {};
    },
  };
}

const ctx = makeCtx();
plugin.apply(ctx);
expect(ctx.calls.languages.length === 1, 'the pack registers exactly one language');
expect(ctx.calls.languages[0]?.id === 'ru', 'the registered language id is ru');
expect(ctx.calls.languages[0]?.label === 'Русский', 'the language label is Русский');
expect(ctx.calls.languages[0]?.fallback === 'en', 'the language falls back to en');
expect(ctx.calls.dictionaries.length === namespaces.length,
  'one dictionary is registered per namespace (' + ctx.calls.dictionaries.length + ')');
expect(ctx.calls.dictionaries.every((entry) => entry.id === 'ru'), 'every dictionary is registered for ru');

const registeredNamespaces = ctx.calls.dictionaries.map((entry) => entry.namespace).sort();
expect(JSON.stringify(registeredNamespaces) === JSON.stringify(namespaces.slice().sort()),
  'the registered namespaces are exactly the dictionary namespaces');

const byNamespace = new Map(ctx.calls.dictionaries.map((entry) => [entry.namespace, entry.dictionary]));
expect(JSON.stringify(byNamespace.get('common')) === JSON.stringify(ru.common), 'a registered dictionary is the dictionary file, not a copy');
expect(typeof byNamespace.get('common')?.cancel === 'string' && byNamespace.get('common').cancel.length > 0,
  'common.cancel resolves to a Russian string');
expect(byNamespace.get('conversation') !== undefined && Object.keys(byNamespace.get('conversation')).length === 363,
  'the largest namespace arrives whole (conversation: 363 strings)');

expect(ctx.calls.effects.length === 1, 'the pack registers exactly one disposer effect');
expect(ctx.calls.effects[0] === 'dsh-locale-ru: dictionaries', 'the disposer effect is labelled (' + ctx.calls.effects[0] + ')');
expect(ctx.calls.disposers.length === 1 && typeof ctx.calls.disposers[0] === 'function',
  'the pack hands the locale service back through one disposer');

// Disposal must release every registration, in reverse order, and never throw.
ctx.calls.disposers[0]();
expect(ctx.calls.disposed.length === namespaces.length + 1,
  'disposal releases the language and every dictionary (' + ctx.calls.disposed.length + ')');
expect(ctx.calls.disposed[namespaces.length] === 'language', 'the language is released last, after the dictionaries');
expect(new Set(ctx.calls.disposed.slice(0, namespaces.length)).size === namespaces.length,
  'every namespace is released exactly once');

// A second copy of the pack (or a hot reload) must not break the page: the
// language registration fails, the dictionaries still register, nothing throws.
const duplicate = makeCtx({ failAddLanguage: true });
let threw = null;
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
try {
  plugin.apply(duplicate);
} catch (error) {
  threw = error;
} finally {
  console.warn = realWarn;
}
expect(threw === null, 'a duplicate language registration is swallowed, not thrown');
expect(warnings.length === 1 && warnings[0].includes('ru'), 'the duplicate is reported as one console warning instead of a crash');
expect(duplicate.calls.languages.length === 1 && duplicate.calls.languages[0].id === 'ru',
  'the duplicate attempt still asks for ru');
expect(duplicate.calls.dictionaries.length === namespaces.length,
  'the dictionaries still register after a failed language registration');

/* --------------------------------------------------- 5. the bundle is offline */

const clientSource = read('client.js');
expect(!/\bfetch\s*\(/.test(clientSource), 'the bundle never fetches: the dictionary is embedded');
expect(!/XMLHttpRequest|sendBeacon|importScripts/.test(clientSource), 'the bundle contains no other way to reach the network');
// Translations may legitimately quote a URL (a plugin template, an API sample),
// so the rule is not "no URL": every URL in the bundle must come from the
// dictionary, never from code that would load something at runtime.
const dictionaryJson = JSON.stringify(ru);
const bundleUrls = clientSource.match(/https?:\/\/[^\s"']*/g) ?? [];
const foreignUrls = Array.from(new Set(bundleUrls)).filter((url) => !dictionaryJson.includes(url));
expect(foreignUrls.length === 0, 'every URL in the bundle comes from translated copy (foreign: '
  + (foreignUrls.slice(0, 3).join(', ') || 'none') + ')');
expect(clientSource.includes('const RU_LOCALE = {'), 'the bundle embeds the assembled dictionary');
const russianNeedle = ru.common.cancel;
expect(clientSource.includes(JSON.stringify(russianNeedle).slice(1, -1)), 'a Russian string is present verbatim in the bundle');
expect(!/\bimport\s|\bexport\s/.test(clientSource), 'the bundle is a classic module body: no import or export statements');

/* ---------------------------------------------------------------- 6. manifest */

const pkg = readJson('package.json');
expect(pkg.name === 'dsh-locale-ru' && /^\d+\.\d+\.\d+$/.test(pkg.version), 'the manifest carries the package name and a semver version');
expect(pkg.license === 'MIT', 'the manifest declares the MIT licence');
expect(fs.existsSync(path.join(ROOT, pkg.icon)), 'the declared icon file exists');
expect(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'the bundle points at the patch file');
expect(pkg.dsh?.client?.platform === 'web' && pkg.dsh.client.immediately === true,
  'the client half is a web module loaded in the first batch, so the UI starts Russian');
expect(pkg.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-locale'),
  'the client half declares the package that provides the locale service');
expect(pkg.dependencies === undefined, 'the pack has no runtime dependencies');
expect(pkg.private !== true, 'the manifest does not mark the package private');
expect(pkg.scripts?.test?.includes('test/verify.mjs'), 'npm test runs this file');
expect(typeof pkg.engines?.dsh === 'string' && typeof pkg.engines?.node === 'string', 'the manifest declares the DSH and Node ranges');

const patch = read('cordis.patch.yml');
expect(/dsh-locale-ru/.test(patch) && patch.includes('insert:'), 'the patch inserts the dsh-locale-ru host row');
const icon = read('icon.svg');
expect(icon.startsWith('<svg') && icon.includes('</svg>'), 'the icon is a standalone SVG');

for (const locale of ['en', 'ru', 'zh']) {
  const card = readJson('locale/' + locale + '.json');
  expect(typeof card.meta?.title === 'string' && card.meta.title.length > 0, 'locale/' + locale + '.json carries a plugin title');
  expect(typeof card.meta?.description === 'string' && card.meta.description.length > 0, 'locale/' + locale + '.json carries a plugin description');
}
for (const file of ['README.md', 'README.en.md', 'LICENSE', '.gitignore', 'build.mjs', 'index.js', 'client.js']) {
  expect(fs.existsSync(path.join(ROOT, file)), file + ' ships with the repository');
}

/* ------------------------------------------- 7. documented numbers stay true */

for (const file of ['README.md', 'README.en.md']) {
  const text = read(file);
  expect(text.includes(String(namespaces.length)), file + ' states the real namespace count (' + namespaces.length + ')');
  expect(text.includes(String(strings)), file + ' states the real string count (' + strings + ')');
}
expect(read('LICENSE').includes('MIT License') && read('LICENSE').includes('execrat1on'), 'the licence names MIT and the author');

/* ------------------------------------------------------------------- teardown */

if (failed.length > 0) {
  console.log('dsh-locale-ru self-check: ' + passed.length + '/' + (passed.length + failed.length) + ' passed\n');
  console.log('failed:');
  for (const [index, message] of failed.entries()) console.log('  ' + String(index + 1).padStart(2) + '. ' + message);
  console.log('');
  process.exitCode = 1;
} else {
  console.log('dsh-locale-ru self-check: ' + passed.length + '/' + passed.length + ' checks passed');
  console.log('  dictionary : ' + namespaces.length + ' namespaces, ' + strings + ' strings');
  console.log('  schema     : ' + schemaKeys + ' keys, placeholder signatures only');
  console.log('  bundle     : ' + (clientSource.length / 1024).toFixed(1) + ' KiB, embedded dictionary, zero requires');
}
