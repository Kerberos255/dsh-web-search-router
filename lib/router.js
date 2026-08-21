export const PROVIDER_IDS = Object.freeze([
  'searxng',
  'deepseek',
  'tavily',
  'brave',
  'exa',
  'firecrawl',
  'parallel',
  'duckduckgo',
])

export const DEFAULT_ORDER = Object.freeze([...PROVIDER_IDS])

export class RouterError extends Error {
  constructor(message, code = 'ROUTER_FAILED', options = {}) {
    super(message, options)
    this.name = 'RouterError'
    this.code = code
  }
}

export function normalizeOrder(order) {
  const seen = new Set()
  const normalized = []
  for (const id of Array.isArray(order) ? order : []) {
    if (PROVIDER_IDS.includes(id) && !seen.has(id)) {
      seen.add(id)
      normalized.push(id)
    }
  }
  for (const id of PROVIDER_IDS) {
    if (!seen.has(id)) normalized.push(id)
  }
  return normalized
}

export function normalizeEnabled(enabled) {
  const source = Array.isArray(enabled) ? enabled : PROVIDER_IDS
  return PROVIDER_IDS.filter((id) => source.includes(id))
}

export function validateRouterConfig(config) {
  const enabled = normalizeEnabled(config?.enabledProviders)
  if (enabled.length === 0) throw new Error('at least one web search provider must be enabled')
  const timeoutMs = Number(config?.timeoutMs)
  const cooldownSeconds = Number(config?.cooldownSeconds)
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('timeoutMs must be between 1000 and 120000')
  }
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 1 || cooldownSeconds > 86400) {
    throw new Error('cooldownSeconds must be between 1 and 86400')
  }
}

function safeMessage(error) {
  const raw = error && typeof error.message === 'string' ? error.message : String(error)
  return raw
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b(?:sk|key|token)[-_]?[A-Za-z0-9._-]{8,}\b/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function failureCooldownMs(error, config) {
  const status = Number(error?.status)
  const text = safeMessage(error).toLowerCase()
  const configured = Math.max(1000, Number(config.cooldownSeconds) * 1000)
  if (status === 402 || status === 429 || /rate.?limit|quota|usage limit|too many requests|insufficient (?:credit|balance)|out of credits|billing|exhausted/.test(text)) {
    return configured
  }
  if (status >= 500 || /timeout|timed out|network|fetch failed|econn|enotfound|socket/.test(text)) {
    return Math.min(30000, Math.max(5000, configured))
  }
  if (status === 401 || status === 403 || /credential|api key|unauthor|forbidden/.test(text)) {
    return Math.max(60000, Math.min(900000, configured))
  }
  return 0
}

async function runWithTimeout(operation, outerSignal, timeoutMs) {
  if (outerSignal?.aborted) throw new RouterError('web search aborted', 'ROUTER_ABORTED', { cause: outerSignal.reason })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`provider timeout after ${timeoutMs}ms`)), timeoutMs)
  const onAbort = () => controller.abort(outerSignal.reason ?? new Error('web search aborted'))
  if (outerSignal) outerSignal.addEventListener('abort', onAbort, { once: true })
  try {
    return await operation(controller.signal)
  } catch (error) {
    if (outerSignal?.aborted) throw new RouterError('web search aborted', 'ROUTER_ABORTED', { cause: error })
    if (controller.signal.aborted) {
      const timeoutError = new RouterError(`provider timeout after ${timeoutMs}ms`, 'ROUTER_TIMEOUT', { cause: error })
      timeoutError.status = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort)
  }
}

export function createSearchRouter({ providers, getConfig, log = console, now = () => Date.now() }) {
  const cooldowns = new Map()

  return {
    id: 'web-search-router',
    available() {
      return true
    },
    async search(request, signal) {
      const config = await getConfig()
      validateRouterConfig(config)
      const order = normalizeOrder(config.order)
      const enabled = new Set(normalizeEnabled(config.enabledProviders))
      const maxResults = Math.max(1, Math.min(20, Math.floor(Number(request?.maxResults) || 5)))
      const errors = []
      let attempted = 0

      for (const id of order) {
        if (signal?.aborted) throw new RouterError('web search aborted', 'ROUTER_ABORTED', { cause: signal.reason })
        if (!enabled.has(id)) continue
        const provider = providers.get(id)
        if (!provider) continue
        const cooldownUntil = cooldowns.get(id) ?? 0
        if (cooldownUntil > now()) {
          errors.push(`${id}: cooldown`)
          continue
        }

        let configured = false
        try {
          configured = await provider.configured()
        } catch (error) {
          errors.push(`${id}: config check failed (${safeMessage(error)})`)
          continue
        }
        if (!configured) {
          errors.push(`${id}: not configured`)
          continue
        }

        attempted += 1
        const startedAt = now()
        try {
          const result = await runWithTimeout(
            (providerSignal) => provider.search({ query: String(request.query), maxResults }, providerSignal),
            signal,
            Number(config.timeoutMs),
          )
          const sources = Array.isArray(result?.sources) ? result.sources.slice(0, maxResults) : []
          if (sources.length === 0 && config.fallbackOnEmpty !== false) {
            errors.push(`${id}: empty result`)
            continue
          }
          cooldowns.delete(id)
          log.info?.(`[web-search-router] provider=${id} sources=${sources.length} elapsedMs=${now() - startedAt}`)
          return {
            ...(typeof result?.content === 'string' && result.content ? { content: result.content } : {}),
            sources,
            truncated: Boolean(result?.truncated) || (Array.isArray(result?.sources) && result.sources.length > sources.length),
          }
        } catch (error) {
          if (error?.code === 'ROUTER_ABORTED') throw error
          const cooldownMs = failureCooldownMs(error, config)
          if (cooldownMs > 0) cooldowns.set(id, now() + cooldownMs)
          const message = safeMessage(error)
          errors.push(`${id}: ${message}`)
          log.warn?.(`[web-search-router] provider=${id} failed cooldownMs=${cooldownMs} reason=${message}`)
        }
      }

      if (attempted === 0) {
        throw new RouterError(`no enabled web search provider is configured (${errors.join(' | ')})`, 'ROUTER_UNAVAILABLE')
      }
      throw new RouterError(`all web search providers failed (${errors.join(' | ')})`, 'ROUTER_FAILED')
    },
    _cooldowns: cooldowns,
  }
}
