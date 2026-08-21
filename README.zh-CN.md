# dsh-web-search-router

[English](README.md)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的多提供方 `web_search` 优先级路由插件。

插件只注册一个 DSH Web Search Provider：`web-search-router`。模型侧工具保持不变，Agent 仍然调用 DSH 内置的 `web_search`；Router 按设置顺序从上到下尝试提供方，第一个成功结果即返回。

## 功能

- 在 DSH Settings 中调整搜索提供方顺序、启用或停用提供方。
- 缺配置、请求失败、超时、限流、额度/余额耗尽时自动 fallback。
- 默认空结果继续尝试下一提供方。
- 临时网络/5xx 使用短冷却；429、quota/credit 类错误使用可配置冷却。
- 排序、启停、超时、冷却等非敏感设置保存为可读 JSON，并可热生效。
- API Key 只进入 DSH credentials / launch environment，Settings UI 不读取已保存的 Key 值。
- Provider 错误在写日志或向 Router 上层返回前会做脱敏处理。

## 支持的提供方

| 提供方 | 配置 |
| --- | --- |
| SearXNG | 在 Settings 填 Base URL；无需 API Key |
| DeepSeek Search | 默认 `DEEPSEEK_API_KEY`；可通过插件配置覆盖 credential ref / Base URL / model |
| Tavily | `TAVILY_API_KEY` |
| Brave Search | `BRAVE_API_KEY` |
| Exa | `EXA_API_KEY` |
| Firecrawl | `FIRECRAWL_API_KEY` |
| Parallel | `PARALLEL_API_KEY` |
| DuckDuckGo | 无 Key；作为 best-effort HTML 兜底 |

未配置的提供方会自动跳过。

## 兼容性

当前目标版本：DSH `0.1.0-rc.6`，Node.js 20+。

DeepSeek Harness 仍处于 developer preview，后续可能出现破坏性兼容变更。建议安装时固定插件 commit/release，并在升级 DSH 后重新测试。

### Agent Preset 要求

本插件负责的是搜索后端，不会额外注册一个新的模型工具。Agent preset 必须包含 DSH 内置 `web_search`（例如标准模式）。如果使用没有挂载 `web_search` 的极简 preset，模型不会调用本 Router。

## 安装

本地开发：

```bash
dsh plugin --profile web add link:/absolute/path/to/dsh-web-search-router
```

GitHub 公开后建议固定 commit 或 release：

```bash
dsh plugin --profile web add github:Kerberos255/dsh-web-search-router#<commit-or-tag>
```

随包 `cordis.patch.yml` 使用通用默认配置：将 DSH 的 search provider 指向 `web-search-router`，并插入插件本身。

## Settings

打开 **设置 → 插件 → Web Search Router** 可进行：

- 调整提供方优先级；
- 启用/停用提供方；
- 配置 SearXNG；
- 写入或清除各提供方 API Key；
- 设置单提供方超时和冷却时间；
- 设置空结果是否继续下一项。

非敏感设置保存在：

```text
$DSH_HOME/plugins/web-search-router.json
```

Settings 写操作只允许 loopback。本插件通过 DSH credentials 写 Key；前端只读取“已配置/未配置”状态。

## DeepSeek Search 高级配置

默认使用 DSH 官方 DeepSeek Search 配置。需要代理或兼容端点时，可由 profile 覆盖：

```yaml
- id: web-search-router
  config:
    deepseekBaseURL: https://api.deepseek.com/anthropic/v1
    deepseekModel: deepseek-v4-flash
    deepseekApiKeyEnv: DEEPSEEK_API_KEY
```

Settings UI 会跟随实际 `deepseekApiKeyEnv`，不会把 DeepSeek Key 名称写死。

## Fallback 规则

对每个已启用提供方，按顺序执行：

1. 未配置或仍在 cooldown 时跳过；
2. 按设置的单提供方超时执行；
3. 成功立即停止并返回；
4. 空结果按策略决定是否继续；
5. 失败则分类、设置必要的 cooldown，并尝试下一提供方。

如果调用方主动 abort，会立即向上抛出，不进行 fallback。

## 开发

```bash
npm test
```

公开测试覆盖路由顺序/fallback/cooldown、设置持久化及 Provider 请求/结果映射。依赖本机 DSH、真实凭证和本机路径的 live 测试不会进入公开仓库。

## 安全

- 不要提交 API Key 或 `.env`。
- 凭证值只在 Host 侧解析。
- Browser 只获得 credential ref 与配置状态，不会获得已保存 Key 值。
- Router 在日志和失败摘要中会脱敏 URL 以及疑似 key/token 字符串。

## License

MIT
