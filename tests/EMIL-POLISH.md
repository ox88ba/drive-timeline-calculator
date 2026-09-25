# Emil skills：移动体验打磨

基于 92dc8e1，本次仅本地修改，未提交或发布。

已安装 emilkowalski/skills 的 mobile-native、apple-design、emil-design-eng、animate、review-animations、improve-animations、find-animation-opportunities、prototype。此次实际采用前两项做移动与阅读适配，animate 做克制的按压反馈，review-animations 复核变更。未引入运行时依赖。

## 动效复核

| Before | After | Why |
| --- | --- | --- |
| timeflow.js 卡片滚动前透明、按序号延迟入场 | 内容立即可见，删除 observer/入场定时器 | 功能性长列表不应让用户等待装饰 |
| timeflow.js 出发数字弹跳、前景天空覆盖层 | 时间与天空直接更新 | 连续调整停留时保持读数清晰，无旧层遮挡 |
| voyage.css、tripkit.css 无条件 hover | hover + fine pointer 媒体条件 | 避免触屏悬停残留 |
| 各按钮反馈不一致 | mobile-ux.css 中 100ms 按下 / 160ms 恢复，transform + --ease-out | 短暂反馈，不延迟实际操作，不增加动画库 |
| 平滑定位无视系统偏好 | app.js 尊重减少动态、键盘定位立即完成 | 降低不必要的大范围移动 |
| 自动消失的撤销提示 | 焦点、鼠标悬停、后台暂停倒计时 | 用户仍在操作时不失去撤销入口 |

代码级动效结论：Approve。本次删除比新增更多；按压使用可中断 CSS transition，减少动态时取消位移。不重建手势系统，不给高频数据增加动画。真实 iPhone 触感仍待实机验收，不把桌面截图当作实机证明。

## 阅读与布局

- 模板和分享弹窗使用稳定的实色阅读面；保留外围和撤销提示现有玻璃风格。
- 模板说明、已存方案说明、分享快捷命名字号增大；长标题和操作行可换行。
- 手机系统分享为主按钮，占整行，另两个动作为并排次按钮。
- 关闭按钮至少 44px；分享复选框的文字整行可点。
- 弹窗与预览使用动态视口高度；候选列表/更多菜单有高度上限、内部滚动边界。
- 减少透明度、增强对比度有实色降级；正文和地址仍可复制；未禁用页面缩放。
- 保留原安全区实色处理，未声称解决所有 Safari 状态栏问题。

## 回归发现及修复

搜索未提交时点击停留 summary，旧 pointerdown 处理可能在 click 前重建节点，吞掉点击。改为 click 阶段取消编辑、事件完成后重绘，并同步 native details 状态；375/390/393/430/1280px 已复测。

新增 tests/emil-polish.test.cjs：触屏 hover、减少动态、高对比、弹窗滚动、撤销焦点暂停/移出恢复/新提示替换。测试鼠标须移出提示后再断言计时恢复，否则鼠标悬停会正确暂停。

原测试继续覆盖 46 项业务行为、30/60 站、搜索层级及真实多页 PNG。测试均使用隔离浏览器与模拟服务，不消耗真实 AI/导航配额。

实机待验收：iPhone Safari 键盘及地址栏伸缩、候选滚动、缩放、撤销触摸操作、系统分享。当前不发布，待用户预览确认。
