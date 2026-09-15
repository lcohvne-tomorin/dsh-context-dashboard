# dsh-context-dashboard

上下文仪表盘（Context / Billing Dashboard）· DSH 侧边栏插件

> **Version: 0.3.0** · [CHANGELOG](CHANGELOG.md) · License: MIT
> 状态：**v0.3.0** —— 单测 20/20、host 集成测试 11/11；已在真机 profile
> （`~/.dsh/profiles/web` 裸包挂载）安装运行；设置页余额渠道随模型选择器动态枚举。

## 功能

一个驻留在 DSH 侧边栏底部（Settings 上方，`sidebar.footer.action` 槽）的仪表盘：

- **折叠态（默认）**：只显示「当前会话上下文」的环形百分比与 `128K/1M` 读数，
  宽度与 Settings 按钮对齐；点击平滑向上展开为完整面板，再点收起。
- **侧栏收到 56px rail（窄条）时**：仅显示被动环形指示（不交互），可在设置关闭。
- **展开态按当前渠道的计费形态分支展示**（自动切换）：
  - **按量付费（paygo）**：API 渠道 · 模型名称 · 上下文使用（条 + %）· 本次花费 · 账户余额；
  - **Token 套餐（plan）**：API 渠道 · 模型名称 · 上下文使用 · 本次花费 ·
    本次使用额度（本会话 tokens）· 滚动用量（最近 N 天）· 每周用量 · 每月用量。
- 数据口径（与需求评审一致）：
  - 「当前会话」＝客户端当前选中的会话（`ctx.sessions.list.current`），由每次 `/status`
    的 `?session=` hint 带给 host，故**启动即显示当前会话上下文、手动切换会话即时刷新**；
    读不到 sessions 服务或处于无会话页时回退事件驱动的「最近活跃会话」。上下文＝其最近
    一次请求 `pressure/contextWindow`。窗口（分母）只来自 `request/context`（该事件仅在
    route/容量变化时落盘），故按 `Session.requestContext()` 折叠整条日志解析——恢复旧会话
    同样有效；压力（分子）来自 `assistant/message` 的 usage。若宿主提供 `sessionProjections`，
    优先采用 token-meter 的 `contextPressure` 视图（含压缩后的 `projectedTokens`，与内置环同源）。
  - 「本次花费 / 本次使用额度」＝**整条会话累计**（不含子代理/独立会话）。
  - 「滚动 / 每周 / 每月用量」＝插件自聚用量历史按时窗统计（账户级、本地）。
  - 「本次花费」＝input / cacheRead / cacheWrite / output 四桶 tokens × 各自单价合计。
  - 面板头部「计费形态」徽标自带颜色指示：按量（paygo）→ 蓝、Token 套餐（plan）→ 绿、
    未知渠道 → 灰；上下文使用条与指示环按占用填充（DeepSeek 蓝，超过警示阈值转琥珀）。
    颜色使用 DSH 主题存在的令牌（`state-business-primary` / `state-success-primary` /
    `state-warn-primary` / `label-tertiary`），在各主题下都能正常显色。
- 计价目录内置并可在设置页覆盖；官方查无此款的模型先标「估算」并等待校准。
- 设置分区（设置 → 上下文仪表盘）8 项：折叠默认态+记忆、窄栏环形开关、余额开关与
  密钥来源（渠道清单与模型选择器同步、动态枚举，密钥只读环境变量）、单价覆盖表、
  显示货币与数字简写、统计窗口与聚合范围、上下文警示阈值。界面中英双语自动跟随。

## 安装

### 发布形态（GitHub，§13.2）

```bash
# git 依赖按 §4.4 锁死完整 40 位 commit hash（v0.3.0，main 最新提交，已不含 ACCEPTANCE.md）：
pnpm dsh plugin --profile <profile> add github:lcohvne-tomorin/dsh-context-dashboard#b34c488e01cb0e3fede4dfd81dc16e316fd50bbd
```

### 开发裸包安装

开发裸包安装（复制到 profile 的 `node_modules` 并追加 patch 块）。

```bash
# 1) 复制裸包（profile 为 GUI 所用实例目录，如 ~/.dsh/profiles/web）
cp -r dsh-context-dashboard ~/.dsh/profiles/web/node_modules/dsh-context-dashboard

# 2) 在 profile 的 cordis.patch.yml 追加：
# - insert:
#     - id: dsh-context-dashboard
#       name: dsh-context-dashboard

# 3) 重启 DSH，页面刷新后侧边栏底部出现仪表盘座。
```

> 依赖注入：插件 `dsh.client.platform: "web"`，client 半由 clientModules 按
> `exports["./client"]` 加载；`package.json` 已导出 `./package.json`（挂载依赖）。

## 使用

- 点击底部 pill（环 + `128K/1M`）展开面板；面板随当前会话/渠道自动切换按量/套餐形态。
- 面板右上刷新按钮：强制重查余额（写端点，带 CSRF + 限流）。
- **账户余额 / 配额**：`deepseek-official` 已接入官方接口
  `GET https://api.deepseek.com/user/balance`（面板显示 `¥` 余额与明细）；其余渠道仍为
  PENDING，显示「余额暂不可用」。测试可用 `DSH_CD_BALANCE_MOCK=1` 驱动模拟余额
  （仅测试接缝，非生产路径）。
- **密钥来源**：设置页「余额查询」的渠道清单**与模型选择器同源**（host 半经
  `llm.listProviders()` 动态枚举，不预设渠道；llm 服务不可用时回退内置清单），
  每个渠道一个 env 名输入框（占位符即推荐名）。取 key 先查 DSH 凭据库（`credentials`
  服务的 ref，即所填 env 名；未填回退推荐名如 `DEEPSEEK_API_KEY`），查不到再回退
  环境变量；**只用于 Authorization 头，不落盘、不进日志、不下发界面**。
- 计价：默认取内置目录；设置页「单价覆盖表」优先，目录行只读展示（标注 官方/估算）。

### 计价目录（需求 3：费用以模型提供商官方文档为准）

见 [docs/pricing-catalog.md](docs/pricing-catalog.md)。**DeepSeek 官方三款在售模型
（v4-flash / v4-pro / v4-flash-vision-exp）已按官方页核对，人民币计价，并按官方
「峰谷」口径自动切换**：高峰 = 北京时间周一至周五 09:00–12:00 与 14:00–18:00，
空闲 = 其余时间（价格为高峰的一半）。「本次花费」按每条记录自己的时间戳取价后累加，
面板在该行标注当前档位（高峰 / 空闲）。官方页查无此款的模型（`deepseek-v4.1-flash-expires-on-0910`、
`qwen3.x`、`glm-5.x` 等）以估算占位（`verified:false`），等待权威价校准——校准方式：
设置页单价覆盖表录入（单一口径、不分峰谷），或把权威价表发回本仓库更新 `lib/pricing.js`。

已识别渠道（`pricing.CHANNELS`）：`qwen-token-plan-cn`（按量）、`opencode-go-full`（套餐）、
`deepseek-official`（按量 + 峰谷，DeepSeek 官方 API 路由）。渠道不在表内时仪表盘显示
「未知渠道」且费用为 `–`；新增渠道只需在 `lib/pricing.js` 的 `CHANNELS` / `CATALOG` /
`CHANNEL_FALLBACK` 三处补条目（峰谷渠道再加 `peakSchedule` + `ratesOffPeak`）。

## 权限与影响声明（安装前审查）

- **联网（外联）**：仅当「余额查询」开启且该渠道在 `pricing.CHANNELS.*.balanceHosts`
  白名单内（`dashscope.aliyuncs.com`…/`opencode.ai`/`api.deepseek.com`）才会向**该渠道
  官方账户接口**发 HTTPS 请求，用于查余额/配额；其余无任何外联。外联守卫：仅 https、host
  精确匹配白名单、`redirect: manual`（不跟随）、整体 10s 超时、响应体 ≤512KB、错误仅进
  服务端日志。计价不从网页实时抓取。
- **读写文件**：只写 `$DSH_HOME/storages/dsh-context-dashboard/`（`config.json` /
  `history.jsonl` / `fold.json`）；只读配置与自身 history；不读其它插件存储。密钥不落盘。
- **凭据读取**：余额查询时通过 `ctx.get('credentials').resolve(ref)` 读取**该渠道设置页
  配置的那一个 ref**（默认 `DEEPSEEK_API_KEY` 等）；取不到才回退环境变量。读取到的 key
  只用于该次请求的 `Authorization` 头，不下发界面、不写盘、不进日志；插件不枚举凭据库、
  不读取其它 ref。
- **全局 UI 修改**：仅注入一个 `<style data-plugin="dsh-context-dashboard">` 与
  `sidebar.footer.action` / `settings.section` 两处槽位内容，样式全部以 `.cd-root` /
  `.cd-section` 根类门控；停用/卸载即随 fiber disposer 移除（§5.4/§8.2/§11.1）。
- **数据采集**：**否**。用量历史仅在本地落盘，不向任何第三方上报。
- **写端点鉴权**：`/config`、`/fold`、`/refresh-balance` 均要求回环 Host（§7.2）+
  同源 + 进程级一次性 CSRF 头 `x-dsh-cd-csrf` + 滑动窗口限流（§7.3）+ 体上限（§7.5）；
  错误响应泛化（§7.7）。用户内容经 `textContent` 入 DOM（§7.8）。

## 开发

- host 半 `lib/index.js`：webServer 前缀路由 + `ctx.on('session/event')` 用量采集
  （`request/header`、`request/context`、`assistant/message`）。
- client 半 `lib/client.js`：纯 JS + `React.createElement`，无 JSX/import/构建期依赖。
- 纯逻辑 `lib/usage.js` / `lib/pricing.js` 可独立单测：
  `node lib-check`（见下）；测试 `tests/unit.test.mjs`：
  `node tests/unit.test.mjs`（沙箱内 `node --test` 子进程受限，直跑同进程即可）。
- host 集成测试：`node tests/host.integration.test.mjs`（mock ctx + webServer）。
- 真机日志回放：`node tests/replay-live-log.mjs <session.jsonl.zstd>`——把真实会话
  事件流喂给 host 半并打印 `/status`，用于核对上下文/聚合口径（多帧 zstd 自动拆帧）。
- 规范：开发/修改按工作区内的 `PLUGIN-STANDARD.md` 执行，交付前过 §12 验收清单。
  验收清单（`ACCEPTANCE.md`）属工作区内部交付物，**不随本仓库与 npm 包发布**（已列入
  `.gitignore`）。

## 卸载

1. 从 profile 的 `cordis.patch.yml` 删除该 `- insert:` 块；
2. 删除 `node_modules/dsh-context-dashboard/`；
3. 重启 DSH；
4. （可选）删除 `$DSH_HOME/storages/dsh-context-dashboard/`。

## License

MIT — 见 [LICENSE](LICENSE)。
