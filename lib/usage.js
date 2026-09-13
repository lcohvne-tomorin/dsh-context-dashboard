/**
 * dsh-context-dashboard — 纯函数计量与格式化（无 I/O，便于单测）
 *
 * 口径（拷问 Q2/Q5/Q6 定稿）：
 *  - 「本次花费 / 本次使用额度」= 整条会话累计（不含子代理/独立 session）。
 *  - 「上下文占比」= 当前会话最近一次请求的 pressureTokens / contextWindow。
 *  - 「滚动 / 每周 / 每月用量」= 插件自聚的用量历史按时间窗聚合（账户级，跨会话）。
 *  - 费用 = input/cacheRead/cacheWrite/output 四桶 tokens × 各自单价合计。
 */

/* ---------- 桶 ---------- */
export function emptyBuckets() {
  return { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
}

/** 取用量记录的桶（容忍缺字段/坏值）。 */
export function bucketsOf(usage) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0) ? Math.floor(Number(v)) : 0
  return {
    inputTokens: num(usage && usage.inputTokens),
    cacheReadTokens: num(usage && usage.cacheReadTokens),
    cacheWriteTokens: num(usage && usage.cacheWriteTokens),
    outputTokens: num(usage && usage.outputTokens),
  }
}

/** 桶求和（四桶全计）。 */
export function bucketTotal(b) {
  return b.inputTokens + b.cacheReadTokens + b.cacheWriteTokens + b.outputTokens
}

/** prompt 侧压力 = input + cacheRead + cacheWrite（不含 output）。 */
export function pressureOf(b) {
  return b.inputTokens + b.cacheReadTokens + b.cacheWriteTokens
}

/** 桶累加（改 self）。 */
export function addBucketsInto(target, b) {
  target.inputTokens += b.inputTokens
  target.cacheReadTokens += b.cacheReadTokens
  target.cacheWriteTokens += b.cacheWriteTokens
  target.outputTokens += b.outputTokens
  return target
}

/* ---------- 费用 ---------- */
/** 单价条目（每 1e6 token）。currency ∈ CNY/USD/CREDITS。 */
export function costOf(b, price) {
  if (!price) return null
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0) ? Number(v) : 0
  const per = 1e6
  const total = (b.inputTokens * num(price.input))
    + (b.cacheReadTokens * num(price.cacheRead))
    + (b.cacheWriteTokens * num(price.cacheWrite))
    + (b.outputTokens * num(price.output))
  return total / per
}

/**
 * 逐条记录计价（峰谷/换模型口径）：每条记录用自己的时间戳与 provider/model 取价，
 * 因此跨高峰/空闲的会话花费是两段价分别累计，而不是用「当前档位」套全程。
 * @param records - 用量记录（含 at / buckets，可选 provider/model）
 * @param ratesFor - (record) => price | null；返回 null 的记录跳过
 * @returns 累计金额（无任何可计价记录时返回 0）
 */
export function costOfRecords(records, ratesFor) {
  let total = 0
  for (const r of records || []) {
    if (!r || !r.buckets) continue
    let price = null
    try { price = ratesFor(r) } catch { price = null }
    if (!price) continue
    const c = costOf(r.buckets, price)
    if (c !== null) total += c
  }
  return total
}

/* ---------- 上下文占用（折叠环） ---------- */
/** 取会话最近一次 usage 的 (pressureTokens, contextWindow)。 */
export function latestPressure(records) {
  let out = null
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i]
    if (!r || typeof r.pressureTokens !== 'number' || typeof r.contextWindow !== 'number') continue
    out = { pressureTokens: r.pressureTokens, contextWindow: r.contextWindow, at: r.at }
    break
  }
  return out
}

/**
 * 取会话最近一次请求压力，窗口可缺省。
 * 窗口来自 request/context（仅在 route/capacity 变化时落盘），压力来自 usage；
 * 二者不同步，故分母必须独立解析（见 index.js 的 contextWindowOf）。
 */
export function latestPressureSample(records) {
  let out = null
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i]
    if (!r || typeof r.pressureTokens !== 'number') continue
    out = {
      pressureTokens: r.pressureTokens,
      contextWindow: (typeof r.contextWindow === 'number' && r.contextWindow > 0) ? r.contextWindow : undefined,
      at: r.at,
    }
    break
  }
  return out
}

/** 取历史里最近一次已知的上下文窗口（跨重启回捞的分母来源）。 */
export function latestContextWindow(records) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i]
    if (r && typeof r.contextWindow === 'number' && r.contextWindow > 0) return r.contextWindow
  }
  return undefined
}

/* ---------- 时间窗聚合 ---------- */
/** 自然周 key：ISO 周一为一周起点。 */
export function weekKey(ts) {
  const d = new Date(ts)
  const day = (d.getUTCDay() + 6) % 7 // Mon=0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
  return monday.toISOString().slice(0, 10)
}

/** 自然月 key：YYYY-MM。 */
export function monthKey(ts) {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 滚动窗口边界：自 now 起最近 N 小时（整点跨界）。返回 [startIso, endIso]。 */
export function recentWindowHours(now, hours) {
  const end = now
  const start = new Date(now.getTime() - Number(hours) * 3600000)
  return [start.toISOString(), end.toISOString()]
}

/** 时间跨度面：N 小时 → "5h"；N 天 → "7d"。 */
export function windowLabel(opts) {
  if (opts && opts.rollingHours) return String(opts.rollingHours) + 'h'
  if (opts && opts.rollingDays) return String(opts.rollingDays) + 'd'
  return ''
}

/**
 * 按窗口聚合一组合计（记录带 at ISO；sessionKind 过滤可选）。
 * windowType ∈ week | month | rolling；rollingHours 用于 rolling（最近 N 小时滑窗）。
 * 返回 { [periodKey]: { buckets, totalTokens, records } }（时间升序）。
 */
export function aggregateByWindow(records, windowType, opts) {
  const cfg = opts || {}
  const now = cfg.now || new Date()
  const filterKind = (r) => !cfg.includeKinds || cfg.includeKinds.indexOf(r.sessionKind) !== -1
  const out = new Map()
  const add = (key, r) => {
    let row = out.get(key)
    if (!row) { row = { buckets: emptyBuckets(), totalTokens: 0, records: 0 }; out.set(key, row) }
    addBucketsInto(row.buckets, r.buckets || emptyBuckets())
    row.totalTokens += bucketTotal(r.buckets || emptyBuckets())
    row.records += 1
  }
  let win = null
  if (windowType === 'rolling') {
    const hours = Number.isFinite(Number(cfg.rollingHours)) ? Number(cfg.rollingHours) : 5
    win = recentWindowHours(now, hours)
  }
  for (const r of records) {
    if (!r || !r.at) continue
    if (filterKind && !filterKind(r)) continue
    const ts = Date.parse(r.at)
    if (!Number.isFinite(ts)) continue
    if (windowType === 'rolling') {
      if (ts >= Date.parse(win[0]) && ts <= Date.parse(win[1])) add('rolling', r)
    } else if (windowType === 'week') {
      add(weekKey(ts), r)
    } else if (windowType === 'month') {
      add(monthKey(ts), r)
    } else {
      add('all', r)
    }
  }
  const keys = [...out.keys()].sort()
  return keys.map((k) => ({ key: k, buckets: out.get(k).buckets, totalTokens: out.get(k).totalTokens, records: out.get(k).records }))
}

/* ---------- 数字格式化 ---------- */
/** token 缩写：1000→1K、1_000_000→1M；cap 保留一位小数。 */
export function fmtTokens(n) {
  const v = Number(n) || 0
  if (v < 1000) return String(Math.round(v))
  if (v < 1e6) {
    const k = v / 1000
    return (k >= 100 ? String(Math.round(k)) : String(Math.round(k * 10) / 10)) + 'K'
  }
  const m = v / 1e6
  return (m >= 100 ? String(Math.round(m)) : String(Math.round(m * 10) / 10)) + 'M'
}

/** 占比文本：如 "100K/1M"。 */
export function fmtRatio(used, cap) {
  if (used === undefined || used === null || cap === undefined || cap === null) return '–/–'
  return `${fmtTokens(used)}/${fmtTokens(cap)}`
}

/** 百分比（0-100 取整）。 */
export function percentOf(used, cap) {
  if (!(used > 0) || !(cap > 0)) return 0
  return Math.min(100, Math.round(used / cap * 100))
}

/** 金额格式化。cents=true 表示按最小显示单位（每百万 token 价的小数位）。 */
export function fmtMoney(v, currency, opts) {
  const cfg = opts || {}
  const n = Number(v)
  if (!Number.isFinite(n)) return '–'
  const digits = cfg.digits !== undefined ? cfg.digits : (Math.abs(n) < 0.01 && n !== 0 ? 4 : 2)
  const fixed = n.toFixed(digits).replace(/\.?0+$/, '')
  if (currency === 'CNY') return `¥${fixed}`
  if (currency === 'USD') return `$${fixed}`
  if (currency === 'CREDITS') return `${fixed} cr`
  return `${fixed} ${currency || ''}`.trim()
}
