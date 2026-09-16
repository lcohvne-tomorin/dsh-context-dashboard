/**
 * host 半集成测试（不挂 cordis/profile，mock ctx + webServer）
 *  - 临时 DSH_HOME（工作区内 .tmp），避免污染真实 ~/.dsh
 *  - 喂 request/header + request/context + assistant/message 事件 → 校验 /status
 *    （本次累计/上下文/费用/窗口）。事件形状对齐官方 SessionEventMap：
 *    上下文窗口只在 request/context 上，assistant/message 没有 contextWindow。
 *  - 回归：恢复旧会话（不再发 request/context）与 sessionProjections 可用两条路径
 *  - 校验写端点回环 + CSRF（无 token 被 403；带 token 通过）
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP = mkdtempSync(join(tmpdir(), 'dsh-cd-test-'))
process.env.DSH_HOME = TMP
// 余额取 key 先凭据库、后 env：清掉 env 才能确定性地命中 no-key 分支（mock ctx 无 credentials）
for (const name of ['DEEPSEEK_API_KEY', 'QWEN_TOKEN_PLAN_CN_API_KEY', 'OPENCODE_GO_FULL_API_KEY']) delete process.env[name]

const host = (await import('../lib/index.js')).default
assert.equal(host.name, 'dsh-context-dashboard')

let eventHandler = null
let routeSpec = null
const writes = []
const res = {
  writeHead(status, headers) { this.status = status; this.headers = headers || {} },
  end(body) { this.body = body },
}
function makeReq(method, path, headers, body) {
  return {
    method,
    url: path,
    headers: Object.assign({ host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }, headers || {}),
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body))
    },
  }
}
const server = {
  port: 3080,
  register(spec) { routeSpec = spec },
}
/** 可选：模拟 ctx.sessionProjections（token-meter 的 contextPressure 投影）。 */
let projectionRegistry = null
/** 可选：模拟 ctx.credentials（余额取 key 的第一来源）。 */
let credentialsService = null
/** 可选：模拟 ctx.sessions（hint 指定的「当前会话」解析成活体 Session）。 */
let sessionStore = null
/** 可选：模拟 ctx.llm（模型选择器的渠道权威来源；不设则 host 半回退内置 CHANNELS）。 */
let llmService = null
const ctx = {
  get(name) {
    if (name === 'webServer') return server
    if (name === 'sessionProjections') return projectionRegistry
    if (name === 'credentials') return credentialsService
    if (name === 'sessions') return sessionStore
    if (name === 'llm') return llmService
    return undefined
  },
  on(type, fn) { if (type === 'session/event') eventHandler = fn; return () => {} },
  effect(fn) { return fn() || (() => {}) },
  logger: { info() {}, warn() {}, error() {} },
}
function fire(ev, session) {
  eventHandler(session || { id: ev.sessionId }, Object.assign({ seq: 1, time: Date.parse(ev.at) }, ev))
}

before(async () => {
  host.apply(ctx)
  assert.ok(routeSpec, 'route registered')
})
after(() => { try { rmSync(TMP, { recursive: true, force: true }) } catch { /* ignore */ } })

async function call(method, path, headers, body) {
  res.status = null; res.body = null
  await routeSpec.handler(makeReq(method, path, headers, body), res)
  return { status: res.status, json: JSON.parse(res.body || '{}') }
}

test('loopback host required', async () => {
  const r = await routeSpec.handler(makeReq('GET', '/dsh-context-dashboard/status', { host: 'evil.example.com:3080' }), res)
  assert.ok(res.status === 403)
})

test('config GET exposes csrf + fold (fold null until persisted)', async () => {
  const r = await call('GET', '/dsh-context-dashboard/config')
  assert.equal(r.status, 200)
  assert.ok(r.json.ok)
  assert.ok(r.json.csrf)
  assert.ok(r.json.fold === null || typeof r.json.fold.collapsed === 'boolean')
})

test('feed events then status reflects session totals/context/cost', async () => {
  // s2 先触发（历史），s1 最后触发（成为“当前会话”，按最近活跃定义）
  fire({ sessionId: 's2', type: 'request/header', at: '2026-09-03T10:00:00Z', data: { header: { config: { provider: 'qwen-token-plan-cn', model: 'qwen3.8-max' } }, reason: 'initial' } })
  fire({ sessionId: 's2', type: 'request/context', at: '2026-09-03T10:00:00Z', data: { provider: 'qwen-token-plan-cn', model: 'qwen3.8-max', contextWindow: 1_000_000 } })
  fire({ sessionId: 's2', type: 'assistant/message', at: '2026-09-03T10:00:01Z', turn: 1, step: 1, data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 9_999_999, outputTokens: 1 } } })
  // s1: opencode-go-full deepseek-v4-flash（当前）
  fire({ sessionId: 's1', type: 'request/header', at: '2026-09-03T10:00:02Z', data: { header: { config: { provider: 'opencode-go-full', model: 'deepseek-v4-flash' } }, reason: 'initial' } })
  fire({ sessionId: 's1', type: 'request/context', at: '2026-09-03T10:00:02Z', data: { provider: 'opencode-go-full', model: 'deepseek-v4-flash', contextWindow: 1_000_000 } })
  fire({ sessionId: 's1', type: 'assistant/message', at: '2026-09-03T10:00:03Z', turn: 1, step: 1, data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 100_000, outputTokens: 5_000 } } })

  const r = await call('GET', '/dsh-context-dashboard/status')
  assert.equal(r.status, 200)
  const j = r.json
  assert.ok(j.ok)
  assert.equal(j.session.provider, 'opencode-go-full')
  assert.equal(j.session.model, 'deepseek-v4-flash')
  assert.equal(j.session.channelKind, 'plan')
  // 上下文：最近一次请求 pressure = input(100000)+cache 0 = 100000 / 1M
  assert.equal(j.context.available, true)
  assert.equal(j.context.usedTokens, 100_000)
  assert.equal(j.context.contextWindow, 1_000_000)
  assert.equal(j.context.percent, 10)
  assert.equal(j.context.ratio, '100K/1M')
  // 本次累计只含 s1
  assert.equal(j.sessionTotals.tokensTotal, 105_000)
  // 费用：USD 目录价 deepseek-v4-flash 0.28 in / 0.42 out per 1M
  const expected = (100_000 * 0.28 + 5_000 * 0.42) / 1e6
  assert.equal(j.cost.currency, 'USD')
  assert.ok(Math.abs(j.cost.amount - expected) < 1e-6)
  // 窗口：月/周聚合包含 s1+s2 的全部
  assert.ok(j.planStats.month.totalTokens > 0)
  assert.ok(j.planStats.month.totalTokens >= 105_000 + 10_000_000)
})

test('regression: resumed session with no live request/context still resolves the window', async () => {
  // 恢复旧会话时 request/context 不会重发（只在 route/capacity 变化时落盘），
  // 窗口只能来自 Session.requestContext() 对整条日志的折叠。
  const session = {
    id: 's3',
    requestContext: () => ({ provider: 'opencode-go-full', model: 'deepseek-v4-flash', contextWindow: 1_000_000 }),
  }
  fire({ sessionId: 's3', type: 'request/header', at: '2026-09-03T11:00:00Z', data: { header: { config: { provider: 'opencode-go-full', model: 'deepseek-v4-flash' } }, reason: 'resume' } }, session)
  fire({ sessionId: 's3', type: 'assistant/message', at: '2026-09-03T11:00:01Z', turn: 1, step: 1, data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 250_000, outputTokens: 1_000 } } }, session)

  const r = await call('GET', '/dsh-context-dashboard/status')
  assert.equal(r.json.session.id, 's3')
  assert.equal(r.json.session.provider, 'opencode-go-full')
  assert.equal(r.json.context.available, true)
  assert.equal(r.json.context.usedTokens, 250_000)
  assert.equal(r.json.context.contextWindow, 1_000_000)
  assert.equal(r.json.context.percent, 25)
  assert.equal(r.json.context.source, 'events')
})

test('regression: token-meter contextPressure projection wins when present', async () => {
  projectionRegistry = {
    snapshot(session, keys) {
      assert.deepEqual(keys, ['contextPressure'])
      return { asOfSeq: 1, values: { contextPressure: { pressureTokens: 10_000, projectedTokens: 20_000, contextWindow: 100_000 } } }
    },
  }
  try {
    const r = await call('GET', '/dsh-context-dashboard/status')
    assert.equal(r.json.context.available, true)
    assert.equal(r.json.context.usedTokens, 20_000) // projectedTokens 优先（与内置环同源）
    assert.equal(r.json.context.contextWindow, 100_000)
    assert.equal(r.json.context.percent, 20)
    assert.equal(r.json.context.source, 'projection')
  } finally {
    projectionRegistry = null
  }
})

test('regression: deepseek-official is a known channel (official CNY, peak/off-peak per record)', async () => {
  // 旧版 pricing.CHANNELS 未登记该路由 → 仪表盘显示「未知渠道」且 cost 为 null（–）
  const session = {
    id: 's4',
    requestContext: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash', contextWindow: 1_000_000 }),
  }
  fire({ sessionId: 's4', type: 'request/header', at: '2026-09-08T01:59:00Z', data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }, reason: 'initial' } }, session)
  // 两条记录：北京 10:00（高峰）与 20:00（空闲），各自按当时档位计价
  fire({ sessionId: 's4', type: 'assistant/message', at: '2026-09-08T02:00:00Z', turn: 1, step: 1, data: { turn: 1, step: 1, message: {}, usage: { inputTokens: 100_000, cacheReadTokens: 50_000, outputTokens: 5_000 } } }, session)
  fire({ sessionId: 's4', type: 'assistant/message', at: '2026-09-08T12:00:00Z', turn: 1, step: 2, data: { turn: 1, step: 2, message: {}, usage: { inputTokens: 100_000, cacheReadTokens: 50_000, outputTokens: 5_000 } } }, session)

  const r = await call('GET', '/dsh-context-dashboard/status')
  assert.equal(r.json.session.provider, 'deepseek-official')
  assert.equal(r.json.session.channelKind, 'paygo')
  assert.equal(r.json.session.channelDisplay, 'DeepSeek 官方')
  assert.equal(r.json.session.channelCurrency, 'CNY')
  assert.ok(r.json.cost)
  assert.equal(r.json.cost.currency, 'CNY')
  assert.equal(r.json.cost.fallback, false)
  assert.equal(r.json.cost.verified, true) // 官方页已核对
  assert.equal(r.json.cost.source, 'official')
  // 当前档位随时间变化，只断言取值合法（测试不该依赖运行时刻）
  assert.ok(r.json.cost.window === 'peak' || r.json.cost.window === 'offpeak')
  // 高峰段 (100k*3.0 + 50k*0.10 + 5k*9.0)/1e6 = 0.35；空闲段减半 = 0.175
  const expected = 0.35 + 0.175
  assert.ok(Math.abs(r.json.cost.amount - expected) < 1e-9, `cost=${r.json.cost.amount}`)

  // 余额：官方接口已接入，但测试环境无 key（mock ctx 无 credentials、env 无 DEEPSEEK_API_KEY）
  assert.equal(r.json.balances['deepseek-official'].available, false)
  assert.equal(r.json.balances['deepseek-official'].reason, 'no-key')
})

test('regression: status honors the client-supplied current-session hint (?session=) even with no events for it', async () => {
  // 关键修复：仪表盘启动/手动切换会话时，UI 会把「当前会话 id」作为 hint 带给 host。
  // 即使该会话在本进程内还没发过任何 session/event，host 也要按 hint 展示（而非 lastActiveId）。
  const hintSession = {
    id: 's-hint',
    requestContext: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash', contextWindow: 1_000_000 }),
  }
  sessionStore = { get(id) { return id === 's-hint' ? hintSession : undefined } }
  const prevProj = projectionRegistry
  projectionRegistry = {
    snapshot(session, keys) {
      assert.deepEqual(keys, ['contextPressure'])
      return { asOfSeq: 1, values: { contextPressure: { pressureTokens: 5_000, projectedTokens: 10_000, contextWindow: 1_000_000 } } }
    },
  }
  try {
    // 此刻 lastActiveId 指向 s4（上一用例）；带 hint 应展示 s-hint
    const r = await call('GET', '/dsh-context-dashboard/status?session=s-hint')
    assert.equal(r.json.session.id, 's-hint')
    assert.equal(r.json.session.provider, 'deepseek-official')
    assert.equal(r.json.session.model, 'deepseek-v4-flash')
    assert.equal(r.json.session.channelKind, 'paygo')
    assert.equal(r.json.session.channelDisplay, 'DeepSeek 官方')
    assert.equal(r.json.context.available, true)
    assert.equal(r.json.context.usedTokens, 10_000)
    assert.equal(r.json.context.contextWindow, 1_000_000)
    assert.equal(r.json.context.source, 'projection')
  } finally {
    sessionStore = null
    projectionRegistry = prevProj
  }
})

test('balance: deepseek-official resolves the key from credentials and maps the official payload', async () => {
  credentialsService = {
    resolve: async (ref) => (ref === 'DEEPSEEK_API_KEY' ? { value: 'test-key-not-real' } : undefined),
  }
  const realFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: (init && init.headers) ? init.headers.authorization : null })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
      }),
    }
  }
  try {
    const cfgGet = await call('GET', '/dsh-context-dashboard/config')
    const r = await call('POST', '/dsh-context-dashboard/refresh-balance', { 'x-dsh-cd-csrf': cfgGet.json.csrf }, {})
    assert.equal(r.status, 200)
    const b = r.json.balances['deepseek-official']
    assert.equal(b.available, true)
    assert.equal(b.kind, 'paygo')
    assert.equal(b.balance.available, 110)
    assert.equal(b.balance.currency, 'CNY')
    assert.equal(b.detail.granted, 10)
    assert.equal(b.detail.toppedUp, 100)
    // 只打官方白名单域，key 只在 Authorization 头里
    assert.deepEqual(calls.filter((c) => c.url.includes('deepseek')), [
      { url: 'https://api.deepseek.com/user/balance', auth: 'Bearer test-key-not-real' },
    ])
    // /status 读缓存后同样可见
    const s = await call('GET', '/dsh-context-dashboard/status')
    assert.equal(s.json.balances['deepseek-official'].balance.available, 110)
  } finally {
    globalThis.fetch = realFetch
    credentialsService = null
  }
})

test('write endpoints require CSRF (403 without)', async () => {
  const r = await call('POST', '/dsh-context-dashboard/config', { 'content-type': 'application/json' }, { config: {} })
  assert.equal(r.status, 403)
})

test('write endpoint accepts valid CSRF and persists fold/config', async () => {
  const cfgGet = await call('GET', '/dsh-context-dashboard/config')
  const token = cfgGet.json.csrf
  const r = await call('POST', '/dsh-context-dashboard/fold', { 'x-dsh-cd-csrf': token }, { collapsed: true })
  assert.equal(r.status, 200)
  assert.equal(r.json.collapsed, true)
  const cfg2 = await call('GET', '/dsh-context-dashboard/config')
  assert.equal(cfg2.json.fold.collapsed, true)
})

test('channels are dynamic from llm.listProviders (no preseed)', async () => {
  // 无 llm 服务 → 回退内置 CHANNELS（旧行为，保持兼容）
  const fb = await call('GET', '/dsh-context-dashboard/config')
  assert.ok(fb.json.channels['deepseek-official'])

  llmService = {
    listProviders: () => [
      { id: 'my-gateway', name: 'My Gateway' },
      { id: 'deepseek-official', name: 'DeepSeek Official' },
    ],
  }
  try {
    const r = await call('GET', '/dsh-context-dashboard/config')
    const ch = r.json.channels
    assert.ok(ch['my-gateway'], '模型选择器渠道列出')
    assert.equal(ch['my-gateway'].kind, 'unknown')
    assert.equal(ch['my-gateway'].display, 'My Gateway')
    assert.equal(ch['my-gateway'].suggestEnv, 'MY_GATEWAY_API_KEY')
    assert.equal(ch['qwen-token-plan-cn'], undefined, '不在选择器里的预设渠道不再出现')

    // 非预设渠道的密钥配置可持久化（storage 不再限死 3 渠道白名单）
    const nextCfg = JSON.parse(JSON.stringify(r.json.config))
    nextCfg.balance.keys = { 'my-gateway': { mode: 'env', envName: 'GATEWAY_SECRET' } }
    const post = await call('POST', '/dsh-context-dashboard/config', { 'x-dsh-cd-csrf': r.json.csrf }, { config: nextCfg })
    assert.equal(post.json.config.balance.keys['my-gateway'].envName, 'GATEWAY_SECRET')

    // 余额聚合只覆盖动态渠道
    const s = await call('GET', '/dsh-context-dashboard/status')
    assert.ok(s.json.balances['my-gateway'])
    assert.equal(s.json.balances['my-gateway'].reason, 'no-balance-api')
    assert.ok(s.json.balances['deepseek-official'])
    assert.equal(s.json.balances['qwen-token-plan-cn'], undefined)
  } finally {
    llmService = null
  }
})

test('config exposes live models and catalog rows for newly added models', async () => {
  // 无 llm 服务：models=null，目录只有内置行（旧行为）
  const fb = await call('GET', '/dsh-context-dashboard/config')
  assert.equal(fb.json.models, null)
  assert.ok(fb.json.catalog.every((r) => r.live === false))

  llmService = {
    listProviders: () => [{ id: 'my-gateway', name: 'My Gateway' }],
    listModels: async (id) => (id === 'my-gateway'
      ? [{ id: 'brand-new-model', name: 'Brand New Model' }, { id: 'another-model', name: 'Another Model' }]
      : []),
  }
  try {
    const r = await call('GET', '/dsh-context-dashboard/config')
    // 1) 模型清单随模型选择器（llm.listModels）动态枚举
    assert.deepEqual(r.json.models['my-gateway'], [
      { id: 'brand-new-model', name: 'Brand New Model' },
      { id: 'another-model', name: 'Another Model' },
    ])
    // 2) 未收录、又无兜底价的渠道也要出行（否则永远无法为它录入覆盖价）
    const row = r.json.catalog.find((x) => x.channel === 'my-gateway' && x.model === 'brand-new-model')
    assert.ok(row, 'live-only model row present')
    assert.equal(row.live, true)
    assert.equal(row.rates, null)
    assert.equal(row.source, 'unavailable')

    // 3) 录入覆盖价后，目录行反映覆盖值（override 优先，source/verified 更新）
    const nextCfg = JSON.parse(JSON.stringify(r.json.config))
    nextCfg.priceOverrides = { 'my-gateway/brand-new-model': { input: 1.5, cacheRead: 0.15, cacheWrite: 1.5, output: 6 } }
    const post = await call('POST', '/dsh-context-dashboard/config', { 'x-dsh-cd-csrf': r.json.csrf }, { config: nextCfg })
    assert.equal(post.status, 200)
    const r2 = await call('GET', '/dsh-context-dashboard/config')
    const row2 = r2.json.catalog.find((x) => x.channel === 'my-gateway' && x.model === 'brand-new-model')
    assert.equal(row2.rates.input, 1.5)
    assert.equal(row2.rates.output, 6)
    assert.equal(row2.source, 'override')
    assert.equal(row2.verified, true)
  } finally {
    llmService = null
  }
})
