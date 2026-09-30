/**
 * Russian language pack for the DSH web GUI.
 *
 * This file is inlined into `client.js` inside the module factory, so it is
 * plain function/const source — no imports or exports. It relies on two names
 * from the surrounding factory scope:
 *
 *   - `RU_LOCALE` — the translation table `{ "<namespace>": { "<key>": "…" } }`
 *     generated into `ru/ru.json` and embedded by `build.mjs`;
 *   - `ctx` — the client plugin context (passed as an argument).
 *
 * The pack registers the `ru` language and one dictionary per namespace. The
 * locale service resolves `ru` through its `en` fallback, so a key that is
 * missing — or that arrives later from a plugin this pack does not translate —
 * still renders in English instead of showing a raw key.
 *
 * Registration is defensive: a duplicate language or namespace (for example a
 * second copy of this bundle, or a hot reload without disposal) must not stop
 * the settings page this bundle also provides.
 */

/** Catalog entry for the selector in Settings → General → Language. */
const RU_LANGUAGE = { id: 'ru', label: 'Русский', fallback: 'en' };

/**
 * Register the Russian language and every translated namespace.
 * @param ctx - client plugin context carrying the `locale` service.
 */
function installRussianLocale(ctx) {
	const locale = ctx.locale;
	const disposers = [];
	try {
		disposers.push(locale.addLanguage(RU_LANGUAGE));
	} catch (error) {
		console.warn('[ru-locale] the ru language was not registered:', error);
	}
	for (const namespace of Object.keys(RU_LOCALE)) {
		try {
			disposers.push(locale.register(namespace, RU_LANGUAGE.id, RU_LOCALE[namespace]));
		} catch (error) {
			console.warn('[ru-locale] dictionary skipped: ' + namespace, error);
		}
	}
	ctx.effect(
		() => () => {
			for (let index = disposers.length - 1; index >= 0; index -= 1) {
				try {
					disposers[index]();
				} catch (error) {
					console.warn('[ru-locale] dispose failed:', error);
				}
			}
			disposers.length = 0;
		},
		'dsh-locale-ru: dictionaries',
	);
}
