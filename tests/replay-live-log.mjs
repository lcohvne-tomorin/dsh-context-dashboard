/**
 * 真机日志回放验证（非单测；用真实 session.jsonl.zstd 事件流跑修好的 host 半）
 *
 * 用法：node tests/replay-live-log.mjs <session.jsonl.zstd 路径>
 *  - 按官方 SessionEventMap 形状回放：request/header、request/context、assistant/message
 *  - Session 桩的 requestContext() 折叠整条日志（与真实 Session 语义一致）
 *  - 打印 /status 的 context 字段，确认不再是 { available: false }（「等待会话…」）
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const logPath = process.argv[2]
if (!logPath) { console.error('usage: node tests/replay-live-log.mjs <session.jsonl.zstd>'); process.exit(2) }

const TMP = mkdtempSync(join(tmpdir(), 'dsh-cd-replay-'))
process.env.DSH_HOME = TMP

const host = (await import('../lib/index.js')).default

let eventHandler = null
let routeSpec = null
const res = {
  writeHead(status, headers) { this.status = status; this.headers = headers || {} },
  end(body) { this.body = body },
}
const server = { port: 3080, register(spec) { routeSpec = spec } }
const ctx = {
  get(name) { return name === 'webServer' ? server : undefined },
  on(type, fn) { if (type === 'session/event') eventHandler = fn; return () => {} },
  effect(fn) { return fn() || (() => {}) },
  logger: { info() {}, warn() {}, error(m) { console.error(m) } },
}
host.apply(ctx)

/* 真实日志：多个独立 zstd 帧串接（每帧一批 JSONL 行），逐帧解压 */
function decodeAllFrames(buf) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = []
  for (let i = 0; ;) {
    const j = buf.indexOf(MAGIC, i)
    if (j < 0) break
    starts.push(j)
    i = j + 1
  }
  const chunks = []
  let idx = 0
  while (idx < starts.length) {
    let done = false
    for (let k = idx; k < starts.length; k += 1) {
      const end = k + 1 < starts.length ? starts[k + 1] : buf.length
      try {
        chunks.push(zstdDecompressSync(buf.subarray(starts[idx], end)))
        idx = k + 1
        done = true
        break
      } catch { /* 疑似帧内魔数：延长到下一帧起点重试 */ }
    }
    if (!done) break
  }
  return Buffer.concat(chunks)
}

const text = decodeAllFrames(readFileSync(logPath)).toString('utf8')
const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l))

/* Session 桩：只暴露 host 用到的 id + requestContext()（折叠 request/context） */
const sessionId = 'replay-session'
let foldedContext
const session = {
  id: sessionId,
  requestContext() { return foldedContext },
}

const stats = { header: 0, context: 0, message: 0, other: 0 }
for (const ev of events) {
  if (ev.type === 'request/context') foldedContext = ev.data
  if (ev.type === 'request/header') stats.header += 1
  else if (ev.type === 'request/context') stats.context += 1
  else if (ev.type === 'assistant/message') stats.message += 1
  else { stats.other += 1; continue }
  eventHandler(session, ev)
}

const req = {
  method: 'GET',
  url: '/dsh-context-dashboard/status',
  headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
  socket: { remoteAddress: '127.0.0.1' },
}
await routeSpec.handler(req, res)
const status = JSON.parse(res.body)

console.log('replayed events:', stats)
console.log('session:', status.session)
console.log('context:', status.context)
console.log('sessionTotals:', status.sessionTotals.tokensTotal, 'tokens over', status.sessionTotals.records, 'records')
console.log('planStats.rolling:', status.planStats.rolling.totalTokens, '/ week:', status.planStats.week.totalTokens, '/ month:', status.planStats.month.totalTokens)
console.log('cost:', status.cost)
try { rmSync(TMP, { recursive: true, force: true }) } catch { /* ignore */ }

if (!status.context || status.context.available !== true) {
  console.error('FAIL: context still unavailable')
  process.exit(1)
}
console.log('OK: context available =', status.context.usedTokens + '/' + status.context.contextWindow, '(' + status.context.percent + '%)')
