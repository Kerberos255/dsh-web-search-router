import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSettingsStore, normalizeSettings } from '../lib/settings.js'
import { PROVIDER_IDS } from '../lib/router.js'

function fakeSettingsContext(options = {}) {
  const user = Object.hasOwn(options, 'user') ? options.user : {}
  const initial = options.initial
  let current
  let validate = () => {}
  const writes = []
  const ctx = {
    inject(_deps, callback) {
      const settings = {
        register(ns, _schema, options = {}) {
          validate = options.validate ?? (() => {})
          current = initial ?? normalizeSettings(options.base ?? {})
          return {
            get: () => current,
            async replace(next) {
              validate(next)
              current = next
              writes.push(next)
            },
          }
        },
        describe() {
          return [{ ns: 'web-search-router', user }]
        },
      }
      callback({
        settings,
        effect() {},
      })
    },
  }
  return { ctx, writes, current: () => current }
}

test('normal settings keep an explicit provider order', () => {
  const order = ['parallel', 'firecrawl', ...PROVIDER_IDS.filter((id) => !['parallel', 'firecrawl'].includes(id))]
  const value = normalizeSettings({ order, enabledProviders: ['parallel', 'searxng'], timeoutMs: 10000, cooldownSeconds: 900 })
  assert.deepEqual(value.order, order)
  assert.deepEqual(value.enabledProviders, ['searxng', 'parallel'])
  assert.equal(value.timeoutMs, 10000)
  assert.equal(value.cooldownSeconds, 900)
})

test('settings store writes through the DSH settings namespace', async () => {
  const fake = fakeSettingsContext()
  const store = createSettingsStore(fake.ctx, { searxngBaseURL: 'http://127.0.0.1:8890', log: {} })
  const next = await store.set({
    order: ['brave', ...PROVIDER_IDS.filter((id) => id !== 'brave')],
    enabledProviders: ['brave', 'duckduckgo'],
    timeoutMs: 5000,
    cooldownSeconds: 60,
    fallbackOnEmpty: false,
    searxngBaseURL: 'http://127.0.0.1:8890',
  })
  assert.equal(fake.writes.length, 1)
  assert.deepEqual(fake.writes[0], next)
  assert.equal((await store.get()).order[0], 'brave')
})

test('legacy JSON migrates once when the DSH namespace has no user layer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-wsr-'))
  const legacyFilePath = join(dir, 'web-search-router.json')
  try {
    const legacy = {
      order: ['parallel', ...PROVIDER_IDS.filter((id) => id !== 'parallel')],
      enabledProviders: ['parallel', 'duckduckgo'],
      timeoutMs: 10000,
      cooldownSeconds: 900,
      fallbackOnEmpty: false,
      searxngBaseURL: 'http://127.0.0.1:8890',
    }
    await writeFile(legacyFilePath, JSON.stringify(legacy), 'utf8')
    const fake = fakeSettingsContext({ user: undefined })
    const store = createSettingsStore(fake.ctx, { legacyFilePath, log: {} })
    const current = await store.get()
    assert.equal(fake.writes.length, 1)
    assert.equal(current.order[0], 'parallel')
    assert.deepEqual(current.enabledProviders, ['parallel', 'duckduckgo'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('settings reject explicitly disabling every provider', async () => {
  const fake = fakeSettingsContext()
  const store = createSettingsStore(fake.ctx, { log: {} })
  await assert.rejects(store.set({ enabledProviders: [] }), /at least one web search provider/)
})

test('settings reject non-HTTP SearXNG URLs', async () => {
  const fake = fakeSettingsContext()
  const store = createSettingsStore(fake.ctx, { log: {} })
  await assert.rejects(store.set({ searxngBaseURL: 'file:///tmp/search' }), /HTTP\(S\)/)
})

test('settings reject credentials embedded in SearXNG URL', async () => {
  const fake = fakeSettingsContext()
  const store = createSettingsStore(fake.ctx, { log: {} })
  await assert.rejects(store.set({ searxngBaseURL: 'https://user:pass@search.example' }), /must not contain credentials/)
})
