# Marvis 功能界面逆向报告（2026-09-29）

> 探查方式：界面截图 + 数据层逆向（合成鼠标注入被系统锁死：SetCursorPos err=203、SendInput/PostMessage 均被忽略，故改为读取本地数据实现）。

## 安装结构
- D:\Ai\Marvis\Application\1.60.2800.220\ —— Qt + Chromium 壳（marvis-browser-host）
- D:\Ai\Marvis\MarvisAgent\1.60.2800.657\ —— Agent 运行时（python311 + mcp_server + skills + prompts + runtime）
- C:\Users\20492\AppData\Roaming\Tencent\Marvis\ —— 用户数据（腾讯系实锤）

## 功能 ↔ 实现映射

### 1. 新建对话
- messages/*.md（YAML frontmatter + Markdown，含 read_status 已读状态）
- workspace/conv_<uuid>/ 每会话独立工作区

### 2. 自动任务（schedules）
- schedules/*.yaml：type: cron / time_value: 7段cron / prompt(可引用skill) / executed_list(success/miss/cancelled)
- 创建入口：create_source: form（表单）| conversation（AI 在对话中 function call 自建）
- 实证：task_id=2「紫光股份收盘跟踪」from_conversation_id + function_call_id: call_00_Fgcvo5baH3dfLeVn5au65659

### 3. 技能广场
- 89 内置技能（8000-IT服务台/硬件诊断/文档/腾讯生态）+ 10 市场技能 + custom
- 格式：SKILL.md（frontmatter: name/description/触发词）+ meta.json（市场元数据）+ examples/*.py
- 市场：download_count/download_url（static.pc.yyb.qq.com 应用宝 CDN）
- 与 Claude Code Agent Skills 兼容格式

### 4. 管家团队
- A2A (Agent-to-Agent) 卡片：cache/a2a_cards/*.json
- 字段：name/description/supportedInterfaces(JSONRPC URL)/capabilities(streaming)/skills/inputModes/outputModes
- 实证：ppt-generation-agent（流式回报逐页进度）

### 5. 办公室（2D 场景，业务库驱动）
- business.db 表：office_behavior_events / office_daily_presence / agent_task_facts / agent_task_daily / agent_task_totals
- office_behavior_events 字段：event_id, event_type, occurred_at_ms, day_key, week_key, agent_kind, agent_key, invocation_id, agent_name, run_id, conversation_id, source, result, duration_ms, metadata_json
- 事件类型实证：work.completed / work.aborted / slack.completed
- 员工实证：Marvis(main) / Computer Agent(workbench/computer) / File Agent(workbench/file) / App Agent(workbench/app)
- metadata: {"scene":"office","schemaVersion":1}
- office_daily_presence：day_key + first_seen_at_ms + source(gateway_process) —— 每日出勤打卡
- 结论：每个 Agent=一个员工，事件流驱动小人动画

### 6. 本地资料
- MarvisKnowledgebase 进程（127.0.0.1:5151，403 untrusted process 防护）
- database/data.db 426MB + tantivy_index(全文) + tool_index_vector.db(向量) = 双路检索
- 记忆：memory.db + memory_vector.db（与 memory-agent 同架构）

### 7. 模型管理
- model_configs：config_id/display_name/provider/base_url/model_id/plan_id/api_key_ciphertext/status
- conversation_model_bindings：会话级模型绑定

## 其他端口（进程 → 端口）
- 2657 MarvisDlSvr | 5151 Knowledgebase | 5283 MarvisSvr | 5286 Marvis | 10123 MarvisHost(401) | 13335 marvis-browser-host | 39099 MarvisHost localapi(JSON)

## 对 AI-Office 的三条抄作业要点
1. 办公室动画数据源照搬 behavior_events + daily_presence 表结构（字段名可直接用）
2. 管家团队 = A2A 卡片接入外部 Agent（JSONRPC + capabilities + skills 声明）
3. 技能用 SKILL.md 格式（与 Claude Code 生态兼容，dsh 已在用）

## 截图存档（工作区）
marvis-ui-00-current.png / marvis-ui-annotated.png / marvis-ui-postmsg.png / marvis-ui-test2.png 等
