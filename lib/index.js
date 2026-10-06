import { PluginConfig } from './plugin-settings/remote-config.js'
import { schema } from './config.js'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { WebError } from '@deepseek-ai/dsh-web'
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


export const name = 'web-search-router'
export const inject = ['web', 'dshHomePath']

// The DeepSeek tier delegates to DSH's own registered provider, so its endpoint, model,
// credentials and limits stay owned by DSH instead of being configured again here. The
// gate below only decides whether that provider is worth trying for the current session:
// the account route, or the shared key credential the Models page manages.
const DEEPSEEK_PROVIDER_ID = 'deepseek-official'
const DEEPSEEK_API_KEY = 'DEEPSEEK_API_KEY'
const DEEPSEEK_ACCOUNT_PROVIDER = 'deepseek-account'


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

export function apply(ctx, legacy = {}) {
  const store = new PluginConfig(ctx, { service: 'webSearchRouterSettings', packageName: 'dsh-web-search-router', schema }, legacy)
  const settings = { get: async () => store.configFile.value }
  const credentialRefs = Object.freeze({
    tavily: 'TAVILY_API_KEY',
    brave: 'BRAVE_API_KEY',
    exa: 'EXA_API_KEY',
    firecrawl: 'FIRECRAWL_API_KEY',
    parallel: 'PARALLEL_API_KEY',
  })

  // Looked up per call, so registration order between this plugin and the official
  // DeepSeek provider never matters and a provider that goes away only drops one tier.
  const officialDeepseek = () => ctx.get('web')?.searchProviders?.get(DEEPSEEK_PROVIDER_ID)
  const onDeepseekAccount = () => ctx.get('agents')?.currentInitiator()?.session.requestContext()?.provider === DEEPSEEK_ACCOUNT_PROVIDER
  const deepseekUsable = async () => Boolean(officialDeepseek()) && (onDeepseekAccount() || Boolean(await resolveCredential(ctx, DEEPSEEK_API_KEY)))

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
      configured: deepseekUsable,
      async search(request, signal) {
        const provider = officialDeepseek()
        if (provider === undefined) throw new Error(`the official ${DEEPSEEK_PROVIDER_ID} search provider is not registered`)
        return provider.search(request, signal)
      },
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
