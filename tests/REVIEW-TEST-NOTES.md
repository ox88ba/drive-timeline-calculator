# 移动质量回归基线交接

基线完成：16 项，3 PASS、13 FAIL、0 ERROR。产品源文件未改；当前仅新增本文件。暂不对实施中的新代码运行验收，等待根任务通知。

## 原脚本及报告绝对路径

- 测试脚本：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/mobile-regression.cjs`
- 机器结果：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/baseline-results.json`
- 执行说明：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/README.md`
- 冻结基线副本：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/work/baseline-source`

冻结基线 SHA-256：

- app.js: `e5b95e99a9ef84768e5c285a72d9daf79985c65f4d124da5299e46ce51dd8e24`
- tripkit.js: `29b521350b7e4a8d7a2768391457f47527445b624a34da0bbc333c8a77544fc1`
- scenic-ai.js: `0b3e3d7b6803f1a089168e2b84fb91b996fa5c0fbb8bcca7cd02adf0fc4e55c8`

## 已实测结果

| 测试 | 基线 |
|---|---|
| route/stale-success：A旧成功不能覆盖B新路线 | FAIL |
| route/stale-failure：A旧失败不能清掉B新路线 | FAIL |
| search/uncommitted-edit-preserves-trip：确认候选前保留已提交地点/路线 | FAIL |
| search/stale-error-does-not-replace-new-results：旧错误不覆盖新候选 | FAIL |
| search/late-result-after-clear-remains-hidden：清空后旧错误不重开列表 | FAIL |
| share/cold-open-preserves-draft：分享冷启动不覆盖草稿 | FAIL |
| share/hashchange-preserves-draft：已有标签页打开分享不覆盖草稿 | FAIL |
| storage/snapshot-failure-no-success：写入失败不能提示保存成功 | FAIL |
| ai/close-prevents-late-cache-write：关闭后旧AI结果不能回写 | PASS |
| ai/closed-stays-closed-after-reload：关闭后刷新不自动再请求 | FAIL |
| ai/close-removes-queued-job：关闭排队项后不发送 | FAIL |
| modal/refresh-focus-contained-and-restored：刷新弹窗焦点隔离 | FAIL |
| input/elevation-completion-keeps-focus：海拔完成不使输入失焦 | FAIL |
| control/search-selection-commits-new-location：正常候选选择提交 | PASS |
| control/snapshot-success-actually-persists：正常保存实际写入 | PASS |
| modal/share-focus-contained-and-restored：分享弹窗焦点隔离 | FAIL |

导航竞态通过真实页面交互复现：挂起A请求→搜索选择B→B先返回999秒→A最后返回111秒或500错误。基线分别把B改为111秒或清空路线。未修改/注入产品函数。

## 修复后执行命令（等待根任务通知）

```sh
/Users/wangxingyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/mobile-regression.cjs --source /Users/wangxingyu/Documents/Codex/2026-09-08/h5-h5-2026-9-30-18/outputs/github-pages-release --out /Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-results.json
```

退出码 0=通过，1=验收断言失败，2=框架/选择器/等待错误。每次运行先把源文件读入内存，报告记录完整SHA-256，避免实施中混合版本。当前环境 Chrome 需要沙箱外启动许可，使用新临时 profile，不连接用户会话。

## 隔离与证据边界

- 桌面Chrome，390×844 mobile/touch上下文，非iPhone/Safari真机。
- 每例新上下文与合成行程；页面请求全部本地响应或abort；无route.continue/fallback；Service Worker禁用；AI/导航均为假服务，未操作用户行程。
- CDN字体、html2canvas、人机验证、地图SDK阻断；不据此声称导出、地图、字体或真机通过。
- 弹窗初始焦点断言失败后，后续Tab/归还焦点步骤未执行，不能算通过。
- 分享两例目前只断言不覆盖草稿；新预览上线需补充显示分享内容、只读、复制为新方案、关闭恢复，不能靠忽略链接获得完整验收。
- 新搜索交互需补取消、blur/Esc、中文composition与起点搜索。UI更名/菜单收纳引起选择器变化应修测试定位，不放宽业务断言。
- AI排队观察覆盖基线1200ms间隔（等待1550ms）；新调度变化时需更新观察窗口，不能将延迟误算取消。
- 真机待验：390/393为主、375/430补充，中文键盘、200%文字、VoiceOver、安全区、30/60站性能、长图分图保存。

## 新实现第一轮验收（2026-09-25，进行中）

结果文件：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-round1.json`。

22项：20 PASS、1 FAIL、1操作超时待诊断。原16项业务回归全部通过（已适配阅读态、按需AI按钮）。新增首次无AI请求、共享保存副本/退出恢复、12份上限均通过。

**优先反馈：取消修改按钮被候选列表遮挡。** `search/cancel-restores-committed-location` 定位到可见可用 `.poi-cancel`，但真实click持续被 `.poi-results .poi-option`/候选 `<b>` 拦截，4秒超时。复现：390宽→点击地点名称→输入“未提交修改”→点击“取消修改”。日志明确是遮挡，不是元素找不到。正在补命中测试，未使用force点击绕过。建议取消按钮移出绝对定位候选覆盖范围，或调整布局给取消独立一行。

**共享只读未全覆盖：** `.shell` 中 `#tfWhatifRange` 在预览状态仍enabled（其他shell按钮输入均disabled）。尚未声称它已覆盖草稿；正在验证动态控件与导航排序能否改变预览或发请求。建议统一只读业务守卫，不只依赖一次性DOM禁用。

此轮app.js SHA-256：`1ddef0e44cf8cdcac55b6e8439d9cc5e3a5b48fedaa5c64aad07a964c65ffab3`；mobile-ux.css：`e4297178b789a055c873bb35f74c8e2913c44ff5609affbc5c3970ed01706f4c`。完整版本指纹见JSON。

### 严重边界已复现：共享预览可以排序并发送导航请求（P1）

新增4项边界实测，3 FAIL、1 PASS；结果：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-edge1.json`。被测app/mobile-ux指纹与上述第一轮相同。

1. **P1 共享预览排序绕过只读并发起两段导航。** 两站分享链接→展开导航→点击“排序”→真实鼠标长按220ms拖动第一站到第二站。站点从 `[分享目的地, 分享第二站]` 变成 `[分享第二站, 分享目的地]`；日志出现两次 `/api/route`（本轮全为假服务）：`105,28→113,33`、`113,33→112,32`。原因范围：`.dock-sort`/dock在shell之外，未被tripkit一次性禁用覆盖；业务变更/导航入口也缺少共享模式兜底。建议共享模式隐藏或禁用排序，并在reorder/rebuild/request等入口统一只读守卫。当前草稿仍未被覆盖，但共享只读与不自动消耗导航的承诺已破坏。
2. **P2 共享预览滑杆实际改变时间。** 聚焦 `#tfWhatifRange`，ArrowRight再Tab，出发时间从08:00变为08:15；没有导航请求。动态生成控件绕过一次性disabled。需同步只读状态或加业务守卫。
3. **P1 取消按钮遮挡已从超时确认成产品FAIL。** 搜索“未提交修改”后，取消按钮72×44，位置x30/y799.86；按钮内部20%/50%/80%的9点命中全部属于候选 `.poi-option`/其b、small，无一点属于取消按钮。未force click。第一轮ERROR不再归因框架，此独立用例给出确定复现。
4. 单卡刷新只请求当前路段通过：两站点击第二站刷新，日志仅一次导航，终点111,31。

新增用例已写入原脚本，使用 `--filter edge/` 可快速复验。暂未再次全量运行，等待上述修复或根任务进一步通知。

## 修复后第二轮：26/26 PASS（2026-09-25）

最新全量结果：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-round2.json`。

上一轮取消按钮遮挡、共享滑杆改时间、共享排序改站点/发导航均已复验通过，22项核心与新增功能也通过。无FAIL或ERROR。正在按通知补充编辑取消、失败恢复和动态只读边界；不将26项通过等同Safari真机或全部发布门槛通过。

### 第二轮新增边界：6 PASS、1 FAIL

结果：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-boundary2.json`。套件现共33项（上一批26全部通过，本次仅跑7新增项；各批版本指纹见对应JSON）。

**P2 快照弹窗关闭后未归还焦点。** 复现：点击“保存本方案”→弹窗正常入焦→点右上关闭；`document.activeElement`不再是触发按钮。`boundary2/snapshot-modal-restores-opener`确定FAIL。代码证据：tripkit.js `openSnapshots` 在显示后同步 `.querySelector('input').focus()`；mobile-ux.js的MutationObserver稍后才把 `document.activeElement`存作returnFocus，捕获的是弹窗内输入。关闭后试图聚焦隐藏输入，无法回到保存按钮。建议显式在打开前保存opener，或统一让弹窗管理器承担入焦（移除提前focus时仍须保证名称输入的初始焦点）。共享“保存副本”同走该入口，应一起回归。

新增通过：
- 分享替换前备份存储失败：不替换原草稿、不退出预览，并给失败提示。
- 接纳分享替换后撤销：原出发点/目的地恢复。
- Escape取消搜索后迟到响应：不重开候选、不改地点。
- 起点搜索临时文字/取消：起点与路线事实保留，取消恢复输入。
- composition期间无请求，compositionend后仅一次请求（合成DOM组合事件协议测试，不是中文键盘真机）。
- 当前草稿写入QuotaExceededError：显示未保存警告，内存新增站点仍在；恢复存储后后续保存成功，警告消失。

快速复验新增项：原脚本追加 `--filter boundary2/`。所有服务仍拦截为假数据，产品源代码未改。

## 第三轮全量：33/33 PASS（2026-09-25）

结果：/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-round3.json

原33项全部通过，0 FAIL、0 ERROR。快照焦点归还问题关闭。另给同一用例增加更严格的初始焦点断言后单独复验通过：名称输入获得焦点→关闭→回到“保存本方案”按钮；结果：/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-focus3.json。

本轮代码指纹：
- app.js: 49f12ff6c7de6457879059a659118165b1fb6e8ddf965318bbde8c7fac7b122e
- tripkit.js: fc2bf240d8ea6e4b655b5366175ab616503cf011e78cacc143e2e36e3581ca08
- mobile-ux.js: 2a2895c6c1238130070a9cdfb5757fb3f90060049fc57c564287ba9d6d78ee2e
- scenic-ai.js: 4b7a504d3257232471c68882926d486243f654ef454f5345fff3508dcef1986c

精准焦点复验与全量的tripkit/mobile-ux指纹一致：true。

结论仅覆盖记录指纹的当前实现与这些隔离场景。请求超时/取消若继续变更，应新增对应故障注入用例后再验；尚未完成Safari真机、真实地图导出和30/60站性能。产品源文件未改。

## 导航/总评超时与取消专项：7/7 PASS

结果：`/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-network4b.json`。套件当前共40项；正准备对本轮核心变更跑全量。

通过：刷新503后保留同端点900秒旧路线且明确错误提示；永久挂起导航20秒后退出loading并可重试恢复888秒；停止挂起队列产生真实浏览器requestfailed中止事件、不请求第二站且迟到结果不回写；新rebuild中止旧fetch且保留B新路线；总评取消拒收迟到结果且可再次生成；总评110秒超时可恢复操作；搜索20秒超时保留原地点/路线。

超时采用Playwright可控浏览器时钟，产品请求未替换/未改源代码。故意永久挂起的fixture响应仅存在本地。requestfailed记录单独保留在JSON，不作为pageerror；路由fulfill遇到已取消拦截同样不作为页面异常。

首跑acceptance-network4.json中1项为测试定位歧义（超时后同时出现菜单和错误区两个retry-route），并非产品失败；已限定.card-more内按钮，重跑7项全部通过，业务断言未变。

## 当前版本最终全量：40/40 PASS

结果：/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-full40.json

40项全部通过，0 FAIL、0 ERROR；pageErrors共0条。预期abort在requestFailures单列，未算页面异常。

- app.js SHA-256: acca11c6f9e62112e42a1b3b4e8416351875a5e9419afdc40eb219f0bd34971e
- tripkit.js SHA-256: fc2bf240d8ea6e4b655b5366175ab616503cf011e78cacc143e2e36e3581ca08
- scenic-ai.js SHA-256: 4b7a504d3257232471c68882926d486243f654ef454f5345fff3508dcef1986c
- mobile-ux.js SHA-256: 2a2895c6c1238130070a9cdfb5757fb3f90060049fc57c564287ba9d6d78ee2e

已覆盖原33项与7项请求超时/取消专项。本轮未修改产品代码。该结果不覆盖Safari真机、真实人机验证/地图服务、真实长图导出、30/60站性能。样式后续修改也应另做视觉检查，不能由此行为套件代替。

## 最终验收：45/45 PASS（2026-09-25）

新增模板/快照/快捷入口5项全部通过，随后45项全量全部PASS，0 FAIL、0 ERROR、0条pageErrors。结果：/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/acceptance-final45.json

新增验收：模板只读预览不写草稿且零导航/AI请求；采用前完整备份原草稿；12份快照选择替换只更新目标项，其他11份完全不变；Quota失败全部12份保持且不提示成功；共享模式三个首屏快捷按钮均disabled。

**最终被测源文件SHA-256：**
- app.js: acca11c6f9e62112e42a1b3b4e8416351875a5e9419afdc40eb219f0bd34971e
- tripkit.js: 679b7ef4febb3af783251c5304f0df47c3fa1fef4783ea7ce62b4bc990e8e17a
- scenic-ai.js: 4b7a504d3257232471c68882926d486243f654ef454f5345fff3508dcef1986c
- mobile-ux.js: 7aa4cd21fa424e94439ef4db3e2df223f521e9d8bf296c43d9b52ed248891251
- mobile-ux.css: 075c58103b083582c8f6afff85876e7f8e02d2894d1de8eb367cc8f0a0801583
- index.html: 25d1d1f677ce9e27aabbd5c320623ea5cd1a26b37aa5cd92928241ccba375856

全部根目录JS/CSS/HTML指纹清单（按文件名排序JSON）的汇总SHA-256：3cd524e457ec9a7e5dafb6e796f52d27bd1fa1ba2de484aa05fbf92685de885f。完整逐文件SHA见结果sha字段。该值是被测文件内容指纹，不是Git提交SHA。

运行结束后复核共享目录与被测快照差异：无，全部一致。

测试脚本：/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/mobile-regression.cjs
测试说明：/Users/wangxingyu/Documents/Codex/2026-09-24/01a0819a-8ca6-7e10-a5c1-e7005a93876e-https-3/outputs/regression/README.md

最终边界：桌面Chrome隔离移动视口与假后端，未调用真实导航/AI、未改产品源文件、未部署。Safari真机、原生键盘/VoiceOver、真实地图和长图导出、30/60站性能仍不在本报告通过范围。
