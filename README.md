# dsh-web-search-router

[简体中文](README.zh-CN.md)

A priority-ordered multi-provider `web_search` router for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The plugin registers one DSH web search provider (`web-search-router`) and keeps the model-facing tool unchanged: agents still call DSH's built-in `web_search`. Providers are tried from top to bottom and the router stops on the first successful result.

## Features

- Reorder and enable/disable providers from the DSH Settings UI.
- Automatic fallback on missing configuration, provider failures, timeouts, rate limits, quota/credit exhaustion, and (by default) empty results.
- Short cooldowns for transient failures and configurable cooldowns for rate/quota failures.
- Non-secret router settings are stored in `plugins/dsh-web-search-router/config.json` next to `$DSH_HOME` and apply without restarting DSH.
- API keys stay in DSH credentials / launch environment and are never returned to the Settings UI.
- Provider error messages are sanitized before being logged or returned through the router.

## Providers

| Provider | Configuration |
| --- | --- |
| SearXNG | Base URL in Settings (no API key required) |
| DeepSeek Search | Delegates to the `deepseek-official` provider DSH itself registers: the account sign-in, or the shared `DEEPSEEK_API_KEY` credential |
| Tavily | `TAVILY_API_KEY` |
| Brave Search | `BRAVE_API_KEY` |
| Exa | `EXA_API_KEY` |
| Firecrawl | `FIRECRAWL_API_KEY` |
| Parallel | `PARALLEL_API_KEY` |
| DuckDuckGo | No key; best-effort HTML fallback |

Unconfigured providers are skipped automatically.

## Compatibility

Current compatibility target: DSH `0.2.0-rc.2` on Node.js 20+.

DeepSeek Harness is still a developer preview and may introduce compatibility-breaking changes. Pin the plugin revision you install and re-test when upgrading DSH.

### Agent preset requirement

This plugin supplies the search backend; it does **not** add a second model-facing tool. Your agent preset must expose DSH's built-in `web_search` tool (for example, the standard preset). A minimal preset that omits `web_search` will not invoke this router.

## Install

Local development:

```bash
dsh plugin --profile web add link:/absolute/path/to/dsh-web-search-router
```

From GitHub (pin a commit or release):

```bash
dsh plugin --profile web add github:Kerberos255/dsh-web-search-router#<commit-or-tag>
```

The bundled patch selects `web-search-router` as DSH's search provider and inserts the plugin with generic defaults.

## Settings

Open **Settings → Plugins → Plugin configuration → Web Search Router** and expand the card to:

- reorder providers;
- enable/disable providers;
- configure SearXNG;
- write or clear provider API keys;
- set per-provider timeout and cooldown;
- choose whether an empty result falls through to the next provider.

Non-secret settings live in `plugins/dsh-web-search-router/config.json` next to `$DSH_HOME`; the card reads and writes that file.

Settings writes are accepted only from loopback access. API keys are written through DSH credentials; the UI only reads configured/unconfigured state.

## DeepSeek Search tier

The DeepSeek tier configures nothing of its own: it calls the `deepseek-official` provider DSH
itself registered, so the endpoint, the model, the account-or-key authentication, and the
per-request limits all stay owned by DSH. Changing the endpoint in DSH's own Web search settings
needs no extra step here.

The tier is attempted only while that provider is registered and the session can plausibly
authenticate — a session on the `deepseek-account` route, or the shared `DEEPSEEK_API_KEY`
credential the Models page manages for chat. Otherwise the router skips to the next provider.

## Fallback behavior

For each enabled provider, in configured order:

1. skip it if not configured or currently cooling down;
2. run it with the configured timeout;
3. return immediately on success;
4. optionally continue on an empty result;
5. on failure, classify the error and continue to the next provider.

Caller aborts are propagated immediately and never trigger fallback.

## Development

```bash
npm test
```

Tests cover routing order/fallback/cooldowns, settings persistence and provider request/response adapters. Live tests used during local development are intentionally excluded from the public repository because they depend on a running local DSH instance and local credentials.

## Security

- Never commit API keys or `.env` files.
- Credential values are resolved only on the host side.
- The browser receives credential references and configured-state metadata, never stored key values.
- Router errors redact URLs and key/token-like values before logging or surfacing failure details.

## License

MIT
