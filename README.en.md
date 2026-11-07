# Web Search Router for DeepSeek Harness

[简体中文](README.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [Security](SECURITY.md)

Add **provider priority, automatic fallback and relative time filtering** to DSH's built-in `web_search`. Agents keep using the same native tool.

## Features

- Configure provider order, enable/disable state, timeouts and cooldowns in Settings. Failures, rate limits, exhausted quotas and optionally empty results trigger fallback.
- Supports **SearXNG, DeepSeek Search, Tavily, Brave, Exa, Firecrawl, Parallel and DuckDuckGo**; unconfigured providers are skipped.
- DeepSeek Search delegates to DSH's native `deepseek-official` provider and authentication. Third-party API keys are managed through DSH credentials and are never revealed by the settings UI.
- Non-secret settings apply without a DSH restart. Error details are sanitized.

## Install and configure

```sh
dsh plugin --profile desktop add github:Kerberos255/dsh-web-search-router
```

Replace `desktop` with the target profile. Configure provider order and credentials in **Settings → Plugins → Web Search Router**. The agent preset must expose the native `web_search` tool; **installation does not add it to minimal presets**.

## Relative time-range searches

Append one suffix to the query:

```text
company earnings --week
```

Supported suffixes: `--day`, `--week`, `--month` and `--year` (one per query).

- Dated searches use **only the enabled SearXNG provider**, rather than falling back to unrelated providers that may ignore dates.
- A compatible aggregation gateway behind SearXNG may still use multiple internal APIs or free engines.
- Filtering is **best effort**. Upstream engines without date support may return older or undated pages; verify publication dates for time-sensitive results.
- The suffix is interpreted by the router, not added to DSH's native `web_search` schema. Scheduled prompts must explicitly request a suffixed query.

## Notes

- The plugin routes searches; source quality and publication dates remain the responsibility of upstream providers.
- Keep API keys in the DSH host and out of public configuration files.
- See [package.json](package.json) for dependencies and the last tested host runtime.

Tests: `npm test`. See [config.example.json](config.example.json) and [LICENSE](LICENSE).
