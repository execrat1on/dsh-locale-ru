/**
 * Build `client.js` from its sources.
 *
 *   node build.mjs
 *
 * The browser half is a single client module, so the dictionary and the
 * installer are composed into one file here:
 *
 *   client.template.js   the module shell (`window.__ModuleLoader__.load`)
 *   ru/pack.source.js    the installer: `addLanguage('ru')` + one register per namespace
 *   ru/ru.json           the assembled translation table
 *
 * Markers replaced inside the template:
 *   __RU_LOCALE__ -> const RU_LOCALE = <ru/ru.json>
 *   __RU_PACK__   -> the installer source
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(HERE, relative), 'utf8').replace(/^\uFEFF/, '');
const readJson = (relative) => JSON.parse(read(relative));

const template = read('client.template.js');
const ru = readJson('ru/ru.json');
const pack = read(path.join('ru', 'pack.source.js')).trim();

const marker = (name) => '/*__' + name + '__*/';
for (const name of ['RU_LOCALE', 'RU_PACK']) {
  if (!template.includes(marker(name))) throw new Error('client.template.js is missing ' + marker(name));
}

const composed = template
  .replace(marker('RU_LOCALE'), 'const RU_LOCALE = ' + JSON.stringify(ru) + ';')
  .replace(marker('RU_PACK'), pack);

// The bundle must parse before it is written; vm.Script is the syntax check.
new vm.Script(composed, { filename: 'client.js' });

fs.writeFileSync(path.join(HERE, 'client.js'), composed, 'utf8');

const namespaces = Object.keys(ru).length;
const strings = Object.values(ru).reduce((sum, dict) => sum + Object.keys(dict).length, 0);
console.log('client.js written:', (composed.length / 1024).toFixed(1), 'KiB');
console.log('ru namespaces    :', namespaces, '| ru strings:', strings);
