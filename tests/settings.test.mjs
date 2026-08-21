import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSettingsStore, normalizeSettings } from '../lib/settings.js'
import { PROVIDER_IDS } from '../lib/router.js'

test('normal settings keep an explicit provider order', () => {
  const order = ['parallel', 'firecrawl', ...PROVIDER_IDS.filter((id) => !['parallel', 'firecrawl'].includes(id))]
  const value = normalizeSettings({ order, enabledProviders: ['parallel', 'searxng'], timeoutMs: 10000, cooldownSeconds: 900 })
  assert.deepEqual(value.order, order)
  assert.deepEqual(value.enabledProviders, ['searxng', 'parallel'])
  assert.equal(value.timeoutMs, 10000)
  assert.equal(value.cooldownSeconds, 900)
})

test('settings store persists readable JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-wsr-'))
  const filePath = join(dir, 'settings.json')
  try {
    const store = createSettingsStore({ searxngBaseURL: 'http://127.0.0.1:8890', filePath, log: {} })
    const next = await store.set({
      order: ['brave', ...PROVIDER_IDS.filter((id) => id !== 'brave')],
      enabledProviders: ['brave', 'duckduckgo'],
      timeoutMs: 5000,
      cooldownSeconds: 60,
      fallbackOnEmpty: false,
      searxngBaseURL: 'http://127.0.0.1:8890',
    })
    const disk = JSON.parse(await readFile(filePath, 'utf8'))
    assert.deepEqual(disk, next)
    assert.equal((await store.get()).order[0], 'brave')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})


test('settings reject explicitly disabling every provider', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-wsr-'))
  try {
    const store = createSettingsStore({ filePath: join(dir, 'settings.json'), log: {} })
    await assert.rejects(store.set({ enabledProviders: [] }), /at least one web search provider/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('settings reject non-HTTP SearXNG URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-wsr-'))
  try {
    const store = createSettingsStore({ filePath: join(dir, 'settings.json'), log: {} })
    await assert.rejects(store.set({ searxngBaseURL: 'file:///tmp/search' }), /HTTP\(S\)/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})


test('settings reject credentials embedded in SearXNG URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-wsr-'))
  try {
    const store = createSettingsStore({ filePath: join(dir, 'settings.json'), log: {} })
    await assert.rejects(store.set({ searxngBaseURL: 'https://user:pass@search.example' }), /must not contain credentials/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
