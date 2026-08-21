import test from 'node:test'
import assert from 'node:assert/strict'
import {
  braveSearch,
  exaSearch,
  firecrawlSearch,
  parallelSearch,
  parseDuckDuckGoHtml,
  searxngSearch,
  tavilySearch,
} from '../lib/providers.js'

async function withFetch(mock, run) {
  const original = globalThis.fetch
  globalThis.fetch = mock
  try { return await run() } finally { globalThis.fetch = original }
}

test('Firecrawl adapter uses v2 search and maps web results', async () => {
  await withFetch(async (url, init) => {
    assert.equal(url, 'https://api.firecrawl.dev/v2/search')
    assert.equal(JSON.parse(init.body).sources[0], 'web')
    return new Response(JSON.stringify({ data: { web: [{ url: 'https://example.com', title: 'Example', description: 'Snippet' }] } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }, async () => {
    const result = await firecrawlSearch({ apiKey: 'test-key', query: 'test', maxResults: 3 })
    assert.equal(result.sources[0].snippet, 'Snippet')
  })
})

test('Parallel adapter uses Search API and maps excerpts', async () => {
  await withFetch(async (url, init) => {
    assert.equal(url, 'https://api.parallel.ai/v1/search')
    const body = JSON.parse(init.body)
    assert.equal(body.objective, 'test query')
    assert.deepEqual(body.search_queries, ['test query'])
    return new Response(JSON.stringify({ results: [{ url: 'https://example.com', title: 'Example', excerpts: ['One', 'Two'], publish_date: '2026-01-01' }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }, async () => {
    const result = await parallelSearch({ apiKey: 'test-key', query: 'test query', maxResults: 3 })
    assert.equal(result.sources[0].snippet, 'One Two')
  })
})


test('SearXNG adapter maps answers and results', async () => {
  await withFetch(async (url) => {
    assert.match(String(url), /^https:\/\/search\.example\/search\?q=test&format=json$/)
    return new Response(JSON.stringify({
      answers: ['Direct answer'],
      results: [{ url: 'https://example.com/a', title: 'A', content: 'Snippet A' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }, async () => {
    const result = await searxngSearch({ baseURL: 'https://search.example/', query: 'test', maxResults: 3 })
    assert.equal(result.content, 'Direct answer')
    assert.equal(result.sources[0].snippet, 'Snippet A')
  })
})

test('Tavily adapter sends bounded search request and maps answer', async () => {
  await withFetch(async (url, init) => {
    assert.equal(url, 'https://api.tavily.com/search')
    const body = JSON.parse(init.body)
    assert.equal(body.max_results, 4)
    assert.equal(body.search_depth, 'basic')
    return new Response(JSON.stringify({
      answer: 'Answer',
      results: [{ url: 'https://example.com/t', title: 'T', content: 'T snippet' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }, async () => {
    const result = await tavilySearch({ apiKey: 'test-key', query: 'test', maxResults: 4 })
    assert.equal(result.content, 'Answer')
    assert.equal(result.sources.length, 1)
  })
})

test('Brave adapter maps web results', async () => {
  await withFetch(async (url, init) => {
    assert.match(String(url), /api\.search\.brave\.com\/res\/v1\/web\/search/)
    assert.equal(init.headers['x-subscription-token'], 'test-key')
    return new Response(JSON.stringify({ web: { results: [{ url: 'https://example.com/b', title: 'B', description: 'B snippet' }] } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }, async () => {
    const result = await braveSearch({ apiKey: 'test-key', query: 'test', maxResults: 2 })
    assert.equal(result.sources[0].snippet, 'B snippet')
  })
})

test('Exa adapter keeps URL results even when highlights are absent', async () => {
  await withFetch(async () => new Response(JSON.stringify({
    results: [{ url: 'https://example.com/e', title: 'E', publishedDate: '2026-01-01' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }), async () => {
    const result = await exaSearch({ apiKey: 'test-key', query: 'test', maxResults: 2 })
    assert.equal(result.sources.length, 1)
    assert.equal(result.sources[0].url, 'https://example.com/e')
  })
})

test('DuckDuckGo parser decodes redirect URLs and snippets', () => {
  const html = '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fd">Example &amp; D</a><div class="result__snippet">A <b>useful</b> snippet</div></div>'
  const rows = parseDuckDuckGoHtml(html, 3)
  assert.equal(rows[0].url, 'https://example.com/d')
  assert.equal(rows[0].title, 'Example & D')
  assert.equal(rows[0].snippet, 'A useful snippet')
})
