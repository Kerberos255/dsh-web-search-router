import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { DEFAULT_ORDER, PROVIDER_IDS, normalizeEnabled, normalizeOrder, validateRouterConfig } from './router.js'

export const SETTINGS_ROUTE = '/api/plugins/web-search-router/settings'
export const SETTINGS_NAMESPACE = settingsNamespace('web-search-router')
export const TIMEOUT_OPTIONS = Object.freeze([5000, 10000, 15000, 30000])
export const COOLDOWN_OPTIONS = Object.freeze([60, 300, 900, 3600])

export const SETTINGS_SCHEMA = z.object({
  order: z.array(z.string()).default([...DEFAULT_ORDER]),
  enabledProviders: z.array(z.string()).default([...PROVIDER_IDS]),
  timeoutMs: z.number().step(1).default(15000),
  cooldownSeconds: z.number().step(1).default(300),
  fallbackOnEmpty: z.boolean().default(true),
  searxngBaseURL: z.string().default(''),
})

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

async function readLegacySettings(base, log, filePath) {
  const path = filePath ?? join(resolveDshHome(), 'plugins', 'web-search-router.json')
  try {
    const loaded = normalizeSettings(JSON.parse(await readFile(path, 'utf8')), base)
    validateSettings(loaded)
    return loaded
  } catch (error) {
    if (error?.code !== 'ENOENT') log.warn?.(`[web-search-router] legacy settings load failed: ${error?.message || error}`)
    return undefined
  }
}

export function createSettingsStore(ctx, { searxngBaseURL = '', legacyFilePath, log = console } = {}) {
  const base = normalizeSettings({ searxngBaseURL }, { searxngBaseURL })
  let source = () => base
  let scope
  let migration = Promise.resolve()

  ctx.inject(['settings'], (settingsCtx) => {
    const registered = settingsCtx.settings.register(SETTINGS_NAMESPACE, SETTINGS_SCHEMA, {
      base,
      validate: validateSettings,
    })
    scope = registered
    source = () => normalizeSettings(registered.get(), base)

    const descriptor = settingsCtx.settings.describe().find((item) => String(item.ns) === String(SETTINGS_NAMESPACE))
    if (descriptor?.user === undefined) {
      migration = readLegacySettings(base, log, legacyFilePath).then(async (legacy) => {
        if (legacy === undefined) return
        await registered.replace(legacy)
        log.info?.('[web-search-router] migrated legacy settings into DSH settings namespace')
      }).catch((error) => {
        log.warn?.(`[web-search-router] legacy settings migration failed: ${error?.message || error}`)
      })
    }

    settingsCtx.effect(() => () => {
      if (scope === registered) {
        scope = undefined
        source = () => base
      }
    }, 'web-search-router: settings fallback')
  })

  return {
    async get() {
      await migration
      return source()
    },
    async set(value) {
      await migration
      if (scope === undefined) throw new Error('DSH settings service is unavailable')
      const next = normalizeSettings(value, base)
      validateSettings(next)
      await scope.replace(next)
      return source()
    },
  }
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || String(address || '').startsWith('::ffff:127.')
}

async function readJsonBody(req, maxBytes = 65536) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

export function registerSettingsRoute(ctx, store, { credentialRefs = {} } = {}) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) throw new Error('dsh webServer service is unavailable')
  return webServer.register({
    kind: 'exact',
    path: SETTINGS_ROUTE,
    async handler(req, res) {
      if (req.method === 'GET') {
        sendJson(res, 200, { settings: await store.get(), credentialRefs })
        return
      }
      if (req.method === 'PUT') {
        if (!isLoopback(req.socket.remoteAddress)) {
          sendJson(res, 403, { error: 'settings writes require loopback access' })
          return
        }
        try {
          const settings = await store.set(await readJsonBody(req))
          sendJson(res, 200, { settings, credentialRefs })
        } catch (error) {
          sendJson(res, 400, { error: error?.message || 'invalid settings' })
        }
        return
      }
      res.writeHead(405, { allow: 'GET, PUT' })
      res.end()
    },
  })
}
