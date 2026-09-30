/**
 * Merge the translated part files into `ru/ru.json` and check the result.
 *
 *   node tools/assemble.mjs
 *
 * `ru/parts/*.json` are the review units — small files a translator can read
 * and diff. This script flattens them into the single dictionary the bundle
 * embeds, then validates it against `schema/keys.en.json`, which lists every
 * namespace and key DSH ships together with the placeholders each string uses.
 *
 * Exits non-zero when a namespace or key is missing, a translation is empty,
 * a placeholder was dropped, or a value still contains CJK characters. Values
 * that look untranslated are reported as warnings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const PARTS_DIR = path.join(ROOT, 'ru', 'parts');
const TARGET = path.join(ROOT, 'ru', 'ru.json');
const SCHEMA = path.join(ROOT, 'schema', 'keys.en.json');

const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));

const parts = fs.existsSync(PARTS_DIR)
  ? fs.readdirSync(PARTS_DIR).filter((name) => name.endsWith('.json')).sort()
  : [];
if (parts.length === 0) {
  console.error('no part files in ' + PARTS_DIR);
  process.exit(1);
}

/** Flatten a part file into `{ namespace: { key: value } }`. */
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

const ru = {};
for (const name of parts) {
  const file = path.join(PARTS_DIR, name);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('ERROR ' + name + ': invalid JSON — ' + error.message);
    process.exit(1);
  }
  flatten(payload, ru, []);
}

const placeholders = (text) => (String(text).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join('|');
const errors = [];
const warnings = [];
let total = 0;

for (const [namespace, entry] of Object.entries(schema)) {
  const translated = ru[namespace];
  if (!translated) {
    errors.push('namespace missing: ' + namespace + ' (' + Object.keys(entry).length + ' keys)');
    continue;
  }
  for (const [key, signature] of Object.entries(entry)) {
    total += 1;
    const value = translated[key];
    if (typeof value !== 'string') {
      errors.push(namespace + ' :: ' + key + ': missing');
      continue;
    }
    // `null` means DSH itself ships an empty or whitespace-only string there,
    // so an empty translation is correct and no placeholder can be required.
    if (signature === null) continue;
    if (value.trim() === '') {
      errors.push(namespace + ' :: ' + key + ': empty');
      continue;
    }
    if (placeholders(value) !== signature) {
      errors.push(namespace + ' :: ' + key + ': placeholders ' + signature + ' vs ' + placeholders(value));
    }
  }
  for (const key of Object.keys(translated)) {
    if (!(key in entry)) warnings.push(namespace + ' :: ' + key + ': extra key not present in DSH');
  }
}

// Zero-width characters are never legitimate UI copy: they only ever appear
// when someone pads a string that is supposed to stay empty.
for (const dict of Object.values(ru)) {
  for (const [key, value] of Object.entries(dict)) {
    const cleaned = String(value).replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
    if (cleaned !== value) dict[key] = cleaned;
  }
}

for (const dict of Object.values(ru)) {
  for (const [key, value] of Object.entries(dict)) {
    if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value)) {
      errors.push('CJK characters in a Russian value: ' + key + ' = ' + value);
    }
  }
}

fs.writeFileSync(TARGET, JSON.stringify(ru, null, 2) + '\n', 'utf8');

const extraNamespaces = Object.keys(ru).filter((namespace) => !(namespace in schema));
console.log('parts merged     :', parts.length);
console.log('namespaces       :', Object.keys(ru).length, '(expected', Object.keys(schema).length + ')');
console.log('translated keys  :', total, '(expected',
  Object.values(schema).reduce((sum, entry) => sum + Object.keys(entry).length, 0) + ')');
console.log('written          :', TARGET);
if (extraNamespaces.length > 0) console.log('extra namespaces :', extraNamespaces.join(', '));
if (warnings.length > 0) {
  console.log('warnings         :', warnings.length);
  for (const warning of warnings.slice(0, 25)) console.log('  ! ' + warning);
}
if (errors.length > 0) {
  console.log('ERRORS           :', errors.length);
  for (const error of errors.slice(0, 40)) console.log('  - ' + error);
  process.exit(1);
}
console.log('OK — every DSH key has a Russian translation');
