/**
 * dsh-context-dashboard — host 半（Node / ESM）
 *
 * 职责（Q1–Q9 口径）：
 *  - 订阅官方 `session/event` 事件流：request/header（渠道 route）、
 *    request/context（route + contextWindow）、assistant/message（usage）提取用量记录，
 *    追加到 storages/dsh-context-dashboard/history.jsonl（§6）。
 *    ⚠ 上下文窗口只出现在 request/context（assistant/message 无 contextWindow），
 *    且该事件仅在 route/capacity 变化时落盘——恢复旧会话时不会再发，故窗口一律
 *    优先读 `Session.requestContext()`（对整条日志折叠，重启/恢复同样可靠），
 *    有 sessionProjections 时再优先取 token-meter 的 contextPressure（与内置环同源）。
 *  - 「当前会话」= 最近活跃会话：上下文占比 = 其最近一次请求 pressure/contextWindow；
 *    「本次」累计 = 该会话的全部用量记录（不含其它会话 → 不含子代理，Q2）。
 *  - 「滚动 / 每周 / 每月用量」= 全局用量历史按时窗聚合（Q6 本地聚）。
 *  - 账户余额：只对白名单官方域发 HTTPS（§7.6 简化守卫），key 只读 env；
 *    官方接口规格未供（PENDING）或 mock 开启时走 mock（测试接缝，非生产路径）。
 *  - UI 只经 /dsh-context-dashboard/* HTTP JSON 端点通信（§5.1）；写端点
 *    回环 + 同源 + CSRF + 限流（§7.2/7.3）；错误泛化（§7.7）。
 */
import * as httpkit from './httpkit.js'
import * as storage from './storage.js'
import * as usage from './usage.js'
import * as pricing from './pricing.js'

const NAME = 'dsh-context-dashboard'
const BASE = '/' + NAME

const LIMITS_BODY = { config: 32 * 1024, fold: 4 * 1024, refresh: 4 * 1024 }

/**
 * 余额官方接口规格（null = 未提供 → 走占位/mock）。
 * spec: { url, method, map(json) → { balance:{available,currency}, … } }
 */
const BALANCE_SPECS = {
  'qwen-token-plan-cn': null, // PENDING：待用户提供百炼余额查询端点
  'opencode-go-full': null,   // PENDING：待用户提供 OpenCode Zen 额度查询端点
  // DeepSeek 官方：GET https://api.deepseek.com/user/balance
  // 响应 { is_available, balance_infos:[{ currency:'CNY'|'USD', total_balance,
  //        granted_balance, topped_up_balance }] }；多币种时优先人民币。
  'deepseek-official': {
    url: 'https://api.deepseek.com/user/balance',
    method: 'GET',
    map(json) {
      const infos = (json && Array.isArray(json.balance_infos)) ? json.balance_infos : []
      const pick = infos.find((x) => x && x.currency === 'CNY') || infos[0]
      if (!pick) return {}
      const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
      return {
        balance: {
          available: num(pick.total_balance),
          currency: typeof pick.currency === 'string' ? pick.currency : null,
        },
        detail: { granted: num(pick.granted_balance), toppedUp: num(pick.topped_up_balance) },
      }
    },
  },
}

/** 只读 env 取 key（回退路径）；绝不下发 client / 不写盘 / 不进日志。 */
function envKey(envName) {
  try { return (typeof process !== 'undefined' && process.env) ? process.env[envName] : undefined } catch { return undefined }
}

/**
 * 渠道 → 推荐 env 变量名（凭据 ref）。未预置的渠道按惯例派生：
 * 大写、非字母数字转 `_`、补 `_API_KEY` 尾。仅作默认建议，不落盘。
 */
const SUGGESTED_ENV = {
  'qwen-token-plan-cn': 'QWEN_TOKEN_PLAN_CN_API_KEY',
  'opencode-go-full': 'OPENCODE_GO_FULL_API_KEY',
  'deepseek-official': 'DEEPSEEK_API_KEY',
}
function suggestEnvFor(channel) {
  if (SUGGESTED_ENV[channel]) return SUGGESTED_ENV[channel]
  const base = String(channel).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!base) return ''
  return /_API_KEY$/.test(base) ? base : `${base}_API_KEY`
}

function mockEnabled() {
  try { return typeof process !== 'undefined' && process.env && process.env.DSH_CD_BALANCE_MOCK === '1' } catch { return false }
}

/* ---------- 会话/用量内聚状态 ---------- */
function createSessionState() {
  // history 仅本次进程内，供即时聚合；session 是活体 Session 引用，用于折叠日志取窗口
  return { lastHeader: null, latest: null, history: [], contextWindow: undefined, session: null }
}

export default {
  name: NAME,
  inject: ['webServer'],
  apply(ctx) {
    const webServer = ctx.get('webServer')
    if (webServer === undefined) {
      try { ctx.logger.error(`[${NAME}] webServer unavailable; plugin inactive`) } catch { /* ignore */ }
      return
    }
    const serverPort = typeof webServer.port === 'number' ? webServer.port : undefined
    const csrfToken = httpkit.newCsrfToken()
    const log = (m) => { try { ctx.logger.info(m) } catch { /* ignore */ } }
    const error = (m) => { try { ctx.logger.error(m) } catch { /* ignore */ } }

    const cfg = () => storage.readConfig()
    /**
     * 可用渠道（与模型选择器同源）：优先 host `llm.listProviders()` 动态枚举；
     * llm 服务不可用时回退内置 CHANNELS（行为与旧版一致，测试/mock 环境同此路径）。
     * @returns { [channelId]: { kind, currency, display, balanceHosts } }
     */
    function liveChannels() {
      let providers = null
      try {
        const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
        if (llm && typeof llm.listProviders === 'function') providers = llm.listProviders()
      } catch { providers = null }
      const out = {}
      if (Array.isArray(providers)) {
        for (const p of providers) {
          if (!p || typeof p.id !== 'string' || !p.id) continue
          const meta = pricing.channelMeta(p.id)
          out[p.id] = { kind: meta.kind, currency: meta.currency, display: p.name || meta.display || p.id, balanceHosts: meta.balanceHosts, suggestEnv: suggestEnvFor(p.id) }
        }
        return out
      }
      for (const [id, meta] of Object.entries(pricing.CHANNELS)) {
        out[id] = { kind: meta.kind, currency: meta.currency, display: meta.display, balanceHosts: meta.balanceHosts, suggestEnv: suggestEnvFor(id) }
      }
      return out
    }
    const liveChannelIds = () => Object.keys(liveChannels())
    log(`[${NAME}] active (routes=${BASE})`)
    const limiter = {
      config: httpkit.makeRateLimiter(10_000, 60),
      fold: httpkit.makeRateLimiter(2_000, 60),
      refresh: httpkit.makeRateLimiter(60_000, 12),
    }

    /* ============ 事件观测：构建用量历史 ============ */
    const sessions = new Map() // sessionId -> createSessionState()
    let lastActiveId = null
    // 内存用量历史缓存（跨重启惰性载入；事件增量追加），供 /status 聚合，避免每次读盘
    let historyCache = null
    function allHistory() {
      if (historyCache === null) historyCache = storage.readHistory()
      return historyCache
    }

    function handleEvent(session, event) {
      let sid = null
      try { sid = (session && typeof session.id === 'string') ? session.id : null } catch { sid = null }
      if (sid === null || !event || !event.type) return
      lastActiveId = sid
      let st = sessions.get(sid)
      if (!st) { st = createSessionState(); sessions.set(sid, st) }
      st.session = session // 活体引用：requestContext() 折叠整条日志（含本进程未见过的历史）

      if (event.type === 'request/header') {
        const header = event.data && event.data.header
        const config = header && header.config
        if (config && typeof config.provider === 'string') {
          st.lastHeader = { provider: config.provider, model: typeof config.model === 'string' ? config.model : null, at: event.time }
        }
        return
      }
      // 上下文窗口的唯一来源：request/context（provider/model/contextWindow 三件套）
      if (event.type === 'request/context') {
        const rc = event.data || {}
        const w = Number(rc.contextWindow)
        if (Number.isFinite(w) && w > 0) st.contextWindow = w
        if (typeof rc.provider === 'string') {
          st.lastHeader = {
            provider: rc.provider,
            model: typeof rc.model === 'string' ? rc.model : (st.lastHeader ? st.lastHeader.model : null),
            at: event.time,
          }
        }
        return
      }
      if (event.type !== 'assistant/message') return
      const data = event.data || {}
      const u = data.usage
      if (!u) return
      const buckets = usage.bucketsOf(u)
      if (usage.bucketTotal(buckets) === 0) return
      const hdr = st.lastHeader
      const msg = data.message || {}
      const src = msg.source && msg.source.kind === 'model' ? msg.source : null
      const provider = (hdr && hdr.provider) || (src && src.provider) || 'unknown'
      const model = (hdr && hdr.model) || (src && src.model) || null
      const win = contextWindowOf(sid)
      const rec = {
        at: new Date(event.time || Date.now()).toISOString(),
        sessionId: sid,
        sessionKind: 'main', // v0.1 无法可靠区分子代理，默认 main（README 注明）
        provider: String(provider).slice(0, 120),
        model: model ? String(model).slice(0, 160) : null,
        buckets,
        pressureTokens: usage.pressureOf(buckets),
        // 落盘窗口，使历史回捞（跨重启）也能算占比；未知则不写该字段
        ...(win === undefined ? {} : { contextWindow: win }),
      }
      st.history.push(rec)
      st.latest = { pressureTokens: rec.pressureTokens, contextWindow: rec.contextWindow, at: rec.at }
      storage.appendHistory([rec])
      if (historyCache !== null) historyCache.push(rec)
    }

    /* ============ 当前会话解析（client hint 优先，事件驱动兜底） ============ */
    /** 为 sid 初始化会话状态，并尽量带来活体 Session（供 requestContext/sessionProjections）。 */
    function seedSession(sid) {
      if (!sid || typeof sid !== 'string') return
      let st = sessions.get(sid)
      if (!st) { st = createSessionState(); sessions.set(sid, st) }
      if (!st.session) {
        try {
          const store = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
          const s = store && typeof store.get === 'function' ? store.get(sid) : undefined
          st.session = (s && typeof s === 'object') ? s : undefined
        } catch { /* 服务不可用则回退事件口径 */ }
      }
    }

    /**
     * 当前会话 id：客户端每次 /status 都带上 UI 的 current session（权威来源，
     * 一举解决“启动即知 current”与“手动切换会话即时刷新”）；无 hint 时退回
     * 事件驱动的 lastActiveId；都没有则用 sessionQuery 里最近活跃的 live session 兜底。
     * @returns sid 或 null（无任何会话）。
     */
    async function resolveCurrentSession(hint) {
      if (typeof hint === 'string' && hint.length > 0) { seedSession(hint); return hint }
      if (lastActiveId) { seedSession(lastActiveId); return lastActiveId }
      try {
        const q = typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined
        if (q && typeof q.listSessions === 'function') {
          const recs = await q.listSessions()
          const pick = (recs && recs.length > 0) ? (recs.find((r) => r && r.live) || recs[0]) : null
          const sid = pick && pick.header && typeof pick.header.id === 'string' ? pick.header.id : null
          if (sid) { seedSession(sid); return sid }
        }
      } catch { /* 不可用则保持无会话 */ }
      return null
    }

    /* ============ 聚合视图 ============ */
    function sessionRecords(sid) {
      return historyFor(sid, false)
    }
    function sessionAggregate(sid) {
      const recs = sessionRecords(sid)
      const b = usage.emptyBuckets()
      for (const r of recs) usage.addBucketsInto(b, r.buckets)
      const latest = usage.latestPressure(recs)
      return { records: recs.length, buckets: b, tokensTotal: usage.bucketTotal(b), latest }
    }

    function currentContext(sid) {
      // 1) 首选 token-meter 的 contextPressure（与内置上下文环同源：含压缩后的 projectedTokens）
      const proj = projectedContext(sid)
      if (proj) {
        return {
          available: true,
          usedTokens: proj.usedTokens,
          contextWindow: proj.contextWindow,
          percent: usage.percentOf(proj.usedTokens, proj.contextWindow),
          ratio: usage.fmtRatio(proj.usedTokens, proj.contextWindow),
          source: 'projection',
        }
      }
      // 2) 回退：插件自聚的最近一次请求压力 + 会话窗口（窗口与压力各自独立更新）
      const sample = usage.latestPressureSample(sessionRecords(sid))
      if (!sample) return { available: false }
      const win = (Number.isFinite(sample.contextWindow) && sample.contextWindow > 0)
        ? sample.contextWindow
        : contextWindowOf(sid)
      if (!(Number.isFinite(win) && win > 0)) return { available: false }
      return {
        available: true,
        usedTokens: sample.pressureTokens,
        contextWindow: win,
        percent: usage.percentOf(sample.pressureTokens, win),
        ratio: usage.fmtRatio(sample.pressureTokens, win),
        source: 'events',
      }
    }

    /**
     * 会话上下文窗口（token 分母）。三条来源按可靠性排序：
     *  1. `Session.requestContext()`——对整条日志折叠，重启/恢复旧会话同样拿到（事件流拿不到）；
     *  2. 本进程观察到的 request/context 事件；
     *  3. 落盘历史里最近一次已知窗口（跨重启回捞）。
     * @returns 正数窗口，或 undefined（该渠道未声明容量）。
     */
    function contextWindowOf(sid) {
      const st = sid ? sessions.get(sid) : null
      const s = st ? st.session : null
      if (s && typeof s.requestContext === 'function') {
        try {
          const rc = s.requestContext()
          const w = rc ? Number(rc.contextWindow) : NaN
          if (Number.isFinite(w) && w > 0) return w
        } catch { /* 折叠失败则继续回退 */ }
      }
      if (st && Number.isFinite(st.contextWindow) && st.contextWindow > 0) return st.contextWindow
      return usage.latestContextWindow(sessionRecords(sid))
    }

    /** token-meter 的 contextPressure 视图（服务/键缺失即返回 null，回退事件口径）。 */
    function projectedContext(sid) {
      const st = sid ? sessions.get(sid) : null
      const s = st ? st.session : null
      if (!s) return null
      let registry = null
      try { registry = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined } catch { registry = undefined }
      if (!registry || typeof registry.snapshot !== 'function') return null
      try {
        const snap = registry.snapshot(s, ['contextPressure'])
        const p = snap && snap.values ? snap.values.contextPressure : null
        if (!p) return null
        const usedTokens = p.projectedTokens !== undefined ? p.projectedTokens : p.pressureTokens
        const w = Number(p.contextWindow)
        if (usedTokens === undefined || !(Number.isFinite(w) && w > 0)) return null
        return { usedTokens: Number(usedTokens), contextWindow: w }
      } catch { return null }
    }

    /** 当前会话的 route（header 事件优先，Session.requestContext() 兜底）。 */
    function routeOf(sid) {
      const st = sid ? sessions.get(sid) : null
      const hdr = st ? st.lastHeader : null
      let rc = null
      if (st && st.session && typeof st.session.requestContext === 'function') {
        try { rc = st.session.requestContext() } catch { rc = null }
      }
      return {
        provider: (hdr && hdr.provider) || (rc && typeof rc.provider === 'string' ? rc.provider : null),
        model: (hdr && hdr.model) || (rc && typeof rc.model === 'string' ? rc.model : null),
      }
    }

    function historyFor(sid, includeChildren) {
      // 会话累计 = 该会话的全部用量记录（内存优先；跨重启由缓存 history 按 sessionId 回捞）
      const mem = sid ? (sessions.get(sid) ? sessions.get(sid).history : []) : []
      if (mem.length > 0) return mem
      return allHistory().filter((r) => r.sessionId === sid)
    }

    function windowStats(c) {
      const includeChildren = c.stats.includeChildren
      const kindFilter = (r) => includeChildren || r.sessionKind === 'main'
      const all = allHistory().filter(kindFilter)
      const week = usage.aggregateByWindow(all, 'week', { now: new Date() }).pop()
      const month = usage.aggregateByWindow(all, 'month', { now: new Date() }).pop()
      const rollingHours = Number(c.stats.rollingHours) || 5
      const rolling = usage.aggregateByWindow(all, 'rolling', { now: new Date(), rollingHours }).pop()
      const sum = (x) => (x ? x.totalTokens : 0)
      const sumb = (x) => (x ? x.buckets : usage.emptyBuckets())
      return {
        rollingHours,
        rollingLabel: usage.windowLabel({ rollingHours }),
        week: { key: week ? week.key : usage.weekKey(new Date()), totalTokens: sum(week), buckets: sumb(week) },
        month: { key: month ? month.key : usage.monthKey(new Date()), totalTokens: sum(month), buckets: sumb(month) },
        rolling: { totalTokens: sum(rolling), buckets: sumb(rolling) },
        includeChildren,
      }
    }

    /**
     * 本次会话花费：逐条记录按自己的时间戳取价（峰谷自动切换），而不是用「当前档位」套全程。
     * 记录自带 provider/model，故中途换模型也各自计价；币种与当前渠道不一致的记录跳过，
     * 避免不同币种相加。
     */
    function costFor(provider, model, c, sid) {
      const now = Date.now()
      const resolved = pricing.resolvePrice(provider, model, c.priceOverrides, now)
      if (!resolved.price) return null
      const currency = resolved.price.currency
      const recs = sessionRecords(sid)
      let amount = 0
      let priced = 0
      for (const r of recs) {
        const rate = pricing.ratesAt(r.provider || provider, r.model || model, c.priceOverrides, Date.parse(r.at))
        if (!rate || rate.currency !== currency) continue
        const one = usage.costOf(r.buckets, rate)
        if (one === null) continue
        amount += one
        priced += 1
      }
      return {
        amount: priced === 0 ? null : amount,
        currency,
        verified: resolved.verified,
        source: resolved.source,
        fallback: resolved.fallback,
        // 当前时刻的计价档位（峰/谷），供面板标注；覆盖表口径不分峰谷 → null
        window: resolved.window,
      }
    }

    /* ============ 余额（官方接口 / mock，§Q6） ============ */
    function mockBalance(channel) {
      const meta = pricing.channelMeta(channel)
      const now = new Date().toISOString()
      if (meta.kind === 'paygo') {
        return { ok: true, channel, available: true, kind: 'paygo', balance: { available: 88.88, currency: meta.currency }, updatedAt: now, mock: true }
      }
      return { ok: true, channel, available: true, kind: 'plan', updatedAt: now, mock: true }
    }

    function noApiBalance(channel) {
      return { ok: false, channel, available: false, reason: 'no-balance-api', mock: mockEnabled() }
    }

    /**
     * 取某渠道的 key：先查 DSH 凭据库（`ctx.get('credentials').resolve(ref)`，
     * ref 即设置页配置的 envName，例如 DEEPSEEK_API_KEY），再回退环境变量。
     * key 只在本函数内用于 Authorization 头：不下发 client、不写盘、不进日志。
     * @returns key 字符串，或 undefined（未配置/取不到）。
     */
    async function channelKey(channel, c) {
      const keyCfg = c.balance.keys[channel]
      // 未显式配置的渠道回退推荐 ref（如 DEEPSEEK_API_KEY），保持开箱即用；
      // 推荐名为空且未配置 → 视为无 key。
      let ref = ''
      if (keyCfg && keyCfg.mode === 'env' && typeof keyCfg.envName === 'string' && keyCfg.envName.length > 0) ref = keyCfg.envName
      else ref = suggestEnvFor(channel)
      if (!ref) return undefined
      try {
        const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
        if (credentials && typeof credentials.resolve === 'function') {
          const hit = await credentials.resolve(ref)
          if (hit && typeof hit.value === 'string' && hit.value.length > 0) return hit.value
        }
      } catch { /* 凭据服务异常 → 回退 env */ }
      const env = envKey(ref)
      return (typeof env === 'string' && env.length > 0) ? env : undefined
    }

    async function fetchChannelBalance(channel, c) {
      if (!c.balance.enabled) return { ok: false, channel, available: false, reason: 'disabled' }
      if (mockEnabled()) return mockBalance(channel)
      const spec = BALANCE_SPECS[channel]
      if (!spec) return noApiBalance(channel)
      const meta = pricing.channelMeta(channel)
      const key = await channelKey(channel, c)
      if (!key) return { ok: false, channel, available: false, reason: 'no-key' }
      // spec.url 仅允许白名单域（§7.6 简化：https + host 精确匹配 + 重定向重验 + 超时/大小上限）
      let host
      try { host = new URL(spec.url).host } catch { return noApiBalance(channel) }
      if (!meta.balanceHosts.includes(host)) return { ok: false, channel, available: false, reason: 'forbidden-host' }
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 10_000)
        const res = await fetch(spec.url, {
          method: spec.method || 'GET',
          headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
          redirect: 'manual',
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        if (res.status >= 300 && res.status < 400) return noApiBalance(channel)
        if (!res.ok) return { ok: false, channel, available: false, reason: 'http-' + res.status }
        const body = await res.text()
        if (body.length > 512 * 1024) return noApiBalance(channel)
        const j = JSON.parse(body)
        const mapped = spec.map(j)
        return { ok: true, channel, available: true, kind: meta.kind, ...mapped, updatedAt: new Date().toISOString() }
      } catch {
        return { ok: false, channel, available: false, reason: 'fetch-error' }
      }
    }

    const balanceCache = new Map() // channel -> {payload, at}
    async function ensureBalances(c) {
      for (const channel of liveChannelIds()) {
        const cached = balanceCache.get(channel)
        const stale = !cached || Date.now() - cached.at > c.balance.refreshMs
        if (stale) {
          const payload = await fetchChannelBalance(channel, c)
          balanceCache.set(channel, { payload, at: Date.now() })
        }
      }
    }

    /* ============ 视图装配 ============ */
    function statusView(c, sid) {
      const agg = sessionAggregate(sid)
      const ctx2 = currentContext(sid)
      const stats = windowStats(c)
      const route = routeOf(sid)
      const provider = route.provider
      const model = route.model
      const meta = pricing.channelMeta(provider)
      const cost = provider ? costFor(provider, model, c, sid) : null
      const balances = {}
      for (const channel of liveChannelIds()) {
        const cached = balanceCache.get(channel)
        balances[channel] = cached ? cached.payload : { ok: false, channel, available: false, reason: 'pending' }
      }
      return {
        ok: true,
        ts: Date.now(),
        session: sid
          ? {
            id: sid,
            provider, model,
            channelKind: meta.kind,
            channelDisplay: meta.display,
            channelCurrency: meta.currency,
          }
          : null,
        context: ctx2,
        sessionTotals: { records: agg.records, tokensTotal: agg.tokensTotal, buckets: agg.buckets },
        cost,
        planStats: stats,
        balances,
        threshold: c.threshold,
      }
    }

    /* ============ 路由 ============ */
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: BASE,
      handler: async (req, res) => {
        let pathname = ''
        try { pathname = new URL(req.url || '/', 'http://localhost').pathname } catch { pathname = BASE }
        try {
          if (!httpkit.isLoopbackHost(req.headers.host, serverPort)) {
            httpkit.sendJson(res, 403, { ok: false, message: 'forbidden: loopback host required' }); return
          }

          if (req.method === 'GET' && pathname === `${BASE}/status`) {
            const u = new URL(req.url || '/', 'http://localhost')
            const hint = typeof u.searchParams.get('session') === 'string'
              ? storage.cleanText(u.searchParams.get('session'), 200)
              : ''
            const sid = await resolveCurrentSession(hint)
            await ensureBalances(cfg())
            httpkit.sendJson(res, 200, statusView(cfg(), sid)); return
          }
          if (req.method === 'GET' && pathname === `${BASE}/config`) {
            const fold = storage.readFold()
            httpkit.sendJson(res, 200, { ok: true, csrf: csrfToken, config: cfg(), fold: fold === undefined ? null : { collapsed: fold }, channels: liveChannels(), catalog: pricing.CATALOG, meta: pricing.CATALOG_META }); return
          }
          if (req.method === 'GET' && pathname === `${BASE}/price`) {
            const u = new URL(req.url || '/', 'http://localhost')
            const channel = storage.cleanText(u.searchParams.get('channel'), 120)
            const model = storage.cleanText(u.searchParams.get('model'), 160)
            httpkit.sendJson(res, 200, { ok: true, ...pricing.resolvePrice(channel, model, cfg().priceOverrides) }); return
          }

          // 写端点：仅对已知 POST 路径做同源+CSRF+限流守卫；未知路径一律 404（§7.3/§7.7）
          if (req.method === 'POST'
            && (pathname === `${BASE}/config` || pathname === `${BASE}/fold` || pathname === `${BASE}/refresh-balance`)) {
            const denied = httpkit.guardWrite(req, csrfToken, (() => {
              if (pathname === `${BASE}/config`) return limiter.config
              if (pathname === `${BASE}/fold`) return limiter.fold
              return limiter.refresh
            })())
            if (denied) { httpkit.sendJson(res, denied.status, denied.payload); return }
          }

          if (req.method === 'POST' && pathname === `${BASE}/config`) {
            const body = JSON.parse((await httpkit.readBody(req, LIMITS_BODY.config)).toString('utf8'))
            const c = storage.sanitizeConfig(body && body.config)
            storage.writeConfig(c)
            httpkit.sendJson(res, 200, { ok: true, config: storage.readConfig() }); return
          }
          if (req.method === 'POST' && pathname === `${BASE}/fold`) {
            const body = JSON.parse((await httpkit.readBody(req, LIMITS_BODY.fold)).toString('utf8'))
            if (typeof (body && body.collapsed) !== 'boolean') { httpkit.sendJson(res, 400, { ok: false, message: 'invalid fold state' }); return }
            storage.writeFold(body.collapsed)
            httpkit.sendJson(res, 200, { ok: true, collapsed: body.collapsed }); return
          }
          if (req.method === 'POST' && pathname === `${BASE}/refresh-balance`) {
            const c = cfg()
            for (const channel of liveChannelIds()) {
              const payload = await fetchChannelBalance(channel, c)
              balanceCache.set(channel, { payload, at: Date.now() })
            }
            const balances = {}
            for (const channel of liveChannelIds()) balances[channel] = balanceCache.get(channel).payload
            httpkit.sendJson(res, 200, { ok: true, balances }); return
          }
          httpkit.sendJson(res, 404, { ok: false, message: 'not found' })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          error(`[${NAME}] route error: ${msg}`)
          httpkit.sendJson(res, 400, { ok: false, message: 'request failed' })
        }
      },
    }), `${NAME}: routes`)

    /* ============ 会话事件订阅（可逆） ============ */
    ctx.effect(() => {
      let off = null
      try { off = ctx.on('session/event', handleEvent) } catch (err) { error(`[${NAME}] cannot subscribe session/event: ${err instanceof Error ? err.message : String(err)}`) }
      return () => { if (off) { try { off() } catch { /* ignore */ } } }
    }, `${NAME}: session-event watcher`)

    /* ============ 启动即预取一次余额（后台，不阻塞路由） ============ */
    void ensureBalances(cfg()).catch(() => { /* ignore */ })

    // 卸载：清 sessions 内存即可（history 已增量落盘）
    ctx.effect(() => () => { sessions.clear() }, `${NAME}: cleanup`)
  },
}
