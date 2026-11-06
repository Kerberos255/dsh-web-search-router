import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchRouter, DEFAULT_ORDER, parseTimeRangeQuery } from '../lib/router.js'

function config(overrides = {}) {
  return {
    order: [...DEFAULT_ORDER],
    enabledProviders: [...DEFAULT_ORDER],
    timeoutMs: 2000,
    cooldownSeconds: 300,
    fallbackOnEmpty: true,
    ...overrides,
  }
}

function provider(fn, configured = true) {
  return { configured: async () => configured, search: fn }
}

test('uses providers in configured order and stops on success', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); throw Object.assign(new Error('down'), { status: 503 }) })],
    ['deepseek', provider(async () => { calls.push('deepseek'); return { sources: [{ url: 'https://example.com' }], truncated: false } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config({ order: ['searxng', 'deepseek'] }), log: {} })
  const result = await router.search({ query: 'test', maxResults: 5 })
  assert.deepEqual(calls, ['searxng', 'deepseek'])
  assert.equal(result.sources[0].url, 'https://example.com')
})

test('skips disabled and unconfigured providers', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); return { sources: [] } }, false)],
    ['deepseek', provider(async () => { calls.push('deepseek'); return { sources: [{ url: 'https://deepseek.com' }] } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config({ enabledProviders: ['deepseek'] }), log: {} })
  const result = await router.search({ query: 'test' })
  assert.deepEqual(calls, ['deepseek'])
  assert.equal(result.sources.length, 1)
})

test('falls through on empty result by default', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); return { sources: [] } })],
    ['deepseek', provider(async () => { calls.push('deepseek'); return { sources: [{ url: 'https://ok.test' }] } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config({ order: ['searxng', 'deepseek'] }), log: {} })
  await router.search({ query: 'test' })
  assert.deepEqual(calls, ['searxng', 'deepseek'])
})

test('429 puts provider on cooldown for the next request', async () => {
  let time = 1000
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); throw Object.assign(new Error('rate limit'), { status: 429 }) })],
    ['deepseek', provider(async () => { calls.push('deepseek'); return { sources: [{ url: 'https://ok.test' }] } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config({ order: ['searxng', 'deepseek'] }), log: {}, now: () => time })
  await router.search({ query: 'first' })
  await router.search({ query: 'second' })
  assert.deepEqual(calls, ['searxng', 'deepseek', 'deepseek'])
  time += 301000
  await router.search({ query: 'third' })
  assert.deepEqual(calls, ['searxng', 'deepseek', 'deepseek', 'searxng', 'deepseek'])
})


test('402 quota failures enter cooldown and sanitize provider errors', async () => {
  let time = 1000
  const calls = []
  const warnings = []
  const providers = new Map([
    ['parallel', provider(async () => {
      calls.push('parallel')
      throw Object.assign(new Error('Insufficient credit at https://billing.example/account token-ABCDEFGH12345678'), { status: 402 })
    })],
    ['duckduckgo', provider(async () => {
      calls.push('duckduckgo')
      return { sources: [{ url: 'https://ok.test' }] }
    })],
  ])
  const router = createSearchRouter({
    providers,
    getConfig: () => config({ order: ['parallel', 'duckduckgo'], enabledProviders: ['parallel', 'duckduckgo'] }),
    log: { warn: (message) => warnings.push(message) },
    now: () => time,
  })

  await router.search({ query: 'first' })
  await router.search({ query: 'second' })
  assert.deepEqual(calls, ['parallel', 'duckduckgo', 'duckduckgo'])
  assert.match(warnings[0], /\[url\]/)
  assert.match(warnings[0], /\[redacted\]/)
  assert.doesNotMatch(warnings[0], /billing\.example|ABCDEFGH12345678/)

  time += 301000
  await router.search({ query: 'third' })
  assert.deepEqual(calls, ['parallel', 'duckduckgo', 'duckduckgo', 'parallel', 'duckduckgo'])
})

test('usage-limit text without a status code enters cooldown', async () => {
  const calls = []
  const providers = new Map([
    ['deepseek', provider(async () => { calls.push('deepseek'); throw new Error('Monthly usage limit reached') })],
    ['duckduckgo', provider(async () => { calls.push('duckduckgo'); return { sources: [{ url: 'https://ok.test' }] } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config({ order: ['deepseek', 'duckduckgo'], enabledProviders: ['deepseek', 'duckduckgo'] }), log: {} })
  await router.search({ query: 'first' })
  await router.search({ query: 'second' })
  assert.deepEqual(calls, ['deepseek', 'duckduckgo', 'duckduckgo'])
})

test('caller abort propagates without trying another provider', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); return { sources: [] } })],
    ['duckduckgo', provider(async () => { calls.push('duckduckgo'); return { sources: [{ url: 'https://ok.test' }] } })],
  ])
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  const router = createSearchRouter({ providers, getConfig: () => config({ order: ['searxng', 'duckduckgo'], enabledProviders: ['searxng', 'duckduckgo'] }), log: {} })
  await assert.rejects(router.search({ query: 'test' }, controller.signal), (error) => error?.code === 'ROUTER_ABORTED')
  assert.deepEqual(calls, [])
})


test('time-range suffixes are stripped and normalized without touching ordinary terms', () => {
  for (const range of ['day', 'week', 'month', 'year']) {
    assert.deepEqual(parseTimeRangeQuery(`公告 --${range}`), { query: '公告', timeRange: range })
  }
  assert.deepEqual(parseTimeRangeQuery('中国 新闻 --WEEK   '), { query: '中国 新闻', timeRange: 'week' })
  assert.deepEqual(parseTimeRangeQuery('中文　--DAY'), { query: '中文', timeRange: 'day' })
  assert.deepEqual(parseTimeRangeQuery('news --weeks'), { query: 'news --weeks', timeRange: null })
  assert.deepEqual(parseTimeRangeQuery('news --2week'), { query: 'news --2week', timeRange: null })
  assert.deepEqual(parseTimeRangeQuery('explain --week usage'), { query: 'explain --week usage', timeRange: null })
  assert.deepEqual(parseTimeRangeQuery('no filter'), { query: 'no filter', timeRange: null })
  assert.deepEqual(parseTimeRangeQuery('x--week'), { query: 'x--week', timeRange: null })
})

test('bare and ambiguous time flags reject instead of polluting upstream searches', () => {
  for (const query of ['--week', ' --WEEK ', '新闻 --week --month', '新闻 --week 公告 --month']) {
    assert.throws(() => parseTimeRangeQuery(query), (error) => error.code === 'ROUTER_INVALID_QUERY')
  }
})

test('dated search uses SearXNG even if configured below independent providers', async () => {
  const calls = []
  const providers = new Map([
    ['deepseek', provider(async () => { calls.push('deepseek'); return { sources: [{ url: 'https://old.example' }] } })],
    ['searxng', provider(async (request) => {
      calls.push(request)
      return { content: 'Direct answer', sources: [{ url: 'https://recent.example' }] }
    })],
  ])
  const router = createSearchRouter({
    providers, getConfig: () => config({ order: ['deepseek', 'searxng'] }), log: {},
  })
  const result = await router.search({ query: '公告 --WEEK', maxResults: 3 })
  assert.deepEqual(calls, [{ query: '公告', maxResults: 3, timeRange: 'week' }])
  assert.equal(result.sources[0].url, 'https://recent.example')
  assert.match(result.content, /尽力筛选/)
  assert.match(result.content, /Direct answer/)
})

test('empty dated result succeeds without silently falling back to unfiltered providers', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async (request) => { calls.push(request.timeRange); return { sources: [] } })],
    ['duckduckgo', provider(async () => { calls.push('duckduckgo'); return { sources: [{ url: 'https://old.example' }] } })],
  ])
  const router = createSearchRouter({
    providers, getConfig: () => config({ order: ['searxng', 'duckduckgo'] }), log: {},
  })
  const result = await router.search({ query: '新闻 --day' })
  assert.deepEqual(calls, ['day'])
  assert.deepEqual(result.sources, [])
  assert.match(result.content, /尽力筛选/)
})

test('failed dated search does not fall back to non-date-capable providers', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); throw new Error('gateway down') })],
    ['deepseek', provider(async () => { calls.push('deepseek'); return { sources: [{ url: 'https://old.example' }] } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config(), log: {} })
  await assert.rejects(router.search({ query: '公告 --month' }), (error) => error.code === 'ROUTER_FAILED')
  assert.deepEqual(calls, ['searxng'])
})

test('dated search with disabled SearXNG fails clearly; ordinary search still works', async () => {
  const calls = []
  const providers = new Map([
    ['searxng', provider(async () => { calls.push('searxng'); return { sources: [] } })],
    ['duckduckgo', provider(async () => { calls.push('duckduckgo'); return { sources: [{ url: 'https://ok.example' }] } })],
  ])
  const router = createSearchRouter({ providers, getConfig: () => config({ enabledProviders: ['duckduckgo'] }), log: {} })
  await assert.rejects(router.search({ query: '公告 --year' }), (error) => error.code === 'ROUTER_UNAVAILABLE')
  const result = await router.search({ query: '公告' })
  assert.deepEqual(calls, ['duckduckgo'])
  assert.equal(result.content, undefined)
})

test('provider-request timeout override is used when a gateway needs longer than the global setting', async () => {
  let abortDetected = false
  const providers = new Map([['searxng', {
    configured: async () => true,
    requestTimeoutMs: async () => 2400,
    search: (_req, signal) => new Promise((resolve, reject) => {
      const alarm = setTimeout(() => resolve({ sources: [{ url: 'https://ok.example' }] }), 1100)
      signal.addEventListener('abort', () => {
        clearTimeout(alarm)
        abortDetected = true
        reject(new Error('aborted'))
      }, { once: true })
    }),
  }]])
  const router = createSearchRouter({ providers, getConfig: () => config({ enabledProviders: ['searxng'], timeoutMs: 1000 }), log: {} })
  const result = await router.search({ query: 'test --week' })
  assert.equal(result.sources.length, 1)
  assert.equal(abortDetected, false)
})
