// Pure normalization helper for importing older settings. Runtime settings live in config.json.
import { DEFAULT_ORDER, normalizeEnabled, normalizeOrder, validateRouterConfig } from './router.js'
export const TIMEOUT_OPTIONS = [5000, 10000, 15000, 30000, 60000]
export const COOLDOWN_OPTIONS = [60, 300, 900, 3600]
export function normalizeSettings(value = {}, base = {}) {
  const timeoutMs = TIMEOUT_OPTIONS.includes(Number(value.timeoutMs)) ? Number(value.timeoutMs) : 15000
  const cooldownSeconds = COOLDOWN_OPTIONS.includes(Number(value.cooldownSeconds)) ? Number(value.cooldownSeconds) : 300
  const enabled = Array.isArray(value.enabledProviders)
    ? normalizeEnabled(value.enabledProviders)
    : [...DEFAULT_ORDER]
  return {
    order: normalizeOrder(value.order?.length ? value.order : DEFAULT_ORDER),
    enabledProviders: enabled,
    timeoutMs,
    cooldownSeconds,
    fallbackOnEmpty: value.fallbackOnEmpty !== false,
    searxngBaseURL: String(value.searxngBaseURL ?? base.searxngBaseURL ?? '').trim(),
  }
}

export function validateSettings(value) {
  validateRouterConfig(value)
  if (value.searxngBaseURL) {
    const url = new URL(value.searxngBaseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('SearXNG Base URL must use HTTP(S)')
    if (url.username || url.password) throw new Error('SearXNG Base URL must not contain credentials')
  }
}

