import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DEFAULT_ORDER, normalizeEnabled, normalizeOrder, validateRouterConfig } from './router.js'

export const SETTINGS_ROUTE = '/api/plugins/web-search-router/settings'
export const TIMEOUT_OPTIONS = Object.freeze([5000, 10000, 15000, 30000])
export const COOLDOWN_OPTIONS = Object.freeze([60, 300, 900, 3600])

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

function validateSettings(value) {
  validateRouterConfig(value)
  if (value.searxngBaseURL) {
    const url = new URL(value.searxngBaseURL)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('SearXNG Base URL must use HTTP(S)')
    if (url.username || url.password) throw new Error('SearXNG Base URL must not contain credentials')
  }
}

export function createSettingsStore({ searxngBaseURL = '', filePath, log = console } = {}) {
  const path = filePath ?? join(resolveDshHome(), 'plugins', 'web-search-router.json')
  let current = normalizeSettings({ searxngBaseURL }, { searxngBaseURL })
  const ready = readFile(path, 'utf8')
    .then((raw) => {
      const loaded = normalizeSettings(JSON.parse(raw), { searxngBaseURL })
      validateSettings(loaded)
      current = loaded
    })
    .catch((error) => {
      if (error?.code !== 'ENOENT') log.warn?.(`[web-search-router] settings load failed: ${error?.message || error}`)
    })

  return {
    path,
    async get() {
      await ready
      return current
    },
    async set(value) {
      await ready
      const next = normalizeSettings(value, { searxngBaseURL })
      validateSettings(next)
      await mkdir(dirname(path), { recursive: true })
      const temp = `${path}.${process.pid}.tmp`
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await rename(temp, path)
      current = next
      return current
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
