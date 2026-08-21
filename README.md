# dsh-web-search-router

[简体中文](README.zh-CN.md)

A priority-ordered multi-provider `web_search` router for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The plugin registers one DSH web search provider (`web-search-router`) and keeps the model-facing tool unchanged: agents still call DSH's built-in `web_search`. Providers are tried from top to bottom and the router stops on the first successful result.

## Features

- Reorder and enable/disable providers from the DSH Settings UI.
- Automatic fallback on missing configuration, provider failures, timeouts, rate limits, quota/credit exhaustion, and (by default) empty results.
- Short cooldowns for transient failures and configurable cooldowns for rate/quota failures.
- Non-secret router settings are stored as readable JSON and apply without restarting DSH.
- API keys stay in DSH credentials / launch environment and are never returned to the Settings UI.
- Provider error messages are sanitized before being logged or returned through the router.

## Providers

| Provider | Configuration |
| --- | --- |
| SearXNG | Base URL in Settings (no API key required) |
| DeepSeek Search | `DEEPSEEK_API_KEY` by default; the credential ref/base URL/model can be overridden in plugin config |
| Tavily | `TAVILY_API_KEY` |
| Brave Search | `BRAVE_API_KEY` |
| Exa | `EXA_API_KEY` |
| Firecrawl | `FIRECRAWL_API_KEY` |
| Parallel | `PARALLEL_API_KEY` |
| DuckDuckGo | No key; best-effort HTML fallback |

Unconfigured providers are skipped automatically.

## Compatibility

Current target: DSH `0.1.0-rc.6` on Node.js 20+.

DeepSeek Harness is still a developer preview and may introduce compatibility-breaking changes. Pin the plugin revision you install and re-test when upgrading DSH.

### Agent preset requirement

This plugin supplies the search backend; it does **not** add a second model-facing tool. Your agent preset must expose DSH's built-in `web_search` tool (for example, the standard preset). A minimal preset that omits `web_search` will not invoke this router.

## Install

Local development:

```bash
dsh plugin --profile web add link:/absolute/path/to/dsh-web-search-router
```

From GitHub after the repository is published (pin a commit or release):

```bash
dsh plugin --profile web add github:Kerberos255/dsh-web-search-router#<commit-or-tag>
```

The bundled patch selects `web-search-router` as DSH's search provider and inserts the plugin with generic defaults.

## Settings

Open **Settings → Plugins → Web Search Router** to:

- reorder providers;
- enable/disable providers;
- configure SearXNG;
- write or clear provider API keys;
- set per-provider timeout and cooldown;
- choose whether an empty result falls through to the next provider.

Non-secret settings are stored at:

```text
$DSH_HOME/plugins/web-search-router.json
```

Settings writes are accepted only from loopback access. API keys are written through DSH credentials; the UI only reads configured/unconfigured state.

## Advanced DeepSeek Search configuration

The plugin defaults to DSH's official DeepSeek Search provider settings. A profile may override them:

```yaml
- id: web-search-router
  config:
    deepseekBaseURL: https://api.deepseek.com/anthropic/v1
    deepseekModel: deepseek-v4-flash
    deepseekApiKeyEnv: DEEPSEEK_API_KEY
```

The Settings UI follows the configured `deepseekApiKeyEnv` credential reference rather than assuming a fixed key name.

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
