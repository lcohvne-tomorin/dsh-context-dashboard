/* dsh-context-dashboard — client 半（浏览器 bundle）
 *
 * UI（Q4 定稿）：
 *  - footer 状态座（sidebar.footer.action 槽，Settings 上方）：
 *    · DSH 侧栏 wide：常驻 pill（折叠态，宽与 Settings 按钮一致）→ 点击平滑向上
 *      展开为完整面板；再点收起。面板按当前渠道计费形态分支：
 *      按量(paygo)= 渠道/模型/上下文/本次花费/账户余额；
 *      token plan = 渠道/模型/本次花费/本次使用额度/滚动/每周/每月用量。
 *    · DSH 侧栏 rail（56px）：仅被动显示上下文环形（Q4 定稿：不交互）。
 *  - settings.section 分区（Q7 勾选 8 项）：折叠默认态+记忆 / rail 环形开关 /
 *    余额开关+key env 覆盖 / 单价覆盖表 / 货币与简写 / 统计窗口与聚合范围 /
 *    环警告阈值（双语自动跟随，无开关）。
 *
 * 纪律：纯 JS + React.createElement（无 JSX/import）；--dsw-* token；文字白黑灰；
 * 内联 SVG 图标（20×20/viewBox24/stroke currentColor）；单一 <style>（.cd- 前缀，
 * 全挂在 .cd-root 门控下，卸载即移除）；只经宿主 /dsh-context-dashboard/* 通信，
 * 写请求携 x-dsh-cd-csrf；定时器经 ctx.timeout；错误 5s/成功 3s。
 */
window.__ModuleLoader__.load({
	id: "dsh-context-dashboard",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;

		var React = require("react");
		var h = React.createElement;

		/* ================= 文案（中英双语） ================= */
		var zh = {
			appName: "上下文仪表盘",
			foldShow: "显示仪表盘",
			foldHide: "收起仪表盘",
			seatTitle: "上下文",
			noContext: "等待会话…",
			context: "上下文",
			channel: "API 渠道",
			model: "模型",
			paygo: "按量付费",
			plan: "Token 套餐",
			unknownChannel: "未知渠道",
			noSession: "暂无会话数据",
			cost: "本次花费",
			balance: "账户余额",
			balanceUnavailable: "余额暂不可用",
			balanceReason: "不可用",
			thisQuota: "本次使用额度",
			rolling: "滚动用量",
			weekly: "每周用量",
			monthly: "每月用量",
			days: "{n} 天",
			tokens: "{n} tokens",
			unverified: "估算",
			verified: "官方",
			peak: "高峰",
			offpeak: "空闲",
			overLimit: "超限",
			refresh: "刷新余额",
			refreshing: "刷新中…",
			refreshDone: "已刷新",
			refreshFail: "余额刷新失败",
			balNoApi: "余额接口未配置（官方规格待提供）",
			balNoKey: "未找到渠道密钥（凭据库/环境变量）",
			loadFailed: "数据加载失败",
			cfgTab: "设置",
			cfgDefaultCollapsed: "默认折叠",
			cfgDefaultCollapsedDesc: "启动时仪表盘默认只显示上下文环（不展开详情）。",
			cfgRememberFold: "记忆折叠状态",
			cfgRememberFoldDesc: "重启后恢复上次的折叠/展开状态。",
			cfgRailRing: "窄栏环形指示",
			cfgRailRingDesc: "侧边栏收成 56px 窄条时，在底部显示当前会话上下文环形（仅指示，不交互）。",
			cfgBalance: "余额查询",
			cfgBalanceDesc: "开启后向渠道官方账户接口查询余额/配额；仅在设置的白名单域名内出网。",
			cfgKeySource: "密钥来源（环境变量）",
			cfgKeySourceDesc: "key 只从环境变量读取，绝不落盘、不进日志、不下发界面。",
			cfgOverrides: "单价覆盖表",
			cfgOverridesDesc: "覆盖官方计价目录（每百万 token）。留空该格则沿用目录。未收录的估算值也在此校准。",
			cfgOverrideEmpty: "暂无覆盖。选择下方渠道+模型添加。",
			cfgAddOverride: "添加覆盖",
			cfgCurrency: "显示货币",
			cfgCurrencyAuto: "按渠道自动",
			cfgShorthand: "数字简写",
			cfgShorthandDesc: "用 K/M 缩写 token 与金额（如 128K/1M）。",
			cfgWindow: "统计窗口与聚合范围",
			cfgWindowDesc: "每周/每月用量按自然周/自然月统计；滚动用量为最近 N 天。",
			cfgWeekMonth: "周期粒度",
			cfgRollingHours: "滚动窗口（小时）",
			delOv: "删除此覆盖",
			cfgIncludeChildren: "计入子代理",
			cfgIncludeChildrenDesc: "周/月/滚动聚合是否包含子代理等独立会话（v0.1 尚无法可靠区分，默认不含，README 注明）。",
			cfgThreshold: "上下文警示阈值",
			cfgThresholdDesc: "上下文占用达到该百分比时，环形转为警示色（%）。",
			cfgSave: "保存设置",
			cfgSaving: "保存中…",
			cfgSaved: "设置已保存",
			cfgSaveFail: "保存失败，请重试",
			cfgUnsaved: "有未保存的更改",
			cfgLoadFailed: "设置加载失败",
			catModel: "模型",
			catIn: "输入",
			catHit: "缓存读",
			catOut: "输出",
			catCurrency: "币种",
			catStatus: "状态",
			colChannel: "渠道",
			catalogHint: "计价目录（改后请保存；覆盖表优先于目录）",
			errUnknown: "—",
		};
		var en = {
			appName: "Context Dashboard",
			foldShow: "Show dashboard",
			foldHide: "Hide dashboard",
			seatTitle: "Context",
			noContext: "Awaiting session…",
			context: "Context",
			channel: "API channel",
			model: "Model",
			paygo: "Pay-as-you-go",
			plan: "Token plan",
			unknownChannel: "Unknown channel",
			noSession: "No session data",
			cost: "This-session cost",
			balance: "Account balance",
			balanceUnavailable: "Balance unavailable",
			balanceReason: "unavailable",
			thisQuota: "This-session usage",
			rolling: "Rolling usage",
			weekly: "Weekly usage",
			monthly: "Monthly usage",
			days: "{n} days",
			tokens: "{n} tokens",
			unverified: "est.",
			verified: "official",
			peak: "Peak",
			offpeak: "Off-peak",
			overLimit: "over limit",
			refresh: "Refresh balance",
			refreshing: "Refreshing…",
			refreshDone: "Refreshed",
			refreshFail: "Balance refresh failed",
			balNoApi: "Balance API not configured (spec pending)",
			balNoKey: "No channel key in the credentials store or environment",
			loadFailed: "Failed to load data",
			cfgTab: "Settings",
			cfgDefaultCollapsed: "Collapsed by default",
			cfgDefaultCollapsedDesc: "Start with only the context ring shown (details collapsed).",
			cfgRememberFold: "Remember fold state",
			cfgRememberFoldDesc: "Restore the last collapsed/expanded state after restart.",
			cfgRailRing: "Rail ring indicator",
			cfgRailRingDesc: "When the sidebar collapses to the 56px rail, show a passive context ring at the foot.",
			cfgBalance: "Balance queries",
			cfgBalanceDesc: "Query the channel's official account API for balance/quota; outbound only to whitelisted domains.",
			cfgKeySource: "Key source (environment)",
			cfgKeySourceDesc: "Keys are only read from environment variables; never stored, logged or sent to the UI.",
			cfgOverrides: "Price overrides",
			cfgOverridesDesc: "Override the official pricing catalog (per 1M tokens). Leave a rate blank to keep the catalog. Unverified estimates are calibrated here.",
			cfgOverrideEmpty: "No overrides yet. Pick a channel + model below to add one.",
			cfgAddOverride: "Add override",
			cfgCurrency: "Display currency",
			cfgCurrencyAuto: "Auto per channel",
			cfgShorthand: "Number shorthand",
			cfgShorthandDesc: "Shrink tokens and amounts with K/M (e.g. 128K/1M).",
			cfgWindow: "Windows & scope",
			cfgWindowDesc: "Weekly/monthly use natural windows. Rolling usage is the trailing window (default 5h, matching most API providers).",
			cfgWeekMonth: "Period granularity",
			cfgRollingHours: "Rolling window (hours)",
			delOv: "Delete override",
			cfgIncludeChildren: "Include subagents",
			cfgIncludeChildrenDesc: "Whether weekly/monthly/rolling aggregation includes child sessions (v0.1 cannot yet classify them reliably; default excludes — see README).",
			cfgThreshold: "Context warning threshold",
			cfgThresholdDesc: "Ring turns to a warning tint when context occupancy reaches this percent.",
			cfgSave: "Save settings",
			cfgSaving: "Saving…",
			cfgSaved: "Settings saved",
			cfgSaveFail: "Save failed, please retry",
			cfgUnsaved: "Unsaved changes",
			cfgLoadFailed: "Failed to load settings",
			catModel: "Model",
			catIn: "Input",
			catHit: "Cache hit",
			catOut: "Output",
			catCurrency: "Currency",
			catStatus: "Status",
			colChannel: "Channel",
			catalogHint: "Pricing catalog (save to apply; overrides win)",
			errUnknown: "—",
		};
		function isZh() {
			return (document.documentElement.lang || "zh").toLowerCase().indexOf("zh") === 0;
		}
		function dictFor() { return isZh() ? zh : en; }
		function t(key) { var d = dictFor(); return (key in d) ? d[key] : key; }
		function fmt(str, params) {
			return String(str).replace(/\{(\w+)\}/g, function (_, k) {
				return (params && k in params) ? String(params[k]) : ("{" + k + "}");
			});
		}

		/* ================= host 通信（CSRF 头 x-dsh-cd-csrf） ================= */
		var API = {
			status: "/dsh-context-dashboard/status",
			config: "/dsh-context-dashboard/config",
			fold: "/dsh-context-dashboard/fold",
			refresh: "/dsh-context-dashboard/refresh-balance",
		};
		var CSRF_HEADER = "x-dsh-cd-csrf";
		var csrfToken = null;

		function apiGet(path) {
			return fetch(path, { cache: "no-store" })
				.then(function (r) { return r.json(); })
				.catch(function (e) { return { ok: false, message: String((e && e.message) || e) }; });
		}
		function primeCsrf() {
			return fetch(API.config, { cache: "no-store" })
				.then(function (r) { return r.json(); })
				.then(function (res) {
					if (res && res.ok && typeof res.csrf === "string" && res.csrf) csrfToken = res.csrf;
					return !!csrfToken;
				}).catch(function () { return false; });
		}
		function apiPost(path, body) {
			var send = function () {
				var headers = { "content-type": "application/json" };
				if (csrfToken) headers[CSRF_HEADER] = csrfToken;
				return fetch(path, { method: "POST", headers: headers, body: JSON.stringify(body || {}) })
					.then(function (r) { return r.json(); })
					.catch(function (e) { return { ok: false, message: String((e && e.message) || e) }; });
			};
			if (csrfToken) return send();
			return primeCsrf().then(send);
		}

		/* ================= 颜色（--dsw-*，文字仅白黑灰） ================= */
		var C_OK = "var(--dsw-alias-state-success-primary)";
		var C_ERR = "var(--dsw-alias-state-error-primary)";
		var C_INFO = "var(--dsw-alias-state-business-primary)";
		var C_WARN = "var(--dsw-alias-state-warn-primary)";
		var C_NEUTRAL = "var(--dsw-alias-label-tertiary)";
		var C_INK = "var(--dsw-alias-label-primary)";

		/* ================= 内联 SVG 图标（§8.4） ================= */
		function Svg(props) {
			return h("svg", {
				width: props.width || 20, height: props.height || 20, viewBox: "0 0 24 24",
				fill: props.fill || "none",
				stroke: props.stroke || props.color || "currentColor",
				"stroke-width": props.sw || 2,
				"stroke-linecap": "round", "stroke-linejoin": "round",
				"aria-hidden": "true",
				style: { flex: "none", display: "block" },
			}, props.children);
		}
		var ICONS = {
			check:   [[ "path", { d: "M20 6L9 17l-5-5" } ]],
			cross:   [[ "path", { d: "M18 6L6 18M6 6l12 12" } ]],
			alert:   [[ "path", { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" } ], [ "line", { x1: 12, y1: 9, x2: 12, y2: 13 } ], [ "path", { d: "M12 17h.01" } ]],
			chevUp:  [[ "path", { d: "M18 15l-6-6-6 6" } ]],
			refresh: [[ "path", { d: "M23 4v6h-6" } ], [ "path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" } ]],
			info:    [[ "circle", { cx: 12, cy: 12, r: 10 } ], [ "line", { x1: 12, y1: 16, x2: 12, y2: 12 } ], [ "line", { x1: 12, y1: 8, x2: 12.01, y2: 8 } ]],
			wallet:  [[ "rect", { x: 3, y: 6, width: 18, height: 13, rx: 2 } ], [ "path", { d: "M3 10h18" } ], [ "path", { d: "M16 15h2" } ]],
			chart:   [[ "line", { x1: 4, y1: 20, x2: 4, y2: 12 } ], [ "line", { x1: 10, y1: 20, x2: 10, y2: 6 } ], [ "line", { x1: 16, y1: 20, x2: 16, y2: 14 } ], [ "line", { x1: 21, y1: 20, x2: 21, y2: 10 } ]],
		};
		function Icon(props) {
			var kids = (ICONS[props.name] || []).map(function (k) { return h(k[0], k[1]); });
			return h(Svg, { color: props.color, width: props.width, height: props.height }, kids);
		}

		/* ================= 环形（stroke-dasharray 百分比） ================= */
		function Ring(props) {
			var pct = Math.max(0, Math.min(100, Number(props.percent) || 0));
			var warn = Number(props.threshold) > 0 && pct >= Number(props.threshold);
			var r = props.r || 8.5;
			var c = 2 * Math.PI * r;
			var dash = (pct / 100) * c;
			var color = warn ? C_WARN : (props.color || C_INFO);
			var size = props.size || 20;
			var kids = [
				h("circle", { cx: 12, cy: 12, r: r, fill: "none", stroke: "var(--dsw-alias-border-l2)", "stroke-width": 2 }),
				pct > 0 ? h("circle", {
					cx: 12, cy: 12, r: r, fill: "none", stroke: color, "stroke-width": 2,
					"stroke-linecap": "round", "stroke-dasharray": dash.toFixed(2) + " " + c.toFixed(2),
					transform: "rotate(-90 12 12)",
				}) : null,
			];
			return h(Svg, { width: size, height: size, stroke: "none", sw: 0 }, kids);
		}

		/* ================= 样式（单一 <style>，cd- 前缀，.cd-root 门控） ================= */
		var STYLE = "" +
			/* ---- footer 状态座（.cd-root 是 .footerActions flex row 的直接子项：flex:1 撑满与 Settings 对齐） ---- */
			".cd-root{box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;flex:1 1 auto;min-width:0}" +
			".cd-root *,.cd-root *:before,.cd-root *:after{box-sizing:border-box}" +
			".cd-root button,.cd-root input,.cd-root select,.cd-root textarea{font-family:inherit}" +
			/* 座容器：宽与 Settings 触发按钮对齐（triggerRow = calc(100%+4px), margin 4px -2px） */
			".cd-root .cd-seat{width:calc(100% + 4px);margin:4px -2px;display:flex;flex-direction:column}" +
			/* 折叠 pill（wide） */
			".cd-root .cd-pill{display:flex;align-items:center;gap:8px;width:100%;min-width:0;height:42px;padding:0 10px 0 8px;border:1px solid transparent;border-radius:12px;background:transparent;cursor:pointer;text-align:left}" +
			".cd-root .cd-pill:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
			".cd-root .cd-pill-main{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;line-height:1.25}" +
			".cd-root .cd-pill-title{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".cd-root .cd-pill-ratio{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}" +
			".cd-root .cd-pill-chev{color:var(--dsw-alias-label-tertiary);display:flex}" +
			/* rail 窄态（footArea 居中，36px 圆钮式被动指示） */
			".cd-root .cd-rail{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--dsw-alias-label-secondary)}" +
			/* 展开面板：平滑向上（max-height 过渡 + 内容淡入），盖住上方浏览区 */
			".cd-root .cd-panel{overflow:hidden;transition:max-height 220ms var(--ds-ease-in-out),opacity 180ms var(--ds-ease-in-out)}" +
			".cd-root .cd-panel-inner{display:flex;flex-direction:column;gap:6px;padding:6px 10px 8px 12px}" +
			".cd-root .cd-panel-head{display:flex;align-items:center;gap:6px}" +
			".cd-root .cd-panel-title{flex:1 1 auto;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".cd-root .cd-btn{border:none;background:transparent;padding:2px;border-radius:6px;color:var(--dsw-alias-label-tertiary);cursor:pointer;display:inline-flex}" +
			".cd-root .cd-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}" +
			".cd-root .cd-row{display:flex;align-items:center;gap:6px;min-width:0}" +
			".cd-root .cd-label{flex:1 1 74px;flex:none;width:74px;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".cd-root .cd-value{min-width:0;flex:1 1 auto;font-size:12px;color:var(--dsw-alias-label-primary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}" +
			".cd-root .cd-sub{font-size:10px;color:var(--dsw-alias-label-tertiary)}" +
			".cd-root .cd-badge{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 7px;font-size:10px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:nowrap}" +
			".cd-root .cd-badge .dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}" +
			".cd-root .cd-badge.plan .dot{background:var(--dsw-alias-state-success-primary)}" +
			".cd-root .cd-badge.unknown .dot{background:var(--dsw-alias-label-tertiary)}" +
			".cd-root .cd-bar{flex:1 1 auto;height:4px;border-radius:2px;background:var(--dsw-alias-border-l2);overflow:hidden}" +
			".cd-root .cd-bar-fill{height:100%;border-radius:2px;background:var(--dsw-alias-state-business-primary)}" +
			".cd-root .cd-bar-fill.warn{background:var(--dsw-alias-state-warn-primary)}" +
			".cd-root .cd-empty{color:var(--dsw-alias-label-tertiary);text-align:center;padding:8px 0;font-size:11px}" +
			".cd-root .cd-statusline{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}" +
			".cd-root .cd-notice{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary);min-height:16px}" +
			".cd-root .cd-notice.err{color:var(--dsw-alias-state-error-primary)}" +
			".cd-root .cd-tag{font-size:10px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:5px;padding:0 6px;white-space:nowrap}" +
			/* ---- 设置分区（.cd-section 门控） ---- */
			".cd-section{width:100%;max-width:860px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}" +
			".cd-section *,.cd-section *:before,.cd-section *:after{box-sizing:border-box}" +
			".cd-section .cd-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:12px}" +
			".cd-section .cd-title{margin:0;font-size:18px;font-weight:600}" +
			".cd-section .cd-desc{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary);max-width:600px}" +
			".cd-section .cd-status{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:12px;color:var(--dsw-alias-label-secondary);min-height:20px}" +
			".cd-section .cd-body{display:flex;flex-direction:column;gap:14px}" +
			".cd-section .cd-group{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:12px}" +
			".cd-section .cd-group-title{margin:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.04em}" +
			".cd-section .cd-check{display:flex;align-items:flex-start;gap:9px;font-size:13px;cursor:pointer}" +
			".cd-section .cd-check input[type=checkbox]{width:16px;height:16px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}" +
			".cd-section .cd-check-label{display:flex;flex-direction:column;gap:2px}" +
			".cd-section .cd-fdesc{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}" +
			".cd-section .cd-field{display:flex;flex-direction:column;gap:5px}" +
			".cd-section .cd-flabel{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}" +
			".cd-section .cd-input,.cd-section .cd-select{width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;font-size:13px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}" +
			".cd-section .cd-input:focus,.cd-section .cd-select:focus{outline:none;border-color:var(--dsw-alias-label-secondary)}" +
			".cd-section .cd-number{width:130px}" +
			".cd-section .cd-grid{display:flex;gap:10px;flex-wrap:wrap}" +
			".cd-section .cd-grid .cd-field{flex:1 1 150px;min-width:120px}" +
			".cd-section .cd-savebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}" +
			".cd-section .cd-unsaved{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
			".cd-section .cd-btn2{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}" +
			".cd-section .cd-btn2:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}" +
			".cd-section .cd-btn2:disabled{opacity:.55;cursor:default}" +
			".cd-section .cd-btn2-solid{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}" +
			".cd-section .cd-ovrow{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}" +
			".cd-section .cd-ovrow .cd-field{flex:1 1 90px;min-width:72px}" +
			".cd-section .cd-ovdel{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:6px;border-radius:6px}" +
			".cd-section .cd-ovdel:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}" +
			".cd-section .cd-table{width:100%;border-collapse:collapse;font-size:12px}" +
			".cd-section .cd-table th,.cd-section .cd-table td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}" +
			".cd-section .cd-table td{color:var(--dsw-alias-label-primary)}" +
			".cd-section .cd-table th{color:var(--dsw-alias-label-tertiary);font-weight:500}" +
			".cd-section .cd-note{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.6}" +
			".cd-root .cd-overlay-anchor{position:relative}" +
			"";

		var styleTag = null;
		function injectCss() {
			if (styleTag) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-context-dashboard";
			tag.dataset.pluginCss = "dsh-context-dashboard/ui.css";
			tag.textContent = STYLE;
			document.head.appendChild(tag);
			styleTag = tag;
		}
		function teardownDom() {
			if (styleTag) { try { styleTag.remove(); } catch (e) { /* ignore */ } styleTag = null; }
		}

		/* ================= 定时器封装（§5.5） ================= */
		function makeTimer(ctx2, fn, ms) {
			if (ctx2 && typeof ctx2.timeout === "function") return ctx2.timeout(fn, ms);
			var hh = window.setTimeout(fn, ms);
			return function () { window.clearTimeout(hh); };
		}

		/* ================= 取值/格式化工具（与 host usage.js 对齐） ================= */
		function fmtTokens(n) {
			var v = Number(n) || 0;
			if (v < 1000) return String(Math.round(v));
			if (v < 1e6) { var k = v / 1000; return (k >= 100 ? String(Math.round(k)) : String(Math.round(k * 10) / 10)) + "K"; }
			var m = v / 1e6;
			return (m >= 100 ? String(Math.round(m)) : String(Math.round(m * 10) / 10)) + "M";
		}
		function fmtMoney(v, currency, shorthand) {
			var n = Number(v);
			if (!Number.isFinite(n)) return "–";
			var digits = Math.abs(n) < 0.01 && n !== 0 ? 4 : 2;
			var s = n.toFixed(digits);
			if (shorthand) s = s.replace(/\.?0+$/, "");
			var sym = currency === "CNY" ? "¥" : currency === "USD" ? "$" : currency === "CREDITS" ? "" : "";
			return sym + s + (currency === "CREDITS" ? " cr" : "");
		}
		function ctxText(ctx2) {
			if (!ctx2 || !ctx2.available) return t("noContext");
			var ratio = ctx2.ratio || ("–/–");
			return fmtTokens(ctx2.usedTokens) + "/" + fmtTokens(ctx2.contextWindow);
		}
		function costText(cost, shorthand) {
			if (!cost || cost.amount === null || cost.amount === undefined) return "–";
			return fmtMoney(cost.amount, cost.currency, shorthand)
				+ (cost.fallback ? " " + t("unverified") : "");
		}
		function badgeFor(s) {
			if (!s) return { kind: "unknown", label: t("unknownChannel") };
			if (s.channelKind === "paygo") return { kind: "paygo", label: t("paygo") };
			if (s.channelKind === "plan") return { kind: "plan", label: t("plan") };
			return { kind: "unknown", label: t("unknownChannel") };
		}
		function balanceText(b) {
			if (!b) return { text: t("errUnknown"), avail: false };
			if (!b.available) return { text: t("balanceUnavailable"), avail: false };
			if (b.kind === "paygo" && b.balance && b.balance.available !== undefined) {
				return { text: fmtMoney(b.balance.available, b.balance.currency || b.currency, false), avail: true };
			}
			return { text: t("balanceUnavailable"), avail: false };
		}
		function planRows(s, ctx2, totals, cost, st, b) {
			// token plan 形态（Q1/Q2 口径）
			var rows = [];
			rows.push([t("channel"), channelLabel(s), null]);
			rows.push([t("model"), s && s.model ? s.model : t("errUnknown"), null]);
			if (ctx2 && ctx2.available) rows.push([t("context"), ctxText(ctx2) + " (" + ctx2.percent + "%)", null]);
			rows.push([t("cost"), costText(cost), costTag(cost)]);
			rows.push([t("thisQuota"), totals ? fmt(t("tokens"), { n: fmtTokens(totals.tokensTotal) }) : t("errUnknown"), null]);
			rows.push([t("rolling"), st
				? fmt(t("tokens"), { n: fmtTokens(st.rolling.totalTokens) }) + " · " + (st.rollingLabel || '')
				: t("errUnknown"), null]);
			rows.push([t("weekly"), st && st.week ? fmt(t("tokens"), { n: fmtTokens(st.week.totalTokens) }) + " · " + st.week.key : t("errUnknown"), null]);
			rows.push([t("monthly"), st && st.month ? fmt(t("tokens"), { n: fmtTokens(st.month.totalTokens) }) + " · " + st.month.key : t("errUnknown"), null]);
			// 余额（套餐渠道如有官方配额接口则展示，否则省略）
			return rows;
		}
		function paygoRows(s, ctx2, cost, b) {
			var rows = [];
			rows.push([t("channel"), channelLabel(s), null]);
			rows.push([t("model"), s && s.model ? s.model : t("errUnknown"), null]);
			if (ctx2 && ctx2.available) rows.push([t("context"), ctxText(ctx2) + " (" + ctx2.percent + "%)", null]);
			rows.push([t("cost"), costText(cost), costTag(cost)]);
			var bl = b && b.available && b.balance ? b.balance : null;
			rows.push([t("balance"), bl ? fmtMoney(bl.available, bl.currency || (s && s.channelCurrency), false) : t("balanceUnavailable"), null]);
			return rows;
		}
		function channelLabel(s) {
			if (!s) return t("errUnknown");
			return s.channelDisplay || s.provider || t("errUnknown");
		}
		function costTag(cost) {
			if (!cost || cost.amount === null || cost.amount === undefined) return null;
			// 峰谷档位 + 估算标记（覆盖表口径无档位 → 只显示估算）
			var parts = [];
			if (cost.window === "peak" || cost.window === "offpeak") parts.push(t(cost.window));
			if (cost.fallback) parts.push(t("unverified"));
			return parts.length > 0 ? parts.join(" · ") : null;
		}

		/* ================= footer 状态座组件 ================= */
		function FooterSeat(props) {
			var ctx2 = props.ctx;
			var wide = props.wide !== false;
			var cfg = props.config;
			var status = props.status;
			var s = status && status.session ? status.session : null;
			var ctx3 = status ? status.context : null;
			var totals = status ? status.sessionTotals : null;
			var cost = status ? status.cost : null;
			var st = status ? status.planStats : null;
			var bal = (status && status.balances && s && status.balances[s.provider]) ? status.balances[s.provider] : null;
			var shorthand = cfg ? !!(cfg.display && cfg.display.shorthand) : true;
			var threshold = cfg ? (cfg.threshold || 80) : 80;
			var kind = badgeFor(s).kind;

			// rail 窄态：仅被动环（Q4）
			if (!wide) {
				if (!cfg || !cfg.ui || !cfg.ui.railRing) return null;
				var railPct = ctx3 && ctx3.available ? ctx3.percent : 0;
				return h("div", { className: "cd-root", "data-dsh-cd": "rail", title: ctxText(ctx3) },
					h("div", { className: "cd-rail" },
						h(Ring, { percent: railPct, threshold: threshold, size: 22, r: 8.5 })));
			}

			// wide：pill ↔ 面板
			var expanded = props.expanded;
			var setExpanded = props.setExpanded;
			var pillTitle = kind === "plan" ? t("seatTitle") + " · " + t("plan") : t("seatTitle");
			var ring = h(Ring, { percent: ctx3 && ctx3.available ? ctx3.percent : 0, threshold: threshold, size: 16 });
			var pill = h("button", {
				type: "button",
				className: "cd-pill",
				"aria-expanded": !!expanded,
				title: expanded ? t("foldHide") : t("foldShow"),
				onClick: function () { setExpanded(!expanded); },
			},
				ring,
				h("span", { className: "cd-pill-main" },
					h("span", { className: "cd-pill-title" }, pillTitle),
					h("span", { className: "cd-pill-ratio" }, ctxText(ctx3))),
				h("span", { className: "cd-pill-chev", "aria-hidden": "true" },
					h(Icon, { name: "chevUp", color: C_NEUTRAL, width: 14, height: 14 })));

			var panel = null;
			if (expanded) {
				var rows = [];
				if (s && s.channelKind === "plan") rows = planRows(s, ctx3, totals, cost, st, bal);
				else if (s && s.channelKind === "paygo") rows = paygoRows(s, ctx3, cost, bal);
				else {
					rows = [
						[t("channel"), s ? channelLabel(s) : t("errUnknown"), null],
						[t("model"), s && s.model ? s.model : t("errUnknown"), null],
					];
				}
				var badge = badgeFor(s);
				var refreshBusy = props.refreshing;
				var rowEls = rows.length === 0
					? h("div", { className: "cd-empty" }, t("noSession"))
					: rows.map(function (r, i) {
						return h("div", { className: "cd-row", key: "r" + i },
							h("span", { className: "cd-label" }, r[0]),
							h("span", { className: "cd-value" }, r[1]),
							r[2] ? h("span", { className: "cd-tag" }, r[2]) : null);
					});
				// 上下文条
				var barEl = (ctx3 && ctx3.available)
					? h("div", { className: "cd-row" },
						h("span", { className: "cd-label" }, t("context")),
						h("div", { className: "cd-bar" }, h("div", {
							className: "cd-bar-fill" + (ctx3.percent >= threshold ? " warn" : ""),
							style: { width: Math.max(2, ctx3.percent) + "%" },
						})),
						h("span", { className: "cd-sub" }, ctx3.percent + "%"))
					: null;
				// 刷新只对「按量渠道」有意义（余额/配额来自官方接口）；套餐用量走 2s 轮询
				var canRefresh = !!s && s.channelKind === "paygo" && cfg && cfg.balance && cfg.balance.enabled !== false;
				var refreshBtn = canRefresh
					? h("button", {
						type: "button", className: "cd-btn", title: t("refresh"), "aria-label": t("refresh"),
						disabled: refreshBusy,
						onClick: props.onRefresh,
					}, h(Icon, { name: "refresh", color: refreshBusy ? C_NEUTRAL : undefined }))
					: null;
				var noticeEl = props.notice
					? h("div", { className: "cd-notice", role: "status", "aria-live": "polite" },
						h(Icon, { name: props.notice.err ? "alert" : "check", color: props.notice.err ? C_ERR : C_OK }),
						h("span", null, props.notice.msg))
					: null;
				panel = h("div", { className: "cd-panel" },
					h("div", { className: "cd-panel-inner" },
						h("div", { className: "cd-panel-head" },
							h("span", { className: "cd-badge " + (badge.kind || "unknown") },
								h("span", { className: "dot" }),
								h("span", null, badge.label)),
							h("span", { className: "cd-panel-title" }, t("appName")),
							refreshBtn),
						noticeEl,
						barEl,
						rowEls));
			}

			return h("div", { className: "cd-root", "data-dsh-cd": "seat" },
				h("div", { className: "cd-seat" }, pill, panel));
		}

		/* ================= settings 分区组件 ================= */
		/* 骨架仅承载文案与表单结构；详情见 SettingsPane。 */
		function SettingsSection(props) {
			var ctx2 = props.ctx;
			var t0 = props.t;
			var cfgS = React.useState(null);
			var cfgD = cfgS[0]; var setCfgD = cfgS[1];
			var channelsS = React.useState({});
			var channels = channelsS[0]; var setChannels = channelsS[1];
			var catS = React.useState([]);
			var cat = catS[0]; var setCat = catS[1];
			var dirtyS = React.useState(false);
			var dirty = dirtyS[0]; var setDirty = dirtyS[1];
			var savingS = React.useState(false);
			var saving = savingS[0]; var setSaving = savingS[1];
			var toastS = React.useState(null);
			var toast = toastS[0]; var setToast = toastS[1];
			var aliveRef = React.useRef(true);

			function load() {
				apiGet(API.config).then(function (res) {
					if (!aliveRef.current) return;
					if (res && res.ok) {
						if (typeof res.csrf === "string" && res.csrf) csrfToken = res.csrf;
						if (res.config) setCfgD(res.config);
						if (res.channels) setChannels(res.channels);
						if (res.catalog) setCat(res.catalog);
						setDirty(false);
					} else {
						setToast({ msg: t0("cfgLoadFailed"), err: true });
					}
				});
			}
			React.useEffect(function () {
				load();
				return function () { aliveRef.current = false; };
			}, []);

			// §5.3 Hooks 铁律：一切 Hook 必须在任何条件返回之前全部执行，
			// 否则异步 load() 落地后重渲染 Hook 数量变化，React 抛
			// "Rendered more hooks than during the previous render" 并整段崩空。
			function patch(next) {
				setCfgD(Object.assign({}, cfgD, next));
				setDirty(true);
			}
			function save() {
				setSaving(true);
				apiPost(API.config, { config: cfgD }).then(function (res) {
					setSaving(false);
					if (res && res.ok && res.config) {
						setCfgD(res.config);
						setDirty(false);
						flashToast(t0("cfgSaved"), false);
					} else {
						flashToast(t0("cfgSaveFail"), true);
					}
				});
			}
			function flashToast(msg, isErr) {
				setToast({ msg: msg, err: isErr });
				// 重置计时（§8.7 错误5s/成功3s）
			}
			React.useEffect(function () {
				if (!toast) return;
				var disp = makeTimer(ctx2, function () { setToast(null); }, toast.err ? 5000 : 3000);
				return function () { try { disp(); } catch (e) { /* ignore */ } };
			}, [toast]);

			/* 单价覆盖：局部编辑器状态（渠道/模型选择 + 四价）——Hook 须先于条件返回 */
			var addS = React.useState({ channel: "", model: "", input: "", cacheRead: "", output: "" });
			var add = addS[0]; var setAdd = addS[1];

			if (!cfgD) {
				return h("div", { className: "cd-section" },
					h("div", { className: "cd-status", role: "status" },
						h(Icon, { name: "alert", color: C_ERR }),
						h("span", null, t0("cfgLoadFailed"))));
			}
			if (!add.channel) add = Object.assign({}, add, { channel: Object.keys(channels || {})[0] || "" });

			var ui = cfgD.ui || {};
			var balance = cfgD.balance || {};
			var display = cfgD.display || {};
			var stats = cfgD.stats || {};
			var ov = cfgD.priceOverrides || {};

			function ovValue(key, f) {
				var o = ov[key];
				if (!o) return "";
				var v = o[f];
				return v === undefined ? "" : String(v);
			}
			function setOv(key, f, val) {
				var next = Object.assign({}, ov);
				var o = Object.assign({}, next[key] || {});
				var n = Number(val);
				o[f] = (val === "" || !Number.isFinite(n) || n < 0) ? (val === "" ? undefined : o[f]) : n;
				next[key] = o;
				patch({ priceOverrides: next });
			}
			function delOv(key) {
				var next = Object.assign({}, ov);
				delete next[key];
				patch({ priceOverrides: next });
			}
			function addOv() {
				if (!add.model) return;
				var key = add.channel + "/" + add.model;
				var next = Object.assign({}, ov);
				var num0 = function (s) { var n = Number(s); return (s !== "" && Number.isFinite(n) && n >= 0) ? n : undefined; };
				next[key] = {
					input: num0(add.input),
					cacheRead: num0(add.cacheRead),
					output: num0(add.output),
				};
				patch({ priceOverrides: next });
				setAdd({ channel: add.channel, model: "", input: "", cacheRead: "", output: "" });
			}

			/* ---- 折叠默认态 + 记忆 / rail 开关 ---- */
			var groupUi = h("div", { className: "cd-group" },
				h("h3", { className: "cd-group-title" }, t0("cfgTab")),
				h("label", { className: "cd-check" },
					h("input", { type: "checkbox", checked: !!ui.defaultCollapsed, onChange: function (e) { patch({ ui: Object.assign({}, ui, { defaultCollapsed: e.target.checked }) }); } }),
					h("span", { className: "cd-check-label" }, h("span", null, t0("cfgDefaultCollapsed")), h("span", { className: "cd-fdesc" }, t0("cfgDefaultCollapsedDesc")))),
				h("label", { className: "cd-check" },
					h("input", { type: "checkbox", checked: !!ui.rememberFold, onChange: function (e) { patch({ ui: Object.assign({}, ui, { rememberFold: e.target.checked }) }); } }),
					h("span", { className: "cd-check-label" }, h("span", null, t0("cfgRememberFold")), h("span", { className: "cd-fdesc" }, t0("cfgRememberFoldDesc")))),
				h("label", { className: "cd-check" },
					h("input", { type: "checkbox", checked: !!ui.railRing, onChange: function (e) { patch({ ui: Object.assign({}, ui, { railRing: e.target.checked }) }); } }),
					h("span", { className: "cd-check-label" }, h("span", null, t0("cfgRailRing")), h("span", { className: "cd-fdesc" }, t0("cfgRailRingDesc")))));

			/* ---- 余额 + key env ---- */
			var balFields = Object.keys(channels || {}).map(function (ch) {
				var k = (balance.keys && balance.keys[ch]) || {};
				return h("div", { className: "cd-field", key: ch },
					h("span", { className: "cd-flabel" }, ch + " (" + (channels[ch] && channels[ch].kind) + ")"),
					h("input", {
						className: "cd-input", type: "text", value: k.envName || "",
						placeholder: "ENV_VAR_NAME",
						"aria-label": t0("cfgKeySource"),
						onChange: function (e) {
							var keys = Object.assign({}, balance.keys || {});
							keys[ch] = { mode: "env", envName: e.target.value };
							patch({ balance: Object.assign({}, balance, { keys: keys }) });
						},
					}));
			});
			var groupBal = h("div", { className: "cd-group" },
				h("h3", { className: "cd-group-title" }, t0("cfgBalance")),
				h("p", { className: "cd-fdesc" }, t0("cfgBalanceDesc")),
				h("label", { className: "cd-check" },
					h("input", { type: "checkbox", checked: !!balance.enabled, onChange: function (e) { patch({ balance: Object.assign({}, balance, { enabled: e.target.checked }) }); } }),
					h("span", { className: "cd-check-label" }, h("span", null, t0("cfgBalance")), h("span", { className: "cd-fdesc" }, t0("cfgKeySourceDesc")))),
				h("div", { className: "cd-body", style: { gap: "8px" } }, balFields));

			/* ---- 单价覆盖表 ---- */
			var ovRows = Object.keys(ov).map(function (key) {
				return h("div", { className: "cd-ovrow", key: key },
					h("div", { className: "cd-field" },
						h("span", { className: "cd-flabel" }, key),
						h("span", { className: "cd-fdesc" }, "input / cache-hit / output (per 1M)")),
					h("div", { className: "cd-field" }, h("input", { className: "cd-input cd-number", type: "number", min: "0", step: "0.001", value: ovValue(key, "input"), onChange: function (e) { setOv(key, "input", e.target.value); } })),
					h("div", { className: "cd-field" }, h("input", { className: "cd-input cd-number", type: "number", min: "0", step: "0.001", value: ovValue(key, "cacheRead"), onChange: function (e) { setOv(key, "cacheRead", e.target.value); } })),
					h("div", { className: "cd-field" }, h("input", { className: "cd-input cd-number", type: "number", min: "0", step: "0.001", value: ovValue(key, "output"), onChange: function (e) { setOv(key, "output", e.target.value); } })),
					h("button", { type: "button", className: "cd-ovdel", title: t0("delOv"), onClick: function () { delOv(key); } },
						h(Icon, { name: "cross", width: 14, height: 14 })));
			});
			var modelOptions = (cat || []).filter(function (r) { return !add.channel || r.channel === add.channel; })
				.map(function (r) { return h("option", { key: r.channel + "/" + r.model, value: r.model }, r.model); });
			var addRow = h("div", { className: "cd-ovrow" },
				h("div", { className: "cd-field" },
					h("select", { className: "cd-select", value: add.channel, onChange: function (e) { setAdd(Object.assign({}, add, { channel: e.target.value, model: "" })); } },
						Object.keys(channels || {}).map(function (ch) { return h("option", { key: ch, value: ch }, ch); }))),
				h("div", { className: "cd-field" },
					h("select", { className: "cd-select", value: add.model, onChange: function (e) { setAdd(Object.assign({}, add, { model: e.target.value })); } }, modelOptions)),
				h("div", { className: "cd-field" }, h("input", { className: "cd-input cd-number", type: "number", min: "0", step: "0.001", placeholder: t0("catIn"), value: add.input, onChange: function (e) { setAdd(Object.assign({}, add, { input: e.target.value })); } })),
				h("div", { className: "cd-field" }, h("input", { className: "cd-input cd-number", type: "number", min: "0", step: "0.001", placeholder: t0("catHit"), value: add.cacheRead, onChange: function (e) { setAdd(Object.assign({}, add, { cacheRead: e.target.value })); } })),
				h("div", { className: "cd-field" }, h("input", { className: "cd-input cd-number", type: "number", min: "0", step: "0.001", placeholder: t0("catOut"), value: add.output, onChange: function (e) { setAdd(Object.assign({}, add, { output: e.target.value })); } })),
				h("button", { type: "button", className: "cd-btn2 cd-btn2-solid", disabled: !add.model, onClick: addOv }, t0("cfgAddOverride")));

			/* ---- 展示：货币 + 简写 ---- */
			var groupDisp = h("div", { className: "cd-group" },
				h("h3", { className: "cd-group-title" }, t0("cfgCurrency")),
				h("div", { className: "cd-grid" },
					h("div", { className: "cd-field" },
						h("select", { className: "cd-select", value: display.currency || "auto", onChange: function (e) { patch({ display: Object.assign({}, display, { currency: e.target.value }) }); } },
							h("option", { value: "auto" }, t0("cfgCurrencyAuto")),
							h("option", { value: "CNY" }, "CNY (¥)"),
							h("option", { value: "USD" }, "USD ($)"),
							h("option", { value: "CREDITS" }, "CREDITS"))),
					h("label", { className: "cd-check" },
						h("input", { type: "checkbox", checked: !!display.shorthand, onChange: function (e) { patch({ display: Object.assign({}, display, { shorthand: e.target.checked }) }); } }),
						h("span", { className: "cd-check-label" }, h("span", null, t0("cfgShorthand")), h("span", { className: "cd-fdesc" }, t0("cfgShorthandDesc"))))));

			/* ---- 统计窗口与聚合范围 + 阈值 ---- */
			var groupStats = h("div", { className: "cd-group" },
				h("h3", { className: "cd-group-title" }, t0("cfgWindow")),
				h("p", { className: "cd-fdesc" }, t0("cfgWindowDesc")),
				h("div", { className: "cd-grid" },
					h("div", { className: "cd-field" },
						h("span", { className: "cd-flabel" }, t0("cfgWeekMonth")),
						h("select", { className: "cd-select", value: stats.windowType || "month", onChange: function (e) { patch({ stats: Object.assign({}, stats, { windowType: e.target.value }) }); } },
							h("option", { value: "week" }, t0("weekly")),
							h("option", { value: "month" }, t0("monthly")))),
					h("div", { className: "cd-field" },
						h("span", { className: "cd-flabel" }, t0("cfgRollingHours")),
						h("input", { className: "cd-input cd-number", type: "number", min: "1", max: "168", value: stats.rollingHours, onChange: function (e) { patch({ stats: Object.assign({}, stats, { rollingHours: Number(e.target.value) }) }); } })),
					h("div", { className: "cd-field" },
						h("span", { className: "cd-flabel" }, t0("cfgThreshold") + " (%)"),
						h("input", { className: "cd-input cd-number", type: "number", min: "1", max: "100", value: cfgD.threshold, onChange: function (e) { patch({ threshold: Number(e.target.value) }); } }))),
				h("label", { className: "cd-check" },
					h("input", { type: "checkbox", checked: !!stats.includeChildren, onChange: function (e) { patch({ stats: Object.assign({}, stats, { includeChildren: e.target.checked }) }); } }),
					h("span", { className: "cd-check-label" }, h("span", null, t0("cfgIncludeChildren")), h("span", { className: "cd-fdesc" }, t0("cfgIncludeChildrenDesc")))));

			/* ---- 目录只读表 ---- */
			var catRows = (cat || []).map(function (r) {
				return h("tr", { key: r.channel + "/" + r.model },
					h("td", null, r.channel),
					h("td", null, r.model),
					h("td", null, String(r.rates.input)),
					h("td", null, String(r.rates.cacheRead)),
					h("td", null, String(r.rates.output)),
					h("td", null, r.currency),
					h("td", null, r.verified ? t0("verified") : t0("unverified")));
			});
			var groupCat = h("div", { className: "cd-group" },
				h("h3", { className: "cd-group-title" }, t0("catalogHint")),
				h("table", { className: "cd-table" },
					h("thead", null, h("tr", null,
						h("th", null, t0("colChannel")), h("th", null, t0("catModel")),
						h("th", null, t0("catIn")), h("th", null, t0("catHit")), h("th", null, t0("catOut")),
						h("th", null, t0("catCurrency")), h("th", null, t0("catStatus")))),
					h("tbody", null, catRows)));

			var toastEl = toast
				? h("div", { className: "cd-status", role: "status", "aria-live": "polite" },
					h(Icon, { name: toast.err ? "cross" : "check", color: toast.err ? C_ERR : C_OK }),
					h("span", null, toast.msg))
				: null;

			return h("div", { className: "cd-section" },
				h("div", { className: "cd-head" },
					h("div", { style: { minWidth: "0" } },
						h("h2", { className: "cd-title" }, t0("appName")),
						h("p", { className: "cd-desc" }, t0("cfgTab"))),
					h("div", { className: "cd-savebar" },
						dirty ? h("span", { className: "cd-unsaved" }, t0("cfgUnsaved")) : null,
						h("button", { type: "button", className: "cd-btn2 cd-btn2-solid", disabled: saving || !dirty, onClick: save },
							saving ? t0("cfgSaving") : t0("cfgSave")))),
				toastEl,
				h("div", { className: "cd-body" },
					groupUi,
					groupBal,
					h("div", { className: "cd-group" },
						h("h3", { className: "cd-group-title" }, t0("cfgOverrides")),
						h("p", { className: "cd-fdesc" }, t0("cfgOverridesDesc")),
						ovRows.length === 0 ? h("p", { className: "cd-fdesc" }, t0("cfgOverrideEmpty")) : null,
						h("div", { className: "cd-body", style: { gap: "8px" } }, ovRows),
						addRow),
					groupDisp,
					groupStats,
					groupCat));
		}

		/* ================= 插件入口 ================= */
		exports.name = "dsh-context-dashboard";
		exports.inject = ["slots", "timer"];

		exports.apply = function apply(ctx) {
			injectCss();
			// 折叠态：组件级状态（wide seat 内部）。跨 footer 重挂时由 config 默认/记忆驱动。
			var foldStateRef = { collapsed: null }; // null=未初始化

			ctx.effect(function () {
				var slots = ctx.get("slots");
				if (slots === undefined) return function () { teardownDom(); };

				/* ---- footer 状态座 ---- */
				var offFoot = slots.inject("sidebar.footer.action", function () {
					return slots.register(
						{ name: "sidebar.footer.action", id: "dsh-context-dashboard", order: 0, label: function () { return t("appName"); } },
						function (seatProps) {
							return h(DashboardHost, { ctx: ctx, seatProps: seatProps || {} });
						});
				});

				/* ---- settings 分区 ---- */
				var offSettings = slots.inject("settings.section", function () {
					return slots.register(
						{
							name: "settings.section",
							id: "dsh-context-dashboard",
							order: 60,
							label: function () { return isZh() ? "上下文仪表盘" : "Context Dashboard"; },
						},
						function () { return h(SettingsSection, { ctx: ctx, t: t }); });
				});

				return function () {
					try { if (offFoot) offFoot(); } catch (e) { /* ignore */ }
					try { if (offSettings) offSettings(); } catch (e) { /* ignore */ }
					teardownDom();
				};
			}, "dsh-context-dashboard: UI");

			// 预取配置拿 CSRF
			apiGet(API.config).then(function (res) {
				if (res && res.ok && typeof res.csrf === "string" && res.csrf) csrfToken = res.csrf;
			});
		};

		/* footer 宿主：拉 config/status，轮询，管理折叠态 */
		function DashboardHost(props) {
			var ctx2 = props.ctx;
			var seatProps = props.seatProps;
			var wide = seatProps.wide !== false;
			var sConfig = React.useState(null);
			var config = sConfig[0]; var setConfig = sConfig[1];
			var sStatus = React.useState(null);
			var status = sStatus[0]; var setStatus = sStatus[1];
			var sExpanded = React.useState(false);
			var expanded = sExpanded[0]; var setExpanded = sExpanded[1];
			var sRefreshing = React.useState(false);
			var refreshing = sRefreshing[0]; var setRefreshing = sRefreshing[1];
			var sNotice = React.useState(null);
			var notice = sNotice[0]; var setNotice = sNotice[1];
			var noticeTimerRef = React.useRef(null);
			var aliveRef = React.useRef(true);

			// §8.7：错误 5s / 成功 3s；新消息重置计时
			function flashNotice(msg, isErr) {
				setNotice({ msg: msg, err: !!isErr });
				if (noticeTimerRef.current) { try { noticeTimerRef.current(); } catch (e) { /* ignore */ } }
				noticeTimerRef.current = makeTimer(ctx2, function () {
					noticeTimerRef.current = null;
					if (aliveRef.current) setNotice(null);
				}, isErr ? 5000 : 3000);
			}

			function poll() {
				apiGet(API.config).then(function (res) {
					if (!aliveRef.current || !res || !res.ok) return;
					if (typeof res.csrf === "string" && res.csrf) csrfToken = res.csrf;
					var cfgNext = res.config;
					setConfig(cfgNext);
					if (foldStateRef.collapsed === null) {
						// 首次：按 记忆 > 默认折叠 决定初始态
						var ui = cfgNext.ui || {};
						var persisted = res.fold && typeof res.fold.collapsed === "boolean" ? res.fold.collapsed : undefined;
						var initialCollapsed = ui.rememberFold
							? (persisted !== undefined ? persisted : !!ui.defaultCollapsed)
							: !!ui.defaultCollapsed;
						foldStateRef.collapsed = initialCollapsed;
						setExpanded(!initialCollapsed);
					}
				});
				// 把 UI 的「当前会话」带给 host（authoritative）：它知道自己选中的会话，
				// 即使该会话在本进程内还没发过任何 session/event（启动即知 current、
				// 手动切换即时刷新两个诉求都靠它）。读不到 sessions 服务则回退 host 的 lastActiveId。
				var hint = "";
				try {
					var sessionsSvc = ctx2 && typeof ctx2.get === "function" ? ctx2.get("sessions") : undefined;
					var list = sessionsSvc && sessionsSvc.list ? sessionsSvc.list : null;
					var current = list && typeof list.getSnapshot === "function" ? list.getSnapshot().current : undefined;
					if (typeof current === "string" && current.length > 0) hint = "?session=" + encodeURIComponent(current);
				} catch (e) { /* ignore */ }
				apiGet(API.status + hint).then(function (res) {
					if (!aliveRef.current) return;
					if (res && res.ok) setStatus(res);
				});
			}
			React.useEffect(function () {
				poll();
				var timer = null;
				var tick = function () {
					timer = makeTimer(ctx2, function () { poll(); tick(); }, 2000);
				};
				tick();
				return function () {
					aliveRef.current = false;
					if (timer) { try { timer(); } catch (e) { /* ignore */ } }
					if (noticeTimerRef.current) { try { noticeTimerRef.current(); } catch (e) { /* ignore */ } noticeTimerRef.current = null; }
				};
			}, []);

			function toggleExpand() {
				var next = !expanded;
				setExpanded(next);
				foldStateRef.collapsed = !next;
				// 记忆（§5.6 防抖由调用方节流；此处低频无需）
				apiPost(API.fold, { collapsed: !next });
			}
			function doRefresh() {
				if (refreshing) return;
				setRefreshing(true);
				apiPost(API.refresh, {}).then(function (res) {
					setRefreshing(false);
					if (!aliveRef.current) return;
					if (res && res.ok && res.balances) {
						// 当前渠道余额状态 → 针对性反馈
						var prov = status && status.session ? status.session.provider : null;
						var b = prov ? res.balances[prov] : null;
						if (b && !b.available) {
							var reasonKey = b.reason === 'no-balance-api' ? 'balNoApi'
								: (b.reason === 'no-key' ? 'balNoKey' : null);
							flashNotice(reasonKey ? t(reasonKey) : t('refreshFail'), true);
						} else {
							flashNotice(t('refreshDone'), false);
						}
						apiGet(API.status).then(function (s2) { if (aliveRef.current && s2 && s2.ok) setStatus(s2); });
					} else {
						flashNotice((res && res.message) || t('refreshFail'), true);
					}
				}).catch(function () {
					if (!aliveRef.current) return;
					setRefreshing(false);
					flashNotice(t('refreshFail'), true);
				});
			}

			return h(FooterSeat, {
				ctx: ctx2,
				wide: wide,
				config: config,
				status: status,
				expanded: expanded,
				setExpanded: toggleExpand,
				refreshing: refreshing,
				onRefresh: doRefresh,
				notice: notice,
			});
		}

		return module.exports;
	}
});
