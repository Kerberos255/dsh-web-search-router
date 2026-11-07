# DSH 网页搜索路由（Web Search Router）

[English](README.en.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [安全说明](SECURITY.md)

为 DSH 原生 `web_search` 提供**多搜索引擎优先级、故障切换和相对时间过滤**。模型无需学习新的搜索工具。

## 主要功能

- 在插件设置页调整搜索提供方顺序、启停、超时和冷却策略；失败、限流、额度耗尽或按配置无结果时自动切换。
- 支持 **SearXNG、DeepSeek Search、Tavily、Brave、Exa、Firecrawl、Parallel、DuckDuckGo**。未配置的提供方会自动跳过。
- DeepSeek Search 复用 DSH 原生 `deepseek-official` 搜索与鉴权；第三方密钥通过 DSH 凭据服务配置，设置页不显示密钥值。
- 保存配置后无需重启 DSH；敏感错误会脱敏处理。

## 安装与配置

```sh
dsh plugin --profile desktop add github:Kerberos255/dsh-web-search-router
```

替换 `desktop` 为实际 Profile。安装插件后在 **设置 → 插件 → Web Search Router** 配置搜索顺序和凭据，并确认 Agent 预设包含原生 `web_search`。**插件不会自动为极简预设增加这个工具。**

## 相对时间范围搜索

在查询末尾添加一个标记：

```text
公司财报 --week
```

支持 `--day`、`--week`、`--month`、`--year`（一次只能使用一个）。

- 带时间标记的查询**仅走已启用的 SearXNG 提供方**，不切换到可能忽略日期的独立提供方。
- 若 SearXNG 指向兼容的聚合网关，网关仍可在内部使用其他搜索 API 或免费引擎。
- **过滤属于尽力而为**：不支持日期过滤的上游引擎仍可能返回旧内容或未知日期，涉及新闻、公告、财报时应核对原文时间。
- 时间后缀由 Router 解释，不属于 DSH 原生 `web_search` 参数；自动任务需要明确在搜索词结尾加入后缀。

## 注意事项

- 插件仅负责搜索后端，结果质量、来源和日期由上游提供方决定。
- 凭证应保存在 DSH Host，不要把 API Key 或本地配置提交到仓库。
- 具体运行时依赖和已测宿主版本以 [package.json](package.json) 为准。

测试：`npm test`。示例配置见 [config.example.json](config.example.json)，许可见 [LICENSE](LICENSE)。
