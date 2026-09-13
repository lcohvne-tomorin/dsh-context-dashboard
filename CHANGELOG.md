# Changelog

All notable changes to dsh-context-dashboard follow [Keep a Changelog](https://keepachangelog.com/)
and semantic versioning.

## [0.1.0] - 2026-09-03

开发骨架首版（尚未真机验收，按 §12 待使用者装验）。

### Added

- 侧边栏底部状态座（`sidebar.footer.action`）：折叠 pill（上下文环形 + `128K/1M`）、
  点击平滑向上展开面板；rail 窄条态被动环形指示。
- 展开面板按渠道计费形态分支：按量（渠道/模型/上下文/本次花费/账户余额）与
  Token 套餐（渠道/模型/上下文/本次花费/本次使用额度/滚动/每周/每月用量）。
- host 半用量采集：订阅 `session/event`，由 `request/header`（渠道 route）与
  `assistant/message`（usage/contextWindow）提取记录，落盘 `history.jsonl`（bounded）。
- 本地时窗聚合（滚动 N 天 / 自然周 / 自然月）；本次会话累计；四桶单价费用计算。
- 内置计价目录（含来源 URL/核对日期；官方查无此款标估算 `verified:false`）+ 设置页单价覆盖。
- 余额查询框架：白名单域名 HTTPS 守卫、env 只读 key、mock 测试接缝（`DSH_CD_BALANCE_MOCK`）；
  官方接口规格 PENDING。
- 设置分区（8 项）与中英双语；安全端点（回环/同源/CSRF/限流/体上限/错误泛化）。
- 纯逻辑单测 12 例（usage/pricing）。

### Security

- key 仅从环境变量读取，不落盘/不进日志/不下发 client。
- 外联仅限渠道官方域名白名单（https + host 精确匹配 + 不跟随重定向 + 超时/大小上限）。
- 全部 DOM 注入以 `.cd-*` 根类门控，fiber 卸载即移除（可逆）。

## [Unreleased]

### Added

- README 安装章节补发布形态：`dsh plugin add github:lcohvne-tomorin/dsh-context-dashboard#<v0.2.0 全 hash>`（§4.4 锁 40 位 commit）。

## [0.2.0] - 2026-09-13

### Fixed

- **设置分区整页空白**：`SettingsSection` 的提前返回（`cfgD === null` 守卫）卡在
  toast `useEffect` 与单价编辑器 `useState` 之前，异步加载落地后 Hook 数量变化，
  React 抛 "Rendered more hooks than during the previous render" 导致分区崩溃渲染为空。
  现将全部 Hook 提到任何条件返回之前执行；`addS` 初始渠道改由渲染期惰性补值。
  （§5.3/§12.1：`node --check` 通过，单测 20/20。）
- **仪表盘长期停在「等待会话…」**：上下文窗口（分母）只出现在 `request/context`
  事件上，而旧版从 `assistant/message` 读 `data.contextWindow`（该事件没有此字段），
  且完全不订阅 `request/context`，故 `context.available` 恒为 false。现在：
  - 窗口来源按可靠性排序：`Session.requestContext()`（折叠整条日志，恢复旧会话也拿得到）
    > 本进程观察到的 `request/context` 事件 > 落盘历史里最近一次已知窗口；
  - 压力与窗口解耦（压力来自 usage，窗口独立更新），不再要求同一条记录同时带两者；
  - 有 `sessionProjections` 时优先取 token-meter 的 `contextPressure` 视图
    （含压缩后的 `projectedTokens`，与内置上下文环同源），服务缺失则自动回退事件口径；
  - 每条用量记录同时落盘当时的窗口，使跨重启回捞也能算占比。
- 回归测试：恢复旧会话（不再发 `request/context`）与投影可用两条路径各一例；
  新增真机日志回放脚本 `tests/replay-live-log.mjs`（用真实 `session.jsonl.zstd` 验证）。
- **渠道识别**：`deepseek-official` 未登记在 `pricing.CHANNELS`，仪表盘把它显示成
  「未知渠道」、费用恒为 `–`（也不显示上下文条以外的计费行）。现补：
  - `CHANNELS['deepseek-official']`（按量、显示名「DeepSeek 官方」、余额白名单
    `api.deepseek.com`、峰谷时段 `peakSchedule`）；
  - `CATALOG` 4 行 + `CHANNEL_FALLBACK` 兜底价；
  - `storage.js` 余额 key 白名单与默认 ref（`DEEPSEEK_API_KEY`），设置页可改；
  - 单测 +2 例（渠道识别/目录与兜底/覆盖优先级）；真机日志回放显示
    `channelKind: paygo`（此前 `unknown`）。

### Added

- **官方计价（DeepSeek）+ 峰谷自动切换**：按官方「模型 & 价格」页（核对日期 2026-09-08）
  校准 v4-flash / v4-pro / v4-flash-vision-exp 三款，人民币计价，高峰价与空闲价（=高峰一半）
  两套；`resolvePrice(channel, model, overrides, at)` 按传入时刻自动选档并回传
  `window: 'peak'|'offpeak'`。高峰 = 北京时间周一至周五 09:00–12:00 与 14:00–18:00
  （`DEEPSEEK_PEAK_SCHEDULE`，固定 UTC+8）。
  - 「本次花费」改为**逐条记录按自己的时间戳取价**（`usage.costOfRecords`），跨峰谷的会话
    是两段价之和；面板「本次花费」旁标注当前档位（高峰 / 空闲）。
  - 4.1 预览款官方页未收录 → `PENDING-estimate`（按同档 flash 价估算，面板标「估算」）。
  - 单测 +3 例（峰谷选档与边界、逐记录计价、CNY 官方价），集成测试改为峰+谷两条记录
    断言合计 ¥0.525。
- **DeepSeek 余额接入**：`BALANCE_SPECS['deepseek-official']` 使用官方
  `GET https://api.deepseek.com/user/balance`（`balance_infos`，多币种优先人民币）；
  key 解析改为**先凭据库、后环境变量**（`ctx.get('credentials').resolve(ref)`，ref 即设置页
  env 名），只用于 Authorization 头。qwen/opencode 仍 PENDING。
- **启动即知当前会话 + 切换会话即时刷新**：旧版「当前会话」只由 host 侧 `session/event`
  驱动的 `lastActiveId` 决定——启动时尚未收到任何事件故为 null（仪表盘停在「等待会话…」），
  且切换会话（不产生本插件关注的事件）不刷新。现在客户端每次 `/status` 都把 UI 的
  current session（`ctx.sessions.list.current`）作为 `?session=` hint 带给 host；host 优先
  用该 hint 解析当前会话（`resolveCurrentSession`，并用 `ctx.sessions.get(id)` 种入活体
  Session 供 `requestContext`/`sessionProjections`），仅在无 hint 时回退 `lastActiveId`，
  再无会话时用 `sessionQuery.listSessions()` 最近活跃的 live session 兜底。
  新增集成测试一例（hint 解析 / 上下文投影命中）。
- **计费形态颜色指示器**：渠道计费徽标左侧的圆点作为颜色指示——按量（`paygo`）蓝色、
  套餐/Token plan（`plan`）绿色（success）、未知渠道灰色；旧版套餐是警示黄、未知是蓝。
- **修复无效的设计令牌名（上下文条/指示环/圆点因此透明不可见）**：client 原本引用
  `--dsw-alias-state-info-primary` 与 `--dsw-alias-state-warning-primary`，而 DSH 主题里
  根本没有这两个令牌（真实的是 `--dsw-alias-state-warn-primary`，且没有 info 令牌），
  导致上下文进度条填充、上下文环形弧、计费圆点都渲染成透明——数据（19% 占用）正确但
  看不到颜色。现改为 `--dsw-alias-state-business-primary`（DeepSeek 蓝，用作 info 蓝）与
  `--dsw-alias-state-warn-primary`（琥珀），占用条/环/圆点恢复可见。
- **折叠态上下文环与 Settings 按钮对齐**：折叠 pill 内的上下文环由 22px 改为 16px，
  与设置触发器的齿轮图标同尺寸同位，构成整齐的左列（环、齿轮、各自标签起点对齐）。

- 等待权威价校准（qwen/glm 系列与 deepseek 4.1 预览款）；等待 qwen/opencode 余额接口规格。
