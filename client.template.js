/**
 * Browser half of the `dsh-locale-ru` bundle.
 *
 * Compiles into `client.js` through `build.mjs`, which replaces the two marker
 * comments in the body below:
 *
 *   `__RU_LOCALE__` -> `const RU_LOCALE = { "<namespace>": { … } };`
 *   `__RU_PACK__`   -> the installer source from `ru/pack.source.js`
 *
 * The pack is deliberately a plain dictionary registration: it borrows no
 * component, renders nothing and occupies no slot. The only contract it needs
 * is the `locale` client service, and the only thing it adds is the `ru`
 * language plus one dictionary per namespace.
 */
window.__ModuleLoader__.load({
	id: 'dsh-locale-ru',
	factory(require) {
		void require;

		/*__RU_LOCALE__*/
		/*__RU_PACK__*/

		return {
			inject: ['locale'],
			apply(ctx) {
				installRussianLocale(ctx);
			},
		};
	},
});
