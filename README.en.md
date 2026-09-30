# dsh-locale-ru

[![self-check](https://github.com/execrat1on/dsh-locale-ru/actions/workflows/test.yml/badge.svg)](https://github.com/execrat1on/dsh-locale-ru/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Russian for the **DeepSeek Harness** web UI: **57 namespaces, 2588 strings** — every piece
of copy Harness serves through its locale dictionaries, from chat and trajectory to
settings, the scheduler and the plugin manager.

The pack renders nothing and occupies no slot: it registers the `ru` language and one
dictionary per namespace. A key without a translation renders in English — raw keys never
reach the interface.

## Enabling it

* **Automatically** — if the browser asks for Russian (`navigator.languages` contains `ru`),
  the interface switches on the next Harness start.
* **Manually** — Settings → General → *Language* → “Русский”. A saved choice wins: if you
  have explicitly selected English, auto-detection stays out of the way — switch the
  language by hand.

## Install

Requirements: DSH `>= 0.2.0-rc.2`, Node.js `>= 20`.

**In one command.** `dsh plugin` is a pnpm wrapper: it clones the public repository and
installs the pack into a profile.

```bash
dsh plugin --profile web add github:execrat1on/dsh-locale-ru#v1.0.0
```

`web` is the profile started by `dsh web` — substitute yours if it is named differently.
It needs `git` on `PATH` (portable MinGit works on Windows). Verified: installing through
pnpm 12.6.0 brings in `dsh-locale-ru 1.0.0` with every file, and the installed manifest
keeps `dsh.bundle.patch`, `platform: web` and the `@deepseek-ai/dsh-client-locale` inject.

**Through the plugin manager.** Settings → Plugins → install a bundle, source `GitHub`,
repository `execrat1on/dsh-locale-ru`. The clone is done by `git`, so it must be on `PATH`.

**From a tarball (when git is unavailable).**

```bash
git clone https://github.com/execrat1on/dsh-locale-ru.git   # or download and unpack the archive
cd dsh-locale-ru
npm pack                                                    # produces dsh-locale-ru-1.0.0.tgz
```

Then install the bundle from that `.tgz` by absolute path — the tarball must stay where it
is, the profile references it.

**Restart.** Restart Harness after installing: the client module table and the manifest are
read at startup.

> **Do not install this next to `awesome-dsh-plugins`.** That bundle already embeds a copy
> of the same translation, so both halves would register `ru` and the same dictionaries.
> The pack survives it — a duplicate language registration is caught and turns into a
> `console.warn`, and the dictionaries register on top — but there is no reason to keep two
> copies. Pick either `dsh-locale-ru` or the embedded pack.

## What is translated

Everything Harness serves through locale dictionaries: `common`, `chat`, `conversation`,
`trajectory`, `workspace`, `settings*`, `pluginManager`, `sidebar*`, `command`,
`shortcut*`, `model`, `plan`, `goal`, `job`, `subagent`, `schedule*`, `deliverable*`,
`voice-input`, `agent-team`, and the remaining namespaces of the client plugins.

The largest dictionaries:

| Namespace | Strings |
|---|---|
| `conversation` | 363 |
| `trajectory` | 192 |
| `schedule.manager` | 187 |
| `chat` | 186 |
| `pluginManager` | 186 |
| `settings.models` | 113 |
| `workspace` | 111 |
| `voice-input` | 101 |

Deliberately left alone: brand names (DeepSeek Harness, DSH), command names (`/plan`,
`/model`), paths, identifiers, model names and technical values such as `UTC`.

## How it works

| File | Role |
|---|---|
| `client.template.js` | The browser-half shell with its `__RU_LOCALE__` and `__RU_PACK__` markers |
| `ru/pack.source.js` | The installer: `addLanguage('ru')` + `register(namespace, 'ru', …)`, guarded against double registration |
| `ru/ru.json` | The assembled dictionary `{ "<namespace>": { "<key>": "…" } }` |
| `ru/parts/*.json` | The 16 review units the dictionary is assembled from |
| `schema/keys.en.json` | Which namespaces and keys DSH ships and the placeholders each one uses; `null` marks an empty source string |
| `build.mjs` | Composes `client.js` from the template, the dictionary and the installer, and syntax-checks the result |
| `client.js` | The shipped artifact: `window.__ModuleLoader__.load({ id: 'dsh-locale-ru', … })` |
| `index.js` | The host half: registers nothing, it exists so the bundle row has a package to mount |
| `tools/assemble.mjs` | Merges the parts into `ru/ru.json` and validates them against the schema |

Nothing is fetched in the browser: the dictionary is embedded in `client.js` (134 KiB), and
the bundle contains no `fetch` and not a single URL.

**No English copy is published here.** `schema/keys.en.json` stores key names and placeholder
sets only (for example `chat :: message.stepProcess.sharedPrefix → ""`, or
`common :: key → "{name}|{count}"`). That is enough to catch a dropped placeholder and to see
which newly added DSH key still lacks a translation, without republishing anyone else's
interface text.

## Updating when DSH adds strings

```bash
npm run assemble     # parts -> ru/ru.json, validated against schema/keys.en.json
npm run build        # ru/ru.json -> client.js
npm test             # 120+ checks, including the genuine LocaleRuntime
```

`assemble` exits non-zero when a namespace or key is missing, a translation is empty, a
placeholder was dropped, or a value contains CJK. Values that still look untranslated are
printed as warnings.

When DSH gains a key, add it to `schema/keys.en.json` (the signature is its placeholders
joined with `|`, or `null` for an empty source), then let `npm run assemble` tell you what
is missing.

## Development

```bash
npm run build     # client.js from the template, the dictionary and the installer
npm run assemble  # ru/ru.json from ru/parts
npm test          # test/verify.mjs + test/dsh-runtime.mjs
```

`test/verify.mjs` needs no framework and no network: the dictionary, the schema (including
"the schema carries no English copy"), the reproducibility of `ru/parts → ru/ru.json`, the
registration of all 57 dictionaries, clean disposal, resilience to double registration, the
absence of networking in the bundle, and the manifest fields.

`test/dsh-runtime.mjs` loads the **genuine** `@deepseek-ai/dsh-client-locale` bundle into a
`vm` sandbox and runs this pack through it: before installing, a `ru-RU` browser gets
English; after, it gets Russian, and all 2588 keys resolve to their values. The DSH root is
located automatically (argument, `DSH_ROOT`, local installs); when no DSH is around the
test reports a skip and exits 0, so CI without a DSH checkout stays green.

**Provenance of `client.js`.** It is a built file, but the build is reproducible:
`node build.mjs` produces the byte-identical result from `client.template.js`,
`ru/pack.source.js` and `ru/ru.json`, and `npm run assemble` rebuilds the dictionary itself
from `ru/parts` just as exactly. This is checkable rather than asserted — the SHA256
matches, and CI additionally runs `git diff --exit-code` after each of the two builds.
Nothing obfuscated or binary ships in this repository.

## See also

* **[dsh-balance](https://github.com/execrat1on/dsh-balance)** — the DeepSeek API balance and
  a peak-hours marker in the sidebar, installed with the same one-liner.

## License

MIT — see [LICENSE](./LICENSE).

The translation is a derivative work of the DeepSeek Harness interface; the original copy
remains with its owners. This repository publishes the Russian translations and the key
names, and reproduces no English source text.

[Русская версия](./README.md)
