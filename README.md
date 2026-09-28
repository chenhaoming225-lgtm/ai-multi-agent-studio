# AI Multi-Agent Studio —— 多模型协作公司（植入版）

> 在本地跑起来的「AI 软件公司」多智能体方案：**LiteLLM 统一网关 + crewAI 角色编排 + 成本看板**。
> 全部对接 OpenAI 兼容 API（opencode-go 订阅 / 小米 Token Plan），严格成本优先。

## 架构

```
你的任务
   │
   ▼
crewAI（层级模式：CEO 总指挥 + 员工模型并行）
   │        每角色 → 请求 LiteLLM 网关 (localhost:8010)
   ▼
LiteLLM 网关 —— 统一路由 / 回退 / 成本计费 / 自定义 header
   ├─ opencode-go（订阅，$10/月，30 模型，带 x-opencode-session: dsh 头）
   └─ xiaomi-token-plan-cn（按 token，仅看图/1M 长上下文）
```

## 目录

- `gateway/config.yaml` —— LiteLLM 网关配置（34 模型）
- `studio/` —— crewAI 角色编排示例（CEO + 研发/数据/测试/文档员工）
- `docs/` —— 接入说明、成本对照、MetaGPT 重型模式参考

## 快速开始

```bash
# 1. 起网关
cd gateway && .venv\Scripts\python -m litellm --config config.yaml --port 8010
# 2. 跑一个公司任务
cd studio && .venv\Scripts\python run_company.py "做一个天气查询网页"
```

## 成本原则

1. 订阅优先：默认全部走 opencode-go，周额度内免费
2. 小米仅在 vision/1M 上下文时启用（按 token 真花钱）
3. LiteLLM 每次调用记录 token/成本，可查看板

## 🖥 实时看板（Marvis 风格，2026-09-28 验证通过）

运行任务时实时看到「公司」里每个员工在干嘛：CEO 拆解 → 员工开工/完成 → LLM 调用计数 → 成本。

```bash
# 1. 网关（先起）
D:\Ai\litellm-gateway\.venv\Scripts\litellm.exe --config config.yaml --port 8010
# 2. 带看板跑任务（自动开 8011 看板服务）
cd D:\Ai\studio\live
..\.venv\Scripts\python.exe run_company_live.py "做一个天气查询网页"
# 3. 浏览器打开
#    http://127.0.0.1:8011
```

原理：crewAI 自带 EventBus（crew_started/agent_started/llm_call 等事件）→ Python 内嵌 SSE 服务器 → 浏览器实时渲染办公室卡片 + 事件流 + 日志 + 统计（LLM 次数/Token）。

## 状态（2026-09-28 实测）

✅ **全链路已验证**：LiteLLM 网关(8010) → opencode-go 订阅模型 → crewAI 公司模式（CEO 拆解→员工并行→汇总交付）端到端跑通。