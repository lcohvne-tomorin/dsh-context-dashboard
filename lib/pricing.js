/**
 * dsh-context-dashboard — 计价目录与解析（§需求3 / Q5 定稿）
 *
 * 目录原则：
 *  - 单价以「模型提供商官方文档」为来源；能核对的收录时注明 source URL 与 checked 日期。
 *  - 官方页查无此款的模型（如 deepseek-v4.1-flash-expires-on-0910 / qwen3.x / glm-5.x），
 *    以 verified:false + source:'PENDING*' 占位，按同档官方价估算，等待用户校准；
 *    未校准前在面板上标「估算」。
 *  - 用户设置页的单价覆盖表优先于目录（见 resolvePrice 的 overrides 参数）。
 *
 * 峰谷计价（官方口径，DeepSeek）：高峰时段价格为基准，空闲时段为高峰的一半。
 *  - 高峰 = 北京时间（UTC+8）周一至周五 09:00–12:00 与 14:00–18:00；其余为空闲。
 *  - 目录行用 rates（高峰）+ ratesOffPeak（空闲）两套价；resolvePrice 按传入时刻
 *    自动选档（不传即「现在」），并回传 window: 'peak' | 'offpeak' 供界面标注。
 *
 * 单位：CNY / USD / CREDITS，按「每 1e6 tokens」计。cacheWrite 官方未单列，
 * 按「缓存未命中输入价」计（写入即未命中）。
 */
export const CATALOG_META = {
  version: '0.1.1-official-deepseek',
  checked: '2026-09-08',
  sources: [
    { channel: 'deepseek-official', url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/', note: 'DeepSeek 官方「模型 & 价格」页：v4-flash / v4-pro / v4-flash-vision-exp 已核对（2026-09-08），峰谷时段与价格同页；4.1 预览款官方未收录' },
    { channel: 'qwen-token-plan-cn', url: 'https://www.alibabacloud.com/help/zh/model-studio/model-pricing', note: '阿里云百炼 Model Studio 官方计价页（真实 Qwen 款可查；本目录虚构版本号未收录，PENDING）' },
    { channel: 'opencode-go-full', url: 'https://opencode.ai/zen', note: 'OpenCode Zen 套餐/计价（社区文档可见；精确套餐单位价值 PENDING）' },
  ],
}

/* 峰谷时段（北京时间 UTC+8）：weekdays 用 JS getUTCDay 口径（0=周日）。 */
export const DEEPSEEK_PEAK_SCHEDULE = {
  tzOffsetMinutes: 480,
  weekdays: [1, 2, 3, 4, 5],
  windows: [['09:00', '12:00'], ['14:00', '18:00']],
}

/* 渠道元信息：计费形态 + 默认币种 + 出网余额查询白名单域（+ 可选峰谷时段）。 */
export const CHANNELS = {
  'qwen-token-plan-cn': {
    kind: 'paygo',
    currency: 'CNY',
    display: '阿里云百炼 (Qwen)',
    // §Q8：余额查询只打到官方白名单域；主站国内 dashscope.aliyuncs.com。
    balanceHosts: ['dashscope.aliyuncs.com', 'dashscope.aliyuncs.com.cn'],
  },
  'opencode-go-full': {
    kind: 'plan',
    currency: 'USD',
    display: 'opencode-go (Zen)',
    balanceHosts: ['opencode.ai'],
  },
  // DeepSeek 官方 API（llm-deepseek 的 deepseek-official 路由）：按量付费、人民币计价。
  // 余额接口：GET https://api.deepseek.com/user/balance（BALANCE_SPECS 已接入）。
  'deepseek-official': {
    kind: 'paygo',
    currency: 'CNY',
    display: 'DeepSeek 官方',
    balanceHosts: ['api.deepseek.com'],
    peakSchedule: DEEPSEEK_PEAK_SCHEDULE,
  },
}

/** 逐模型目录行。verified:false 表示「官方页查无、估算占位、待用户校准」。 */
export const CATALOG = [
  /* ---- deepseek-official（按量、CNY、峰谷；官方页已核对） ---- */
  // 高峰：缓存命中 0.10 / 未命中 3.0 / 输出 9.0；空闲为高峰一半（官方页 2026-09-08 核对）
  { channel: 'deepseek-official', model: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', verified: true, source: 'official', currency: 'CNY', rates: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 }, ratesOffPeak: { input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5 } },
  { channel: 'deepseek-official', model: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', verified: true, source: 'official', currency: 'CNY', rates: { input: 9.0, cacheRead: 0.30, cacheWrite: 9.0, output: 27.0 }, ratesOffPeak: { input: 4.5, cacheRead: 0.15, cacheWrite: 4.5, output: 13.5 } },
  { channel: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', verified: true, source: 'official', currency: 'CNY', rates: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 }, ratesOffPeak: { input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5 } },
  // 4.1 预览款官方页未收录：按同档 flash 官方价估算（标注估算，待校准）
  { channel: 'deepseek-official', model: 'deepseek-v4.1-flash-expires-on-0910', name: 'DeepSeek V4.1 Flash Preview', verified: false, source: 'PENDING-estimate', currency: 'CNY', rates: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 }, ratesOffPeak: { input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5 } },
  /* ---- opencode-go-full（套餐渠道，估算占位，PENDING） ---- */
  { channel: 'opencode-go-full', model: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', verified: false, source: 'PENDING', currency: 'USD', rates: { input: 0.28, cacheRead: 0.14, cacheWrite: 0.28, output: 0.42 } },
  { channel: 'opencode-go-full', model: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', verified: false, source: 'PENDING', currency: 'USD', rates: { input: 0.55, cacheRead: 0.27, cacheWrite: 0.55, output: 2.19 } },
  /* ---- qwen-token-plan-cn（按量渠道，官方真实款近似 + PENDING） ---- */
  { channel: 'qwen-token-plan-cn', model: 'qwen3.8-max', name: 'Qwen3.8 Max', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 8, cacheRead: 2, cacheWrite: 8, output: 16 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.7-max', name: 'Qwen3.7 Max', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 8, cacheRead: 2, cacheWrite: 8, output: 16 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.6-max', name: 'Qwen3.6 Max', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 8, cacheRead: 2, cacheWrite: 8, output: 16 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.8-plus', name: 'Qwen3.8 Plus', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 4, cacheRead: 1, cacheWrite: 4, output: 12 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.7-plus', name: 'Qwen3.7 Plus', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 4, cacheRead: 1, cacheWrite: 4, output: 12 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.6-plus', name: 'Qwen3.6 Plus', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 4, cacheRead: 1, cacheWrite: 4, output: 12 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.8-flash', name: 'Qwen3.8 Flash', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 1, cacheRead: 0.2, cacheWrite: 1, output: 4 } },
  { channel: 'qwen-token-plan-cn', model: 'qwen3.6-flash', name: 'Qwen3.6 Flash', verified: false, source: 'PENDING', currency: 'CNY', rates: { input: 1, cacheRead: 0.2, cacheWrite: 1, output: 4 } },
]

/** 渠道级 fallback（未收录模型的兜底价，同样 PENDING）。 */
export const CHANNEL_FALLBACK = {
  'qwen-token-plan-cn': { verified: false, source: 'PENDING-fallback', currency: 'CNY', rates: { input: 4, cacheRead: 1, cacheWrite: 4, output: 12 } },
  'opencode-go-full': { verified: false, source: 'PENDING-fallback', currency: 'USD', rates: { input: 0.4, cacheRead: 0.2, cacheWrite: 0.4, output: 1.1 } },
  'deepseek-official': { verified: false, source: 'PENDING-fallback', currency: 'CNY', rates: { input: 3.0, cacheRead: 0.10, cacheWrite: 3.0, output: 9.0 }, ratesOffPeak: { input: 1.5, cacheRead: 0.05, cacheWrite: 1.5, output: 4.5 } },
}

/** 渠道是否已知。 */
export function knownChannel(channel) {
  return Object.prototype.hasOwnProperty.call(CHANNELS, channel)
}

export function channelKind(channel) {
  return knownChannel(channel) ? CHANNELS[channel].kind : 'unknown'
}

export function channelMeta(channel) {
  return knownChannel(channel) ? CHANNELS[channel] : { kind: 'unknown', currency: null, display: channel || null, balanceHosts: [] }
}

/** 某时刻是否落在高峰时段内（schedule 见 DEEPSEEK_PEAK_SCHEDULE）。 */
export function isPeakWindow(schedule, at) {
  if (!schedule || !Array.isArray(schedule.windows) || schedule.windows.length === 0) return false
  const ts = at === undefined || at === null ? Date.now() : Number(at)
  if (!Number.isFinite(ts)) return false
  const shifted = new Date(ts + (Number(schedule.tzOffsetMinutes) || 0) * 60_000)
  const weekdays = Array.isArray(schedule.weekdays) ? schedule.weekdays : []
  if (weekdays.length > 0 && weekdays.indexOf(shifted.getUTCDay()) === -1) return false
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return schedule.windows.some(([from, to]) => {
    const f = String(from).split(':')
    const t = String(to).split(':')
    const start = Number(f[0]) * 60 + Number(f[1] || 0)
    const end = Number(t[0]) * 60 + Number(t[1] || 0)
    return minutes >= start && minutes < end
  })
}

/** 该渠道在某时刻的计价档位：'peak' | 'offpeak' | null（渠道无峰谷）。 */
export function windowAt(channel, at) {
  const meta = channelMeta(channel)
  if (!meta.peakSchedule) return null
  return isPeakWindow(meta.peakSchedule, at) ? 'peak' : 'offpeak'
}

/**
 * 解析某渠道某模型在某时刻的单价。
 * overrides: { "<channel>/<model>": { input, cacheRead, cacheWrite, output } }（设置页覆盖，优先）
 * at: 时间戳（毫秒）；省略即「现在」。峰谷渠道据此自动选档。
 * 返回 { price: {…, currency} | null, verified:boolean, source:string, fallback:boolean,
 *        window:'peak'|'offpeak'|null }。
 */
export function resolvePrice(channel, model, overrides, at) {
  const key = `${channel}/${model}`
  const ov = overrides && overrides[key]
  const meta = channelMeta(channel)
  if (ov && ov.input !== undefined) {
    const rates = {
      input: Number(ov.input) || 0,
      cacheRead: Number(ov.cacheRead) !== undefined && Number(ov.cacheRead) >= 0 ? Number(ov.cacheRead) : (Number(ov.input) || 0),
      cacheWrite: Number(ov.cacheWrite) >= 0 ? Number(ov.cacheWrite) : (Number(ov.input) || 0),
      output: Number(ov.output) || 0,
    }
    // 覆盖表是单一口径（不分峰谷），故 window 回 null，避免界面误标档位
    return { price: { ...rates, currency: meta.currency || null }, verified: true, source: 'override', fallback: false, window: null }
  }
  const win = windowAt(channel, at)
  const row = CATALOG.find((r) => r.channel === channel && r.model === model)
  if (row) {
    const rates = (win === 'offpeak' && row.ratesOffPeak) ? row.ratesOffPeak : row.rates
    return {
      price: { input: rates.input, cacheRead: rates.cacheRead, cacheWrite: rates.cacheWrite, output: rates.output, currency: row.currency },
      verified: !!row.verified, source: row.source, fallback: false, window: win,
    }
  }
  const fb = CHANNEL_FALLBACK[channel]
  if (fb) {
    const rates = (win === 'offpeak' && fb.ratesOffPeak) ? fb.ratesOffPeak : fb.rates
    return {
      price: { input: rates.input, cacheRead: rates.cacheRead, cacheWrite: rates.cacheWrite, output: rates.output, currency: fb.currency },
      verified: false, source: fb.source, fallback: true, window: win,
    }
  }
  return { price: null, verified: false, source: 'unavailable', fallback: true, window: win }
}

/** 便捷取价：只要单价（无价则 null）。 */
export function ratesAt(channel, model, overrides, at) {
  return resolvePrice(channel, model, overrides, at).price
}
