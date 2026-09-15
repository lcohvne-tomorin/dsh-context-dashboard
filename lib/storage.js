/**
 * dsh-context-dashboard — host 半 · 配置与用量历史落盘（§6）
 * 一切持久化数据只写 $DSH_HOME/storages/dsh-context-dashboard/。
 *  - config.json：设置（含单价覆盖；不含任何 key 明文——key 只读 env）
 *  - history.jsonl：全局用量历史（会话事件驱动逐条追加，bounded trim）
 *  - fold.json：UI 折叠态记忆（可选，默认开）
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULTS = {
  ui: {
    defaultCollapsed: true,
    rememberFold: true,
    railRing: true,
  },
  balance: {
    enabled: true,
    // key 来源：一律 env（{ "<channel>": { mode:'env', envName } }），不落盘明文。
    // 不预置渠道：渠道清单由 host 半按模型选择器可用渠道动态提供；
    // 未显式配置的渠道在查询时回退推荐 env 名（index.js suggestEnvFor）。
    keys: {},
    refreshMs: 30000,
  },
  priceOverrides: {}, // { "<channel>/<model>": { input, cacheRead, cacheWrite, output } }
  display: { currency: 'auto', shorthand: true },
  stats: {
    windowType: 'month', // 面板上周/月粒度展示：month 展示最近自然周+月
    rollingHours: 5, // 滚动用量窗口：最近 5 小时（多数 API 提供商口径）
    includeChildren: false, // 周/月聚合是否计入子代理等独立 session
  },
  threshold: 80, // 上下文环警示阈值（%）
}

const num = (v, lo, hi, dflt) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt
}
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt)
const str = (v, dflt) => (typeof v === 'string' && v.length > 0 ? v : dflt)
const cleanToken = (v) => str(v, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120)

/** 清干净路径段（防 §7.4 拼接注入；本插件仅用于日志/session 元数据，不拼文件路径）。 */
export function cleanText(v, max) { return cleanToken(v).slice(0, max || 120) }

export function defaultConfig() { return JSON.parse(JSON.stringify(DEFAULTS)) }

export function sanitizeConfig(raw) {
  const cfg = defaultConfig()
  const r = (raw && typeof raw === 'object') ? raw : {}
  cfg.ui = {
    defaultCollapsed: bool(r.ui && r.ui.defaultCollapsed, cfg.ui.defaultCollapsed),
    rememberFold: bool(r.ui && r.ui.rememberFold, cfg.ui.rememberFold),
    railRing: bool(r.ui && r.ui.railRing, cfg.ui.railRing),
  }
  const bk = r.balance || {}
  cfg.balance = {
    enabled: bool(bk.enabled, cfg.balance.enabled),
    keys: {},
    refreshMs: num(bk.refreshMs, 5000, 600000, cfg.balance.refreshMs),
  }
  // keys：渠道不限预设（模型选择器动态渠道均可），envName 走环境变量名白名单（§7.4）
  const keySrc = (bk.keys && typeof bk.keys === 'object') ? bk.keys : {}
  for (const [ch, k] of Object.entries(keySrc)) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(ch)) continue
    if (k && k.mode === 'env' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(k.envName || ''))) {
      cfg.balance.keys[ch] = { mode: 'env', envName: String(k.envName) }
    }
  }
  cfg.priceOverrides = sanitizeOverrides(r.priceOverrides)
  cfg.display = {
    currency: r.display && (r.display.currency === 'auto' || r.display.currency === 'CNY' || r.display.currency === 'USD' || r.display.currency === 'CREDITS')
      ? r.display.currency : cfg.display.currency,
    shorthand: bool(r.display && r.display.shorthand, cfg.display.shorthand),
  }
  cfg.stats = {
    windowType: r.stats && (r.stats.windowType === 'week' || r.stats.windowType === 'month') ? r.stats.windowType : cfg.stats.windowType,
    rollingHours: num(r.stats && r.stats.rollingHours, 1, 168, cfg.stats.rollingHours),
    includeChildren: bool(r.stats && r.stats.includeChildren, cfg.stats.includeChildren),
  }
  cfg.threshold = num(r.threshold, 1, 100, cfg.threshold)
  return cfg
}

/** 单价覆盖白名单：每个值 ≥0 且为有限数；整条非法即拒绝。 */
export function sanitizeOverrides(raw) {
  const out = {}
  const src = (raw && typeof raw === 'object') ? raw : {}
  for (const [key, rates] of Object.entries(src)) {
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(key)) continue
    if (!rates || typeof rates !== 'object') continue
    const iv = Number(rates.input); const cv = Number(rates.cacheRead); const wv = Number(rates.cacheWrite); const ov = Number(rates.output)
    const ok = [iv, cv, wv, ov].every((x) => Number.isFinite(x) && x >= 0)
    if (!ok) continue
    out[key] = { input: iv, cacheRead: cv, cacheWrite: wv, output: ov }
  }
  return out
}

/* ---------- 目录 ---------- */
let dir = ''
export function storageDir(dshHome) {
  if (dir) return dir
  const home = dshHome || (typeof process !== 'undefined' && process.env.DSH_HOME) || ''
  const base = (home && home.length > 0) ? home : (typeof process !== 'undefined' && process.env.HOME) || ''
  dir = join(base, 'storages', 'dsh-context-dashboard')
  return dir
}
function resolveDir(dshHome) {
  if (!dir) dir = storageDir(dshHome)
  return dir
}
function ensureDir(dshHome) {
  try { mkdirSync(resolveDir(dshHome), { recursive: true }) } catch { /* ignore */ }
}

/* ---------- config ---------- */
export function readConfig(dshHome) {
  const p = join(resolveDir(dshHome), 'config.json')
  try { return sanitizeConfig(JSON.parse(readFileSync(p, 'utf8'))) } catch { return defaultConfig() }
}
export function writeConfig(cfg, dshHome) {
  ensureDir(dshHome)
  try { writeFileSync(join(resolveDir(dshHome), 'config.json'), JSON.stringify(cfg, null, 2)) } catch { /* ignore */ }
}

/* ---------- fold 记忆 ---------- */
export function readFold(dshHome) {
  const p = join(resolveDir(dshHome), 'fold.json')
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'))
    return typeof v.collapsed === 'boolean' ? !!v.collapsed : undefined
  } catch { return undefined }
}
export function writeFold(collapsed, dshHome) {
  ensureDir(dshHome)
  try { writeFileSync(join(resolveDir(dshHome), 'fold.json'), JSON.stringify({ collapsed: !!collapsed })) } catch { /* ignore */ }
}

/* ---------- 用量历史（jsonl 追加；每次追加后按行数 trim） ---------- */
const HISTORY_MAX = 200000 // 上限行（超出清最旧一半）
export function appendHistory(records, dshHome) {
  if (!records || records.length === 0) return
  ensureDir(dshHome)
  const p = join(resolveDir(dshHome), 'history.jsonl')
  let lines = ''
  for (const r of records) lines += JSON.stringify(r) + '\n'
  try { appendFileSync(p, lines) } catch { /* ignore */ }
  try {
    if (existsSync(p) && statSync(p).size > 0) {
      const all = readFileSync(p, 'utf8').split('\n').filter(Boolean)
      if (all.length > HISTORY_MAX) {
        writeFileSync(p, all.slice(all.length - Math.floor(HISTORY_MAX / 2)).join('\n') + '\n')
      }
    }
  } catch { /* ignore */ }
}
export function readHistory(dshHome, sinceIso) {
  const p = join(resolveDir(dshHome), 'history.jsonl')
  const out = []
  try {
    const since = sinceIso ? Date.parse(sinceIso) : 0
    const lines = readFileSync(p, 'utf8').split('\n')
    for (const ln of lines) {
      if (!ln) continue
      try {
        const r = JSON.parse(ln)
        if (!r || typeof r !== 'object') continue
        if (since && Date.parse(r.at) < since) continue
        out.push(r)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return out
}
