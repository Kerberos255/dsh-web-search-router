import { defineConfig } from './plugin-settings/remote-config.js';
import { DEFAULT_ORDER, PROVIDER_IDS } from './router.js';
const ids = value => value.length > 0 && new Set(value).size === value.length && value.every(x => PROVIDER_IDS.includes(x));
const httpURL = (value, allowEmpty = false) => {
  if (!value && allowEmpty) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
};
export const schema = defineConfig({
  order: [...DEFAULT_ORDER], enabledProviders: [...PROVIDER_IDS], timeoutMs: 15000, cooldownSeconds: 300,
  fallbackOnEmpty: true, searxngBaseURL: '',
}, {
  order: value => ids(value) && value.length === PROVIDER_IDS.length,
  enabledProviders: ids,
  timeoutMs: value => [5000, 10000, 15000, 30000, 60000].includes(value),
  cooldownSeconds: value => [60, 300, 900, 3600].includes(value),
  searxngBaseURL: value => httpURL(value, true),
});
