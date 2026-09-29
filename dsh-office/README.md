# DSH 办公室 —— 直接复用 Marvis 原始场景素材

把腾讯 Marvis 的 2D 办公室**原样搬进 DeepSeekHarness 本体**。
不是照截图重绘，而是加载 Marvis 安装包里的**原始地图与图集文件**来渲染。

## 素材来源（全部为 Marvis 自带文件）

目录 `marvis-workbench/`，取自
`D:\Ai\Marvis\Application\1.60.2800.220\marvis-offline-page\workbench\assets\`：

| 文件 | 作用 |
|------|------|
| `office.tmj` | 办公室地图（Tiled 17×14，tilewidth 64）：`block`/`cat_block` 阻挡层 + `workstation`/`workstation_boss` 对象组（chair/desk/computer，带精确 gid 坐标） |
| `assets.tsj` | 瓦片集（image collection，11 张：desk/shadow/screen/chair/wide_monitor/ergonomic_chair/chair_boss/desk_boss/shadow_boss/screen_on/screen_img） |
| `img/workstation.webp` + `.json` | 工位图集（TexturePacker：含 `rotated`/`trimmed` 帧） |
| `img/agent.webp` + `.json` | 角色 UI 图集（名字标签、数字、任务气泡） |
| `spritesheet/agent/fc_*.webp` + `.json` | 角色动作动画，34 种：`fc_working`、`fc_standby`、`fc_sleeping`、`fc_coffee`、`fc_walking_h/up`、`fc_talking_on_seat`、`fc_cheer_main`、`fc_off_chair`、`fc_leaving`、`fc_sigh`、`fc_high_press`、`fc_running_treadmill`、`fc_screen_working_*`、`fc_pooping-*` 等 |
| `spritesheet/cat/fc_cat_walk_h.webp` | 办公室的猫 |
| `manifest.json` | PixiJS assets manifest（TexturePacker `tps` 标签） |

本仓库只收 **1x webp + json**（跳过 `@2x` 与 `.ktx2`），共 38 个文件 / 4.2 MB。
原始目录含 `@2x` + ktx2 合计 66 MB，可按需补齐。

## 渲染链路

```
office.tmj  ──对象层──▶ gid
   │                    │  local_id = gid - 1 (firstgid=1)
   ▼                    ▼
block 层 ──▶ 可走格子     assets.tsj ──▶ image 路径
（房间格局/地板）              │ basename
                             ▼
                    workstation.webp.json ──▶ 图集帧 {x,y,w,h,rotated,trimmed}
                             │
                             ▼
                        canvas drawImage
```

- **对象坐标**：Tiled tile object 锚点在**左下角** → 绘制时用 `(x, y - height)`
- **rotated 帧**：TexturePacker 顺时针 90° 存储，源区域宽高互换，绘制时逆时针还原
  （桌下阴影 `shadow.png` 就是 rotated，方向错了会立刻看出来）
- **trimmed 帧**：内容落在 `spriteSourceSize` 偏移处，相对 `sourceSize` 定位
- **动画**：帧名带序号（`fc_working_00000`~`00066`，67 帧），排序后按 15fps 循环
- **房间地板**：`block` 层 `data===0` 画白格（可走），非 0 画灰墙 —— 与 Marvis 原图一致

## 数据仍来自真实 dsh

场景里的 agent 是 **dsh 真实会话**（`POST /api/session.list`）：

- 最近 8 个会话 → 8 个 agent，按可走格子铺满
- `running:true` → 播放 `fc_working`；空闲 → `fc_standby`
- 名牌 = 会话名 + `agentPreset · N 步`，工作中为绿框
- 右栏：在岗/今日活跃/累计步数/Token 用量/模型耗时（`sessionStats` + `tokenUsage`）
- 事件流：前后轮询 diff 出「开始工作 / 完成一轮 / 执行了 N 步」（12 秒内合并）

## 安装

```powershell
$dist = "D:\Ai\DeepSeekHarness\dist\DeepSeekHarness\runtime\dsh\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-web-frontend\dist"
Copy-Item "$dist\index.html" "$dist\index.html.bak-before-office"   # 备份
# 拷入 dsh-office.js / dsh-office.css / marvis-workbench/ 三个目标
# index.html <head> 末尾加： <link rel="stylesheet" href="/dsh-office.css?v=N">
# index.html </body> 前加：  <script src="/dsh-office.js?v=N" defer></script>
```

改完**刷新浏览器**即可（无需重启 dsh）。
改代码后**记得递增 `?v=`**，否则浏览器缓存会让你以为没生效
（已踩过：页面报 `officeFlag:true` 但画面仍是旧版）。

- 入口：输入框上方「办公室」按钮，或 `Ctrl+Shift+O`，或控制台 `window.__dshOfficeToggle(true)`
- `Esc` 关闭

## 已知边界

- **dsh 升级会覆盖** `node_modules` 下的 dist，注入与素材都会丢
  → 保留 `index.html.original` 与本目录，升级后重跑安装步骤。
- 数据是只读的（只调 `session.list`），不影响会话运行。
- Marvis 主进程受保护（`OpenProcess` 拒绝、WMI 读不到命令行），
  UIPI 会丢弃普通进程向它注入的鼠标事件，所以**点不进 Marvis 自己的办公室页**——
  因此改为直接取其前端素材在 dsh 里复现。
