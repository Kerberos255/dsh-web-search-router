const UA = 'dsh-web-search-router'

export class ProviderError extends Error {
  constructor(message, status, options = {}) {
    super(message, options)
    this.name = 'ProviderError'
    if (status !== undefined) this.status = status
  }
}

function clampResults(value) {
  return Math.max(1, Math.min(20, Math.floor(Number(value) || 5)))
}

async function responseJson(response, provider) {
  try {
    return await response.json()
  } catch (error) {
    throw new ProviderError(`${provider} returned invalid JSON`, response.status, { cause: error })
  }
}

async function assertOk(response, provider) {
  if (response.ok) return
  let detail = ''
  try {
    const data = await response.clone().json()
    detail = String(data?.error?.message ?? data?.error ?? data?.message ?? '').replace(/\s+/g, ' ').slice(0, 160)
  } catch { /* status is enough */ }
  throw new ProviderError(`${provider} HTTP ${response.status}${detail ? `: ${detail}` : ''}`, response.status)
}

function compactText(value, maxLength) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function source(url, title, snippet, publishedAt) {
  return {
    url: String(url),
    ...(title ? { title: compactText(title, 500) } : {}),
    ...(snippet ? { snippet: compactText(snippet, 2000) } : {}),
    ...(publishedAt ? { publishedAt: compactText(publishedAt, 100) } : {}),
  }
}

export async function searxngSearch({ baseURL, query, maxResults, signal }) {
  const n = clampResults(maxResults)
  const base = String(baseURL).replace(/\/+$/, '')
  const response = await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`, {
    headers: { accept: 'application/json', 'user-agent': UA }, signal,
  })
  await assertOk(response, 'SearXNG')
  const data = await responseJson(response, 'SearXNG')
  const sources = (Array.isArray(data?.results) ? data.results : [])
    .filter((item) => item?.url).slice(0, n)
    .map((item) => source(item.url, item.title || item.url, item.content, item.publishedDate || item.published_date))
  const answers = (Array.isArray(data?.answers) ? data.answers : []).filter((item) => typeof item === 'string' && item.trim())
  return { ...(answers.length ? { content: answers.join('\n') } : {}), sources, truncated: false }
}

export async function tavilySearch({ apiKey, query, maxResults, signal }) {
  const n = clampResults(maxResults)
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ query, max_results: n, include_answer: 'basic', search_depth: 'basic' }), signal,
  })
  await assertOk(response, 'Tavily')
  const data = await responseJson(response, 'Tavily')
  const sources = (Array.isArray(data?.results) ? data.results : [])
    .filter((item) => item?.url).slice(0, n)
    .map((item) => source(item.url, item.title, item.content, item.published_date))
  return { ...(typeof data?.answer === 'string' && data.answer ? { content: data.answer } : {}), sources, truncated: false }
}

export async function braveSearch({ apiKey, query, maxResults, signal }) {
  const n = clampResults(maxResults)
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`, {
    headers: { 'x-subscription-token': apiKey, accept: 'application/json', 'user-agent': UA }, signal,
  })
  await assertOk(response, 'Brave')
  const data = await responseJson(response, 'Brave')
  const sources = (Array.isArray(data?.web?.results) ? data.web.results : [])
    .filter((item) => item?.url).slice(0, n)
    .map((item) => source(item.url, item.title, item.description, item.page_age))
  return { sources, truncated: false }
}

export async function exaSearch({ apiKey, query, maxResults, signal }) {
  const n = clampResults(maxResults)
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ query, type: 'auto', numResults: n, contents: { highlights: { highlightsPerUrl: 1 } } }), signal,
  })
  await assertOk(response, 'Exa')
  const data = await responseJson(response, 'Exa')
  const sources = (Array.isArray(data?.results) ? data.results : [])
    .filter((item) => item?.url).slice(0, n)
    .map((item) => source(item.url, item.title, item.highlights?.find((value) => typeof value === 'string' && value.trim()), item.publishedDate))
  return { sources, truncated: false }
}

export async function firecrawlSearch({ apiKey, query, maxResults, signal }) {
  const n = clampResults(maxResults)
  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ query, limit: n, sources: ['web'] }), signal,
  })
  await assertOk(response, 'Firecrawl')
  const data = await responseJson(response, 'Firecrawl')
  const rows = Array.isArray(data?.data?.web) ? data.data.web : []
  return {
    sources: rows.filter((item) => item?.url).slice(0, n)
      .map((item) => source(item.url, item.title, item.description || item.metadata?.description)),
    truncated: false,
  }
}

export async function parallelSearch({ apiKey, query, maxResults, signal }) {
  const n = clampResults(maxResults)
  const response = await fetch('https://api.parallel.ai/v1/search', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ objective: query, search_queries: [query] }), signal,
  })
  await assertOk(response, 'Parallel')
  const data = await responseJson(response, 'Parallel')
  return {
    sources: (Array.isArray(data?.results) ? data.results : [])
      .filter((item) => item?.url).slice(0, n)
      .map((item) => source(item.url, item.title, Array.isArray(item.excerpts) ? item.excerpts.join(' ') : item.excerpt, item.publish_date)),
    truncated: false,
  }
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
}

function stripHtml(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function decodeDdgUrl(raw) {
  const value = decodeEntities(raw)
  try {
    const url = new URL(value, 'https://duckduckgo.com')
    const redirected = url.searchParams.get('uddg')
    return redirected ? decodeURIComponent(redirected) : url.href
  } catch {
    return value
  }
}

export function parseDuckDuckGoHtml(html, maxResults = 5) {
  const n = clampResults(maxResults)
  const blocks = String(html).split(/<div[^>]+class=["'][^"']*\bresult\b[^"']*["'][^>]*>/i).slice(1)
  const out = []
  for (const block of blocks) {
    const link = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!link) continue
    const snippet = /<(?:a|div)[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i.exec(block)
    const url = decodeDdgUrl(link[1])
    if (!/^https?:\/\//i.test(url)) continue
    out.push(source(url, stripHtml(link[2]), snippet ? stripHtml(snippet[1]) : undefined))
    if (out.length >= n) break
  }
  return out
}

export async function duckDuckGoSearch({ query, maxResults, signal }) {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; dsh-web-search-router/0.1)' }, signal,
  })
  await assertOk(response, 'DuckDuckGo')
  return { sources: parseDuckDuckGoHtml(await response.text(), maxResults), truncated: false }
}
