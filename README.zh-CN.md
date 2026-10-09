# DSH 网页搜索路由（Web Search Router）

[English](README.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [安全说明](SECURITY.md)

为 DSH 的原生 `web_search` 提供**多搜索服务优先级与自动降级路由**，无需给模型增加另一个搜索工具。

插件只注册一个 DSH Web Search Provider：`web-search-router`。模型侧工具保持不变，Agent 仍然调用 DSH 内置的 `web_search`；Router 按设置顺序从上到下尝试提供方，第一个成功结果即返回。

## 功能

- 在 DSH Settings 中调整搜索提供方顺序、启用或停用提供方。
- 缺配置、请求失败、超时、限流、额度/余额耗尽时自动 fallback。
- 默认空结果继续尝试下一提供方。
- 临时网络/5xx 使用短冷却；429、quota/credit 类错误使用可配置冷却。
- 排序、启停、超时、冷却等非敏感设置保存在 `$DSH_HOME` 旁边的 `plugins/dsh-web-search-router/config.json`，改完热生效。
- API Key 只进入 DSH credentials / launch environment，Settings UI 不读取已保存的 Key 值。
- Provider 错误在写日志或向 Router 上层返回前会做脱敏处理。

## 支持的提供方

| 提供方 | 配置 |
| --- | --- |
| SearXNG | 在 Settings 填 Base URL；无需 API Key |
| DeepSeek Search | 委托给 DSH 自己注册的 `deepseek-official` 提供方：用账号登录，或模型页管理的同一个 `DEEPSEEK_API_KEY` 凭据 |
| Tavily | `TAVILY_API_KEY` |
| Brave Search | `BRAVE_API_KEY` |
| Exa | `EXA_API_KEY` |
| Firecrawl | `FIRECRAWL_API_KEY` |
| Parallel | `PARALLEL_API_KEY` |
| DuckDuckGo | 无 Key；作为 best-effort HTML 兜底 |

未配置的提供方会自动跳过。

## 兼容性

当前运行时与 peer 依赖要求以 [package.json](package.json) 为准。DeepSeek Harness 仍在迭代，后续可能出现破坏性变更；建议实际部署固定 Git 提交，在升级宿主后重新测试。

### Agent Preset 要求

本插件负责的是搜索后端，不会额外注册一个新的模型工具。Agent preset 必须包含 DSH 内置 `web_search`（例如标准模式）。如果使用没有挂载 `web_search` 的极简 preset，模型不会调用本 Router。

## 安装

本地开发：

```bash
dsh plugin --profile web add link:/absolute/path/to/dsh-web-search-router
```

从 GitHub 安装（建议固定 commit 或 release）：

```bash
dsh plugin --profile web add github:Kerberos255/dsh-web-search-router#<commit-or-tag>
```

随包 `cordis.patch.yml` 使用通用默认配置：将 DSH 的 search provider 指向 `web-search-router`，并插入插件本身。

## Settings

打开 **设置 → 插件 → 插件配置 → Web Search Router**，展开卡片后可进行：

- 调整提供方优先级；
- 启用/停用提供方；
- 配置 SearXNG；
- 写入或清除各提供方 API Key；
- 设置单提供方超时和冷却时间；
- 设置空结果是否继续下一项。

非敏感设置保存在 `$DSH_HOME` 旁边的 `plugins/dsh-web-search-router/config.json`；卡片读写的就是这个文件。

Settings 写操作只允许 loopback。本插件通过 DSH credentials 写 Key；前端只读取“已配置/未配置”状态。

## DeepSeek Search 这一档

DeepSeek 这一档自己不配置任何东西：它直接调用 DSH 已注册的 `deepseek-official` 提供方，因此端点、模型、账号或密钥鉴权、单次请求上限全部由 DSH 拥有。在 DSH 自己的网页搜索设置里改端点，这里无需任何额外操作。

仅当该提供方已注册、且当前会话有可用的鉴权途径时才会尝试这一档 —— 会话走 `deepseek-account` 路由，或存在模型页管理的同一个 `DEEPSEEK_API_KEY` 凭据；否则路由直接跳到下一个提供方。

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

## 相关插件

- [浏览器工具](https://github.com/Kerberos255/dsh-browser-tools)：通过 CDP 操作网页。
- [状态卡片](https://github.com/Kerberos255/dsh-status-cards)：查看 DSH 运行与额度状态。

## 许可证

[MIT](LICENSE)
