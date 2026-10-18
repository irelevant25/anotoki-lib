/*
 * @anotoki/lib/auth/session - the client's parts that run only at a moment: a callback's code exchanged for
 * tokens, a refresh, a save of the account's preferences. The library's own: createAuthClient()
 * (@anotoki/lib/auth) loads it the first time one of them is needed - a site never imports it, and its first
 * load does not carry it.
 */

export { finishCallback, refresh, savePreferences } from './src/token-endpoint';
