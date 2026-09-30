/**
 * Host half of the `dsh-locale-ru` bundle.
 *
 * The whole pack is browser-side: the Client module registers the `ru` language
 * and its dictionaries through `ctx.locale`. The Host half therefore registers
 * nothing and exists only so the bundle row has a resolvable package to mount —
 * without a row the profile would treat the package as a plain dependency and
 * never load the client module.
 */
export const name = 'dsh-locale-ru';

export function apply() {}
