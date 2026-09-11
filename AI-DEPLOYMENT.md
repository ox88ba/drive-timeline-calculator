# AI 栏目部署

本次新增三个栏目：Kimi 行程总评、Dots 景区 AI 建议、Dots 小红书说。
前端开关 DRIVE_AI_ENABLED 已启用。Worker 健康检查会分别报告 Kimi、Dots 与 AI 防护配置状态。

## Cloudflare

使用本仓库 wrangler.toml 发布原有 drive-timeline-api Worker。保留既有地图与 Turnstile Secrets。
通过 Cloudflare 控制台 Secret 或 wrangler secret put 配置 MOONSHOT_API_KEY、DOTS_API_KEY，绝不可写入仓库。
需要既有 TURNSTILE_SECRET，并为 AI_RATE_LIMITER 配置每分钟6次保护。
命令：wrangler deploy --keep-vars。发布后确认导航、POI、地图代理未受影响。

## 验收

- /api/ai-analysis：仅完整行程、有效人机验证可调用；Kimi 返回行程总评。
- /api/scenic-analysis：发送所选 POI；一次返回 advice 与 review。
- 用户点击并同意发送后才调用 Dots，缓存7天；改变停留时间不重复请求。
- 未配置密钥、验证失败、频率限制、超时及非法返回均显示错误，不生成模拟内容。
- 对真实模型各做一次端到端验收后开启前端开关，并更新 config.js 缓存版本。

线上 Worker 与密钥已部署。Dots 已通过真实生成验收；Kimi 当前因服务商账户额度不足返回暂停状态，充值后无需重新配置密钥。小红书说为 AI 综合体验参考，不代表实时笔记汇总。
