/**
 * dsh-context-dashboard — host 半 · HTTP 安全工具
 * （结构照 dsh-memory/httpkit.js / dsh-sample-greeting 姿态，属 DSH 插件安全模板）
 *  - 回环 Host 门槛（§7.2）
 *  - 同源校验 + 进程级一次性 CSRF token + 滑动窗口限流（§7.3）
 *  - 请求体字节上限（§7.5）、错误响应泛化（§7.7）
 *  - host 端参数清洗由调用方执行（§7.4）
 */
import { randomBytes } from 'node:crypto'

export const CSRF_HEADER = 'x-dsh-cd-csrf'

/* ---------- 回环 Host ---------- */
export function isLoopbackHost(hostHeader, port) {
  if (typeof hostHeader !== 'string' || hostHeader.length === 0) return false
  let h = hostHeader; let p = null
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(hostHeader)
  if (bracket) { h = bracket[1]; p = bracket[2] }
  else {
    const idx = hostHeader.lastIndexOf(':')
    if (idx !== -1 && hostHeader.indexOf(':') === idx) { h = hostHeader.slice(0, idx); p = hostHeader.slice(idx + 1) }
    else { h = hostHeader; p = null }
  }
  if (h !== '127.0.0.1' && h !== 'localhost' && h !== '::1') return false
  if (p !== null && typeof port === 'number' && p !== String(port)) return false
  return true
}

/* ---------- 同源（Sec-Fetch-Site / Origin 兜底） ---------- */
export function isSameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (site === 'same-origin' || site === 'same-site' || site === 'none') return true
  const origin = req.headers['origin']
  if (typeof origin === 'string' && origin.length > 0) {
    try { return new URL(origin).host === (req.headers['host'] || '') } catch { /* fallthrough */ }
  }
  return false
}

/* ---------- 响应工具 ---------- */
export function sendJson(res, status, payload) {
  try {
    res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  } catch { /* ignore */ }
}

/* ---------- 请求体上限（§7.5） ---------- */
export async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

/* ---------- 滑动窗口限流（写端点分档） ---------- */
export function makeRateLimiter(windowMs, limit) {
  const hits = new Map()
  return function allow(remoteAddr) {
    const key = remoteAddr || 'local'
    const now = Date.now()
    let arr = hits.get(key)
    if (!arr) { arr = []; hits.set(key, arr) }
    while (arr.length > 0 && arr[0] <= now - windowMs) arr.shift()
    if (arr.length >= limit) return false
    arr.push(now)
    return true
  }
}

/* ---------- 写端点守卫：同源 + CSRF + 限流 ---------- */
export function guardWrite(req, csrfToken, allow) {
  if (!isSameOrigin(req)) return { status: 403, payload: { ok: false, message: 'forbidden: same-origin required' } }
  if (req.headers[CSRF_HEADER] !== csrfToken) return { status: 403, payload: { ok: false, message: 'forbidden: missing csrf token' } }
  if (!allow(req.socket.remoteAddress)) return { status: 429, payload: { ok: false, message: 'too many requests' } }
  return null
}

/* ---------- CSRF token（进程级一次性，经只读 GET /config 下发，§7.3） ---------- */
export function newCsrfToken() {
  return randomBytes(32).toString('hex')
}
