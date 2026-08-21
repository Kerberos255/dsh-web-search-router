import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchRouter, DEFAULT_ORDER } from '../lib/router.js'

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
