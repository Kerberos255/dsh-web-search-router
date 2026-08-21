import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  DeepSeekSearchProvider,
  DEEPSEEK_DEFAULT_API_VERSION,
  DEEPSEEK_DEFAULT_MAX_TOKENS,
  DEEPSEEK_DEFAULT_MAX_USES,
} from '@deepseek-ai/dsh-web-search-deepseek'
import { createSearchRouter, RouterError } from './router.js'
import {
  braveSearch,
  duckDuckGoSearch,
  exaSearch,
  firecrawlSearch,
  parallelSearch,
  searxngSearch,
  tavilySearch,
} from './providers.js'
import { createSettingsStore, registerSettingsRoute } from './settings.js'

export const name = 'web-search-router'
export const inject = ['web', 'webServer']

export const Config = z.object({
  searxngBaseURL: z.string().default(''),
  deepseekBaseURL: z.string().default('https://api.deepseek.com/anthropic/v1'),
  deepseekModel: z.string().default('deepseek-v4-flash'),
  deepseekApiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
})

async function resolveCredential(ctx, refName) {
  const ref = String(refName ?? '').trim()
  if (!ref) return undefined
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      if (resolved?.value) return String(resolved.value)
    } catch { /* fall through */ }
  }
  const ambient = launchEnvironmentOf(ctx).get(ref)?.value
  return ambient && String(ambient).length ? String(ambient) : undefined
}

function credentialProvider(ctx, ref, search) {
  return {
    configured: async () => Boolean(await resolveCredential(ctx, ref)),
    async search(request, signal) {
      const apiKey = await resolveCredential(ctx, ref)
      if (!apiKey) throw new Error(`${ref} is not configured`)
      return search({ apiKey, query: request.query, maxResults: request.maxResults, signal })
    },
  }
}

export function apply(ctx, config = {}) {
  const deepseekApiKeyEnv = String(config.deepseekApiKeyEnv || 'DEEPSEEK_API_KEY')
  const credentialRefs = Object.freeze({
    deepseek: deepseekApiKeyEnv,
    tavily: 'TAVILY_API_KEY',
    brave: 'BRAVE_API_KEY',
    exa: 'EXA_API_KEY',
    firecrawl: 'FIRECRAWL_API_KEY',
    parallel: 'PARALLEL_API_KEY',
  })
  const settings = createSettingsStore(ctx, { searxngBaseURL: String(config.searxngBaseURL || ''), log: console })
  ctx.effect(() => registerSettingsRoute(ctx, settings, { credentialRefs }), 'web-search-router: settings route')

  const deepseek = new DeepSeekSearchProvider(() => ({
    resolveApiKey: async () => resolveCredential(ctx, deepseekApiKeyEnv),
    apiKeyEnv: credentialRef(deepseekApiKeyEnv),
    baseURL: String(config.deepseekBaseURL || 'https://api.deepseek.com/anthropic/v1'),
    model: String(config.deepseekModel || 'deepseek-v4-flash'),
    apiVersion: DEEPSEEK_DEFAULT_API_VERSION,
    maxTokens: DEEPSEEK_DEFAULT_MAX_TOKENS,
    maxUses: DEEPSEEK_DEFAULT_MAX_USES,
  }))

  const providers = new Map([
    ['searxng', {
      async configured() {
        const { searxngBaseURL } = await settings.get()
        return Boolean(searxngBaseURL && URL.canParse(searxngBaseURL))
      },
      async search(request, signal) {
        const { searxngBaseURL } = await settings.get()
        return searxngSearch({ baseURL: searxngBaseURL, query: request.query, maxResults: request.maxResults, signal })
      },
    }],
    ['deepseek', {
      configured: async () => Boolean(await resolveCredential(ctx, deepseekApiKeyEnv)),
      search: (request, signal) => deepseek.search(request, signal),
    }],
    ['tavily', credentialProvider(ctx, credentialRefs.tavily, tavilySearch)],
    ['brave', credentialProvider(ctx, credentialRefs.brave, braveSearch)],
    ['exa', credentialProvider(ctx, credentialRefs.exa, exaSearch)],
    ['firecrawl', credentialProvider(ctx, credentialRefs.firecrawl, firecrawlSearch)],
    ['parallel', credentialProvider(ctx, credentialRefs.parallel, parallelSearch)],
    ['duckduckgo', {
      configured: async () => true,
      search: (request, signal) => duckDuckGoSearch({ query: request.query, maxResults: request.maxResults, signal }),
    }],
  ])

  const router = createSearchRouter({ providers, getConfig: () => settings.get(), log: console })
  const web = ctx.get('web')
  if (web === undefined) throw new Error('dsh-web service is unavailable')
  ctx.effect(() => web.registerSearchProvider({
    id: router.id,
    available: () => true,
    async search(request, signal) {
      try {
        return await router.search(request, signal)
      } catch (error) {
        if (error instanceof RouterError && error.code === 'ROUTER_ABORTED') {
          throw new WebError('web search router aborted', 'WEB_ABORTED', { cause: error })
        }
        throw new WebError(
          error?.message || 'web search router failed',
          error?.code === 'ROUTER_UNAVAILABLE' ? 'WEB_PROVIDER_UNAVAILABLE' : 'WEB_PROVIDER_ERROR',
          { cause: error },
        )
      }
    },
  }), 'web-search-router: search provider')

  console.log('[web-search-router] registered search provider')
}
