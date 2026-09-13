# 计价目录（DeepSeek 官方已核对）

> 依据需求 3：**模型的费用从模型的提供商官方文档内寻找**。
> 每行单价为「每 1e6 tokens」；`verified` 表示是否已在官方文档核对。
> 真机核对的官方页见文末 Sources。**官方页查无此款的模型一律 `verified:false`
> （估算占位，PENDING）**，面板上标「估算」，等待权威价校准。

## 峰谷计价（DeepSeek 官方口径）

官方价分**高峰**与**空闲**两档，空闲价 = 高峰价的一半；插件按记录时间自动选档
（不传时刻即「现在」），并在面板「本次花费」旁标注当前档位（高峰 / 空闲）。

- 高峰：北京时间（UTC+8）**周一至周五 09:00–12:00 与 14:00–18:00**
- 空闲：其余时间（含午休、夜间、周末）
- 时段定义在 `lib/pricing.js` 的 `DEEPSEEK_PEAK_SCHEDULE`（`tzOffsetMinutes: 480`）

「本次花费」按**每条用量记录自己的时间戳**分别取价后累加，因此跨高峰/空闲的会话
会得到两段价之和，而不是用当前档位套全程。

## 单价表（元/百万 tokens）

| 渠道 | 模型 | 档位 | 输入(未命中) | 缓存读 | 缓存写 | 输出 | 币种 | 来源 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| deepseek-official (paygo) | deepseek-v4-flash | 高峰 | 3.0 | 0.10 | 3.0 | 9.0 | CNY | official | 官方 |
| deepseek-official (paygo) | deepseek-v4-flash | 空闲 | 1.5 | 0.05 | 1.5 | 4.5 | CNY | official | 官方 |
| deepseek-official (paygo) | deepseek-v4-pro | 高峰 | 9.0 | 0.30 | 9.0 | 27.0 | CNY | official | 官方 |
| deepseek-official (paygo) | deepseek-v4-pro | 空闲 | 4.5 | 0.15 | 4.5 | 13.5 | CNY | official | 官方 |
| deepseek-official (paygo) | deepseek-v4-flash-vision-exp | 高峰 | 3.0 | 0.10 | 3.0 | 9.0 | CNY | official | 官方 |
| deepseek-official (paygo) | deepseek-v4-flash-vision-exp | 空闲 | 1.5 | 0.05 | 1.5 | 4.5 | CNY | official | 官方 |
| deepseek-official (paygo) | deepseek-v4.1-flash-expires-on-0910 | 高峰 | 3.0 | 0.10 | 3.0 | 9.0 | CNY | PENDING-estimate | 估算 |
| deepseek-official (paygo) | deepseek-v4.1-flash-expires-on-0910 | 空闲 | 1.5 | 0.05 | 1.5 | 4.5 | CNY | PENDING-estimate | 估算 |
| deepseek-official (fallback) | 未收录模型 | 高峰 | 3.0 | 0.10 | 3.0 | 9.0 | CNY | PENDING-fallback | 估算 |
| deepseek-official (fallback) | 未收录模型 | 空闲 | 1.5 | 0.05 | 1.5 | 4.5 | CNY | PENDING-fallback | 估算 |
| opencode-go-full (plan) | deepseek-v4-flash | — | 0.28 | 0.14 | 0.28 | 0.42 | USD | PENDING | 估算 |
| opencode-go-full (plan) | deepseek-v4-pro | — | 0.55 | 0.27 | 0.55 | 2.19 | USD | PENDING | 估算 |
| opencode-go-full (fallback) | 未收录模型 | — | 0.4 | 0.2 | 0.4 | 1.1 | USD | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.8-max | — | 8 | 2 | 8 | 16 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.7-max | — | 8 | 2 | 8 | 16 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.6-max | — | 8 | 2 | 8 | 16 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.8-plus | — | 4 | 1 | 4 | 12 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.7-plus | — | 4 | 1 | 4 | 12 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.6-plus | — | 4 | 1 | 4 | 12 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.8-flash | — | 1 | 0.2 | 1 | 4 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (paygo) | qwen3.6-flash | — | 1 | 0.2 | 1 | 4 | CNY | PENDING | 估算 |
| qwen-token-plan-cn (fallback) | 未收录模型 | — | 4 | 1 | 4 | 12 | CNY | PENDING | 估算 |

注：
- cacheWrite 官方未单列，按「缓存未命中输入价」计（写入即未命中）。
- deepseek-official 按官方人民币口径（`CNY`，面板显示 ¥）；qwen 按百炼国内站 ¥；
  opencode 按美元（套餐单位价值待校准）。
- 4.1 预览款（`deepseek-v4.1-flash-expires-on-0910`）官方页未收录，按同档 flash 官方价
  估算并标「估算」；校准后把 `verified` 置 true 并补 `source`。
- 设置页「单价覆盖表」优先于目录，且是**单一口径**（不分峰谷，界面不标档位）。

## 余额查询

- **deepseek-official**：已接入官方接口 `GET https://api.deepseek.com/user/balance`，
  响应 `{ is_available, balance_infos:[{ currency:'CNY'|'USD', total_balance,
  granted_balance, topped_up_balance }] }`；多币种时优先人民币。key 先查 DSH 凭据库
  （`credentials` 服务的 ref，即设置页的 env 名，默认 `DEEPSEEK_API_KEY`），再回退环境变量。
- **qwen-token-plan-cn / opencode-go-full**：仍为 PENDING（官方端点待提供），面板显示
  「余额暂不可用」，点刷新提示「余额接口未配置」。
- 外联守卫不变：仅 https、host 精确匹配 `balanceHosts`、`redirect: manual`、10s 超时、
  响应体 ≤512KB、错误只进服务端日志；key 只用于 Authorization 头，不下发界面/不落盘。

## Sources（真机可核对）

- DeepSeek API 官方模型与价格页：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
  - 余额查询接口：https://api-docs.deepseek.com/zh-cn/api/get-user-balance/
  - 核对日期：2026-09-08（v4-flash / v4-pro / v4-flash-vision-exp 三款在售，峰谷时段同页）
- 阿里云百炼 Model Studio 官方计价页：https://www.alibabacloud.com/help/zh/model-studio/model-pricing
- OpenCode Zen（社区/官方文档）：https://opencode.ai/zen
  - 第三方说明：https://github.com/wesammustafa/opencode-primer/blob/main/docs/zen.md

> 说明：qwen 目录里的版本号（qwen3.8 / qwen3.7 …）与 glm-5.x 未出现在任何公开官方页，
> 一律 `verified:false` 估算；DeepSeek 的 v4-flash / v4-pro / v4-flash-vision-exp 已在
> 官方页核对，4.1 预览款尚未收录。
