# DSH 办公室（Marvis 风格多智能体可视化）

把腾讯 Marvis 的「2D 办公室」体验**嵌入 DeepSeekHarness 本体**（不是独立项目）。
安装后在 dsh Web GUI（http://127.0.0.1:3080）输入框上方出现「🏢 办公室」入口，点击打开办公室浮层。

## 它显示什么（全部是 dsh 真实数据）

| 区域 | 内容 | 数据来源 |
|------|------|----------|
| 画布工位 | 12 个工位 = 最近活跃的 dsh 会话，圆形小人颜色区分角色（总指挥/研发/测试/文档/运维/视觉/后勤） | `session.list` 按 `updatedAt` 排序 |
| 状态灯 | 绿灯 = `running:true`（该会话正在干活，小人上下浮动 + 敲键盘动画） | `item.running` |
| 出勤统计 | 在岗数 / 会话总数 / 累计步数 / 累计 Token | `sessionStats.steps`、`tokenUsage`（uncached+output+cacheRead） |
| 实时事件 | `▶ 开始工作` / `✓ 完成一轮` / `· 执行了 N 步`，同一会话 12 秒内的步数自动合并 | 前后两次 poll 的 diff |

## 原理：dsh 前端的注入机制

dsh Web 前端是预构建产物（Vite），**不支持插件热插拔**，但 `index.html` 里保留了自定义 script/style 的注入位（dsh-routes.js 就是这么挂上去的）。本 office 用同样方式接入：

```html
<!-- index.html <head> -->
<link rel="stylesheet" href="/dsh-office.css?v=1">
<!-- index.html </body> -->
<script src="/dsh-office.js?v=1" defer></script>
```

`dsh-office.js` 完全自包含（无构建、无依赖），启动后：
1. `boot()` 等 `document.body` → 挂入口按钮；
2. `positionButton()` 每 900ms 跟随「模型路由条」（`#dshRoutesBar`）定位到自己左侧，没有该条则退化为右下角固定；
3. `poll()` 每 2.5s POST `/api/session.list`，diff 出事件；
4. `loop()` 用 requestAnimationFrame 画 Canvas（工位/小人/状态灯/敲键盘）。

RPC 调用格式（dsh 标准信封）：

```js
fetch('/api/session.list', {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({ type:'client-request', rpcId:'office-xxx', method:'session.list', payload:{} })
})
// → { result: { ok:true, value:{ items:[...] } } }
```

## 安装

```powershell
# 1) 定位 dsh 前端 dist 目录
$dist = "D:\Ai\DeepSeekHarness\dist\DeepSeekHarness\runtime\dsh\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-web-frontend\dist"

# 2) 备份
Copy-Item "$dist\index.html" "$dist\index.html.bak-before-office"

# 3) 拷贝文件
Copy-Item .\dsh-office\dsh-office.js  "$dist\"
Copy-Item .\dsh-office\dsh-office.css "$dist\"

# 4) 改 index.html：<head> 末尾加 css link，</body> 前加 script（见 index.html.injected）
```

改完**刷新浏览器**（无需重启 dsh）。

## 使用

- 点击输入框上方的 **🏢 办公室**
- 或快捷键 **Ctrl+Shift+O**
- `window.__dshOfficeToggle(true/false)` 可在控制台直接开关

## 注意

- **dsh 升级会覆盖** `node_modules` 下的 dist，注入会丢失 → 保留 `index.html.original` 与两个源文件，升级后重跑安装步骤即可。
- 数据是**只读**的（只调 `session.list`），不会影响会话运行。
- 不想轮询可改 `POLL_MS`（默认 2500ms）。
