# §12 验收清单（交付时逐条填写）

> 依据 PLUGIN-STANDARD.md 第 12 章。交付方式（Q9 定稿）：**工作区交付，真机安装与
> 验证由使用者执行**。故：纯代码/静态项已核 ✅；需要挂载到 profile 真机验证的项标
> 「待装验」，由使用者装后勾选并把结果回填。

| # | 条款 | 强度 | 通过? |
|---|------|------|-------|
| 1 | §2.1 五处命名一致（dsh-context-dashboard ×5） | 必须 | ✅（目录/package/patch id/name/storages 子目录名一致） |
| 2 | §3.1 exports 导出 ./package.json | 必须 | ✅ |
| 3 | §3.3 private=false | 必须 | ✅ |
| 4 | §3.4/3.5 dsh.bundle/client 声明齐全（platform web + inject runtime/locale） | 必须 | ✅ |
| 5 | §4.4 git 依赖锁 40 位 commit | 必须 | ✅（无 git 依赖，N/A） |
| 6 | §5.1 host/client 仅经 HTTP JSON 通信 | 必须 | ✅（client 仅 fetch /dsh-context-dashboard/*） |
| 7 | §5.2 host 半注入 webServer 且服务缺失静默退场 | 必须 | ✅（代码路径；真机见 27） |
| 8 | §5.3 client 半 __ModuleLoader__ 且无 JSX/import | 必须 | ✅（纯 JS + React.createElement，node --check 过） |
| 9 | §5.4 所有资源走 ctx.effect disposer | 必须 | ✅（路由/事件/UI 均 effect；node --check 过） |
| 10 | §5.5 定时器首选 ctx.timeout | 必须 | ✅（client 轮询用 ctx.timeout；host 无业务定时器） |
| 11 | §6.1 数据仅落 $DSH_HOME/storages/<id>/ | 必须 | ✅（storage.js 全部写入该目录） |
| 12 | §7.1 README 含权限与影响声明 | 必须 | ✅ |
| 13 | §7.2/7.3 回环门槛 + 写端点同源+CSRF+限流 | 必须 | ✅（httpkit；真机见 27） |
| 14 | §7.4/7.5 输入白名单 + 请求体上限 | 必须 | ✅（cleanText/sanitize* + readBody 上限） |
| 15 | §7.6（外联）SSRF 防护全套 | 必须 | ✅（仅白名单域 https + host 精确 + manual redirect + 超时/大小上限；真机外联 PENDING） |
| 16 | §7.7 错误泛化 | 必须 | ✅ |
| 17 | §7.8 用户内容仅 textContent 入 DOM | 必须 | ✅（React 文本节点，无 innerHTML） |
| 18 | §8.1 颜色全走 --dsw-* token，无写死 | 必须 | ✅（client 全 token；真机视觉见 27） |
| 19 | §8.2 专属前缀类 + 根类门控可回滚 | 必须 | ✅（.cd-root/.cd-section 门控 + 单 style 移除） |
| 20 | §8.4 图标全内联 SVG 20×20，无 emoji 图标 | 必须 | ✅ |
| 21 | §8.5 文字仅白黑灰，颜色只在图标/按钮背景边框 | 必须 | ✅ |
| 22 | §8.7 错误提示 3–5s（成功约 3s） | 必须 | ✅（错误 5s/成功 3s 实现；设置页 toast 用时序 effect） |
| 23 | §9.2 版本三处一致 | 必须 | ✅（package.json 0.3.0 = README = CHANGELOG） |
| 24 | §10.1 README 固定章节序 | 必须 | ✅ |
| 25 | §10.4 CHANGELOG 规范 | 必须 | ✅ |
| 26 | §11.1 停用/卸载运行时回滚 | 必须 | 待装验（disposer 路径已实现） |
| 27 | §12.1 五项最低验证（加载无报错/重复路由、真机功能、可逆、写端点鉴权实测） | 必须 | 待装验（使用者执行；node --check、20 例单测与 11 例 host 集成测试已在工作区通过） |
| 28 | §13.1 发布仓库打 dsh-plugin topic | 必须 | ✅（0.2.0 发布时已打） |
| — | §5.6/§8.3/§9.4 等「应当」项 | 应当 | ☐ 附理由：§5.6 高频写仅 fold 记忆低频，无需额外防抖；§8.3 控件限于开关/输入/按钮族；§9.4 装机后记一条兼容性结论于 CHANGELOG |

## 工作区已执行验证

- `node --check`：lib/index.js、lib/client.js、lib/httpkit.js、lib/usage.js、lib/pricing.js、lib/storage.js 全部通过（零语法错）。
- 单测：`tests/unit.test.mjs` 20/20 通过（buckets/费用/窗口/简写/计价/峰谷/渠道识别）。
- host 集成测试：`tests/host.integration.test.mjs` 11/11 通过（路由鉴权/聚合/上下文口径/余额/动态渠道）。
- （沙箱内 `node --test` 子进程受限，改以 `node tests/unit.test.mjs` 同进程直跑。）
