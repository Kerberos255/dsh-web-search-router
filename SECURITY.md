# Security Policy

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue.

Use GitHub's **Report a vulnerability** / private security advisory flow for this repository. Include the affected version or commit, reproduction steps, and the security impact. Do not include real API keys, tokens, credentials, or private user data in the report.

## Credential handling

`dsh-web-search-router` resolves provider credentials on the DSH host side. Stored credential values are not returned to the browser Settings UI. Router settings stored as ordinary JSON are non-secret and reject credentials embedded in the SearXNG URL.

## Scope

Security reports about DeepSeek Harness itself or third-party search providers should be reported to their respective maintainers unless the issue is caused by this plugin's integration.
