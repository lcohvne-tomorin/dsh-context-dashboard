import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as usage from '../lib/usage.js'
import * as pricing from '../lib/pricing.js'
import * as storage from '../lib/storage.js'

test('bucketsOf tolerates missing/invalid fields', () => {
  assert.deepEqual(usage.bucketsOf(undefined), { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 })
  assert.deepEqual(usage.bucketsOf({ inputTokens: '10', outputTokens: -3 }), { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 })
})

test('bucketTotal and pressureOf', () => {
  const b = { inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 20, outputTokens: 30 }
  assert.equal(usage.bucketTotal(b), 200)
  assert.equal(usage.pressureOf(b), 170) // input + cache read + cache write
})

test('costOf uses per-bucket rates per 1M tokens', () => {
  const b = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 500_000 }
  const price = { input: 2, cacheRead: 0.5, cacheWrite: 2, output: 8 }
  assert.equal(usage.costOf(b, price), 2 + 4)
  assert.equal(usage.costOf(b, null), null)
})

test('percentOf clamps and guards', () => {
  assert.equal(usage.percentOf(100_000, 1_000_000), 10)
  assert.equal(usage.percentOf(1_500_000, 1_000_000), 100)
  assert.equal(usage.percentOf(0, 0), 0)
})

test('weekKey Monday starts the week', () => {
  // 2026-09-03 is a Thursday (check): must belong to the Mon 2026-08-31 week
  assert.equal(usage.weekKey('2026-09-03T12:00:00Z'), '2026-08-31')
  assert.equal(usage.weekKey('2026-08-31T00:00:00Z'), '2026-08-31')
  assert.equal(usage.weekKey('2026-09-06T23:59:00Z'), '2026-08-31') // Sunday
})

test('monthKey', () => {
  assert.equal(usage.monthKey('2026-09-03T12:00:00Z'), '2026-09')
})

test('aggregateByWindow filters children and sums buckets', () => {
  const records = [
    { at: '2026-09-01T10:00:00Z', sessionId: 'a', sessionKind: 'main', buckets: { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 10 } },
    { at: '2026-09-01T11:00:00Z', sessionId: 'b', sessionKind: 'child', buckets: { inputTokens: 999, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 999 } },
    { at: '2026-08-10T10:00:00Z', sessionId: 'c', sessionKind: 'main', buckets: { inputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5 } },
  ]
  const month = usage.aggregateByWindow(records, 'month', { now: new Date('2026-09-10T00:00:00Z'), includeKinds: ['main'] })
  assert.equal(month.length, 2) // Aug + Sep
  const sep = month.find((x) => x.key === '2026-09')
  assert.ok(sep)
  assert.equal(sep.totalTokens, 110) // child (999+999) excluded
  const aug = month.find((x) => x.key === '2026-08')
  assert.equal(aug.totalTokens, 10)
  // include child
  const monthAll = usage.aggregateByWindow(records, 'month', { now: new Date('2026-09-10T00:00:00Z'), includeKinds: ['main', 'child'] })
  assert.equal(monthAll.find((x) => x.key === '2026-09').totalTokens, 110 + 1998)
})

test('windowStats rolling path excludes beyond hours window (regression off old day-roll)', () => {
  const records = [
    { at: '2026-09-10T00:00:00Z', sessionKind: 'main', buckets: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } }, // within 5h of 01:00 now? no -> 1h before
    { at: '2026-09-01T10:00:00Z', sessionKind: 'main', buckets: { inputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } },
  ]
  const r = usage.aggregateByWindow(records, 'rolling', { now: new Date('2026-09-10T01:00:00Z'), rollingHours: 3 })
  assert.equal(r.length, 1)
  assert.equal(r[0].totalTokens, 10) // 09-01 far outside, 09-10T00 is 1h old => inside
})

test('latestPressure finds most recent usable record', () => {
  const records = [
    { at: '2026-09-01T10:00:00Z', pressureTokens: 1000, contextWindow: 1e6 },
    { at: '2026-09-02T10:00:00Z', pressureTokens: 2000, contextWindow: 1e6 },
    { at: '2026-09-03T10:00:00Z', pressureTokens: undefined },
  ]
  const l = usage.latestPressure(records)
  assert.equal(l.pressureTokens, 2000)
  assert.equal(l.contextWindow, 1e6)
})

test('latestPressureSample keeps pressure when the record carries no window', () => {
  // 窗口来自 request/context，压力来自 usage：同一记录常常只有压力（回归「等待会话」）
  const records = [
    { at: '2026-09-01T10:00:00Z', pressureTokens: 1000, contextWindow: 1e6 },
    { at: '2026-09-02T10:00:00Z', pressureTokens: 2000 },
  ]
  const l = usage.latestPressureSample(records)
  assert.equal(l.pressureTokens, 2000)
  assert.equal(l.contextWindow, undefined)
  assert.equal(usage.latestPressure(records).pressureTokens, 1000) // 旧口径仍只认双字段
  assert.equal(usage.latestPressureSample([]), null)
  assert.equal(usage.latestPressureSample([{ at: 'x', pressureTokens: 'nope' }]), null)
})

test('latestContextWindow falls back to the newest known window', () => {
  const records = [
    { at: '2026-09-01T10:00:00Z', pressureTokens: 1000, contextWindow: 1e6 },
    { at: '2026-09-02T10:00:00Z', pressureTokens: 2000 },
    { at: '2026-09-03T10:00:00Z', pressureTokens: 3000, contextWindow: 2e5 },
  ]
  assert.equal(usage.latestContextWindow(records), 2e5)
  assert.equal(usage.latestContextWindow([{ at: 'x', pressureTokens: 1 }]), undefined)
  assert.equal(usage.latestContextWindow([]), undefined)
})

test('fmtTokens and fmtRatio', () => {
  assert.equal(usage.fmtTokens(999), '999')
  assert.equal(usage.fmtTokens(1000), '1K')
  assert.equal(usage.fmtTokens(128_000), '128K')
  assert.equal(usage.fmtTokens(1_500_000), '1.5M')
  assert.equal(usage.fmtRatio(128_000, 1_000_000), '128K/1M')
})

test('rolling aggregates trailing hours (default 5h), not days', () => {
  const now = new Date('2026-09-03T12:00:00Z')
  const inWin = { at: '2026-09-03T11:00:00Z', sessionKind: 'main', buckets: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } }
  const justInside = { at: '2026-09-03T07:01:00Z', sessionKind: 'main', buckets: { inputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } }
  const outside = { at: '2026-09-03T06:59:00Z', sessionKind: 'main', buckets: { inputTokens: 999, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 999 } }
  const olderDay = { at: '2026-09-02T23:00:00Z', sessionKind: 'main', buckets: { inputTokens: 888, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 888 } }
  const r = usage.aggregateByWindow([inWin, justInside, outside, olderDay], 'rolling', { now, rollingHours: 5 })
  assert.equal(r.length, 1)
  assert.equal(r[0].totalTokens, 10 + 20) // olderDay/outside excluded by the hour window
  assert.equal(r[0].buckets.outputTokens, 0)
})

test('rolling window boundary uses hours', () => {
  const [start, end] = usage.recentWindowHours(new Date('2026-09-03T12:00:00Z'), 5)
  assert.equal(end, '2026-09-03T12:00:00.000Z')
  assert.equal(start, '2026-09-03T07:00:00.000Z')
})

test('windowLabel reflects hours for rolling', () => {
  assert.equal(usage.windowLabel({ rollingHours: 5 }), '5h')
  assert.equal(usage.windowLabel({ rollingDays: 7 }), '7d')
  assert.equal(usage.windowLabel({}), '')
})

/* ---------- pricing ---------- */
test('knownChannel / channelKind', () => {
  assert.equal(pricing.channelKind('qwen-token-plan-cn'), 'paygo')
  assert.equal(pricing.channelKind('opencode-go-full'), 'plan')
  // 回归：DeepSeek 官方路由曾落到 unknown，仪表盘显示「未知渠道」且无费用
  assert.equal(pricing.knownChannel('deepseek-official'), true)
  assert.equal(pricing.channelKind('deepseek-official'), 'paygo')
  assert.equal(pricing.channelMeta('deepseek-official').display, 'DeepSeek 官方')
  // 官方以人民币计价
  assert.equal(pricing.channelMeta('deepseek-official').currency, 'CNY')
  assert.deepEqual(pricing.channelMeta('deepseek-official').balanceHosts, ['api.deepseek.com'])
  assert.ok(pricing.channelMeta('deepseek-official').peakSchedule)
  assert.equal(pricing.channelKind('whatever'), 'unknown')
})

/* 北京时间（UTC+8）2026-09-08 是周二：10:00 高峰、20:00 空闲 */
const PEAK_AT = Date.parse('2026-09-08T02:00:00Z') // 北京 10:00
const OFFPEAK_AT = Date.parse('2026-09-08T12:00:00Z') // 北京 20:00

test('deepseek-official: official CNY rates with automatic peak/off-peak selection', () => {
  const peak = pricing.resolvePrice('deepseek-official', 'deepseek-v4-flash', {}, PEAK_AT)
  assert.equal(peak.verified, true)
  assert.equal(peak.source, 'official')
  assert.equal(peak.window, 'peak')
  assert.equal(peak.price.currency, 'CNY')
  assert.equal(peak.price.input, 3.0)
  assert.equal(peak.price.cacheRead, 0.10)
  assert.equal(peak.price.output, 9.0)

  const off = pricing.resolvePrice('deepseek-official', 'deepseek-v4-flash', {}, OFFPEAK_AT)
  assert.equal(off.window, 'offpeak')
  assert.equal(off.price.input, 1.5) // 空闲 = 高峰的一半
  assert.equal(off.price.cacheRead, 0.05)
  assert.equal(off.price.output, 4.5)

  const pro = pricing.resolvePrice('deepseek-official', 'deepseek-v4-pro', {}, PEAK_AT)
  assert.equal(pro.price.input, 9.0)
  assert.equal(pro.price.output, 27.0)

  // 4.1 预览款官方页未收录 → 估算，但同样按峰谷切换
  const v41 = pricing.resolvePrice('deepseek-official', 'deepseek-v4.1-flash-expires-on-0910', {}, PEAK_AT)
  assert.equal(v41.verified, false)
  assert.equal(v41.source, 'PENDING-estimate')
  assert.equal(v41.fallback, false)
  assert.equal(v41.window, 'peak')
  assert.equal(v41.price.currency, 'CNY')

  // 未收录模型 → 渠道兜底（人民币、同样峰谷）
  const fb = pricing.resolvePrice('deepseek-official', 'no-such-deepseek-model', {}, OFFPEAK_AT)
  assert.equal(fb.fallback, true)
  assert.equal(fb.price.currency, 'CNY')
  assert.equal(fb.window, 'offpeak')

  // 设置页覆盖优先，且覆盖表是单一口径（window=null，界面不误标档位）
  const ov = pricing.resolvePrice('deepseek-official', 'deepseek-v4-flash', {
    'deepseek-official/deepseek-v4-flash': { input: 1, cacheRead: 0.5, cacheWrite: 1, output: 2 },
  }, PEAK_AT)
  assert.equal(ov.source, 'override')
  assert.equal(ov.verified, true)
  assert.equal(ov.window, null)
  assert.equal(ov.price.output, 2)
})

test('isPeakWindow: Beijing weekday windows; weekend and lunch are off-peak', () => {
  const s = pricing.DEEPSEEK_PEAK_SCHEDULE
  const at = (iso) => Date.parse(iso)
  assert.equal(pricing.isPeakWindow(s, at('2026-09-08T01:00:00Z')), true)  // 周二 09:00（起点含）
  assert.equal(pricing.isPeakWindow(s, at('2026-09-08T03:59:00Z')), true)  // 周二 11:59
  assert.equal(pricing.isPeakWindow(s, at('2026-09-08T04:00:00Z')), false) // 周二 12:00（终点不含）
  assert.equal(pricing.isPeakWindow(s, at('2026-09-08T06:00:00Z')), true)  // 周二 14:00
  assert.equal(pricing.isPeakWindow(s, at('2026-09-08T10:00:00Z')), false) // 周二 18:00
  assert.equal(pricing.isPeakWindow(s, at('2026-09-11T02:00:00Z')), true)  // 周五 10:00
  assert.equal(pricing.isPeakWindow(s, at('2026-09-12T02:00:00Z')), false) // 周六 10:00
  assert.equal(pricing.windowAt('qwen-token-plan-cn', PEAK_AT), null)      // 无峰谷渠道
  assert.equal(pricing.windowAt('deepseek-official', PEAK_AT), 'peak')
})

test('costOfRecords prices each record by its own timestamp (peak/off-peak split)', () => {
  const ratesFor = (r) => pricing.ratesAt('deepseek-official', 'deepseek-v4-flash', {}, Date.parse(r.at))
  const bucket = { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
  const records = [
    { at: '2026-09-08T02:00:00Z', buckets: bucket }, // 高峰 3.0
    { at: '2026-09-08T12:00:00Z', buckets: bucket }, // 空闲 1.5
  ]
  assert.equal(usage.costOfRecords(records, ratesFor), 4.5)
  assert.equal(usage.costOfRecords([], ratesFor), 0)
  assert.equal(usage.costOfRecords([{ at: 'x', buckets: bucket }], () => null), 0)
})

test('resolvePrice prefers override then catalog then fallback', () => {
  const r1 = pricing.resolvePrice('opencode-go-full', 'deepseek-v4-flash', {})
  assert.equal(r1.verified, false)
  assert.equal(r1.price.currency, 'USD')
  const overrides = { 'opencode-go-full/deepseek-v4-flash': { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 } }
  const r2 = pricing.resolvePrice('opencode-go-full', 'deepseek-v4-flash', overrides)
  assert.equal(r2.verified, true)
  assert.equal(r2.source, 'override')
  assert.equal(r2.price.input, 1)
  const r3 = pricing.resolvePrice('opencode-go-full', 'no-such-model', {})
  assert.equal(r3.fallback, true)
  const r4 = pricing.resolvePrice('nope', 'x', {})
  assert.equal(r4.price, null)
})

test('sanitizeOverrides keeps real model ids and rejects unsafe keys', () => {
  const good = storage.sanitizeOverrides({
    'deepseek-official/deepseek-v4.1-flash-expires-on-0910': { input: 3, cacheRead: 0.1, cacheWrite: 3, output: 9 },
    'my-gateway/vendor:model+preview@2026': { input: 1, cacheRead: 0, cacheWrite: 1, output: 2 },
    'my-gateway/negative': { input: -1, cacheRead: 0, cacheWrite: 0, output: 0 },
    'my-gateway/nan': { input: 'x', cacheRead: 0, cacheWrite: 0, output: 0 },
    '../etc/passwd': { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 },
    'no-slash-key': { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 },
    'my-gateway/sp ace': { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 },
  })
  assert.deepEqual(Object.keys(good).sort(), [
    'deepseek-official/deepseek-v4.1-flash-expires-on-0910',
    'my-gateway/vendor:model+preview@2026',
  ])
  assert.equal(good['my-gateway/vendor:model+preview@2026'].output, 2)
})
