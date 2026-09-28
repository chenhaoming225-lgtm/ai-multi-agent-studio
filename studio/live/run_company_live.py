#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Multi-Agent Studio —— 实时可视化公司模式（Marvis 风格）
在 run_company.py 基础上：挂 crewAI EventBus 监听器 → SSE 推给浏览器看板。
用法：
  1) 先启动网关（8010）
  2) python run_company_live.py "任务描述"
  3) 浏览器打开 http://127.0.0.1:8011 实时看板
"""
import os
import json
import threading
import queue
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Windows 坑：httpx 读系统代理致 502，必须直连 localhost
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

GATEWAY = os.environ.get("LITELLM_URL", "http://127.0.0.1:8010")

from crewai import Agent, Task, Crew, Process, LLM
from crewai.events import crewai_event_bus
from crewai.events.types.crew_events import (
    CrewKickoffStartedEvent, CrewKickoffCompletedEvent, CrewKickoffFailedEvent,
)
from crewai.events.types.task_events import TaskStartedEvent, TaskCompletedEvent
from crewai.events.types.agent_events import (
    AgentExecutionStartedEvent, AgentExecutionCompletedEvent, AgentExecutionErrorEvent,
)
from crewai.events.types.llm_events import LLMCallStartedEvent, LLMCallCompletedEvent

# ---------------- SSE 事件分发 ----------------
BROADCAST_QUEUE = queue.Queue()
SSE_CLIENTS = set()

def sse_broadcast(event_type: str, data: dict) -> None:
    """推一条 SSE 事件（也进历史，供新连接者回放）"""
    payload = json.dumps({"type": event_type, "data": data, "ts": time.time()}, ensure_ascii=False)
    BROADCAST_QUEUE.put(payload)

class SSEHandler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass  # 静默默认日志
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            SSE_CLIENTS.add(self)
            try:
                while True:
                    try:
                        payload = BROADCAST_QUEUE.get(timeout=15)
                        self.wfile.write(("data: " + payload + "\n\n").encode("utf-8"))
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                SSE_CLIENTS.discard(self)
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            try:
                with open(os.path.join(os.path.dirname(__file__), "dashboard.html"), "rb") as f:
                    self.wfile.write(f.read())
            except FileNotFoundError:
                self.wfile.write(b"dashboard.html not found")
    do_POST = do_GET

def start_sse_server(port: int = 8011) -> None:
    srv = HTTPServer(("127.0.0.1", port), SSEHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"[live] 看板已启动: http://127.0.0.1:{port}  (Ctrl+C 停止)")

# ---------------- 模型接入 ----------------
fast_model  = "opencode-go/deepseek-v4-flash"
big_model   = "opencode-go/deepseek-v4-pro"
vision_model = "xiaomi/mimo-v2.6-pro"

def llm(model: str) -> LLM:
    # openai/ 前缀走 OpenAI 兼容协议；base_url 指本地网关
    return LLM(model="openai/" + model, base_url=GATEWAY + "/v1", api_key="sk-local")

# ---------------- 事件监听（EventBus） ----------------
@crewai_event_bus.on(LLMCallStartedEvent)
def on_llm_start(source, event):
    try:
        sse_broadcast("llm_start", {
            "model": getattr(event, "model", "?"),
            "agent": getattr(getattr(event, "agent", None), "role", None) or "?",
            "prompt": (getattr(event, "prompt", "") or "")[:120],
        })
    except Exception:
        pass

@crewai_event_bus.on(AgentExecutionStartedEvent)
def on_agent_start(source, event):
    try:
        sse_broadcast("agent_start", {
            "role": getattr(event.agent, "role", "?"),
            "model": getattr(getattr(event.agent, "llm", None), "model", "?"),
            "task": (getattr(event, "task_prompt", "") or "")[:160],
        })
    except Exception:
        pass

@crewai_event_bus.on(AgentExecutionCompletedEvent)
def on_agent_done(source, event):
    try:
        sse_broadcast("agent_done", {
            "role": getattr(event.agent, "role", "?"),
            "output": (getattr(event, "output", "") or "")[:220],
        })
    except Exception:
        pass

@crewai_event_bus.on(AgentExecutionErrorEvent)
def on_agent_err(source, event):
    try:
        sse_broadcast("agent_err", {"role": getattr(event.agent, "role", "?"), "error": str(getattr(event, "error", ""))[:200]})
    except Exception:
        pass

@crewai_event_bus.on(TaskStartedEvent)
def on_task_start(source, event):
    try:
        sse_broadcast("task_start", {"description": (getattr(event, "description", "") or "")[:160], "agent": getattr(getattr(getattr(event, "agent", None), "role", None), None, "?")})
    except Exception:
        pass

@crewai_event_bus.on(CrewKickoffStartedEvent)
def on_crew_start(source, event):
    sse_broadcast("crew_start", {"inputs": getattr(event, "inputs", {})})

@crewai_event_bus.on(CrewKickoffCompletedEvent)
def on_crew_done(source, event):
    sse_broadcast("crew_done", {"output": (getattr(event, "output", "") or "")[:300], "tokens": getattr(event, "total_tokens", 0)})

@crewai_event_bus.on(CrewKickoffFailedEvent)
def on_crew_fail(source, event):
    sse_broadcast("crew_fail", {"error": str(getattr(event, "error", ""))[:300]})

# ---------------- 公司任务 ----------------
def main(task: str):
    ceo = Agent(role="总指挥 CEO", goal="拆解任务并汇总各部门成果为最终交付",
                backstory="一家 AI 软件公司的 CEO，擅长任务拆解与决策", llm=llm(big_model))
    dev = Agent(role="研发工程师", goal="编写可运行的具体代码或技术方案",
                backstory="资深全栈工程师", llm=llm(fast_model))
    qa = Agent(role="测试工程师", goal="审查研发成果，找出 bug 与风险",
               backstory="挑剔的质量工程师", llm=llm(fast_model))
    doc = Agent(role="文档专员", goal="把最终成果整理成清晰的说明文档",
                backstory="文档专家", llm=llm(fast_model))

    plan_task = Task(description=f"将任务拆解为 3 个子任务：{task}",
                     expected_output="3 行子任务列表（研发/测试/文档各一）", agent=ceo)
    dev_task = Task(description="完成研发子任务", expected_output="具体成果", agent=dev)
    qa_task = Task(description="审查研发成果", expected_output="问题清单", agent=qa)
    doc_task = Task(description="整理最终交付文档", expected_output="完整文档", agent=doc)
    summary_task = Task(description="汇总全部成果为最终交付", expected_output="给老板的交付报告", agent=ceo)

    crew = Crew(
        agents=[dev, qa, doc],  # CEO 只做管理层，不进员工列表
        tasks=[plan_task, dev_task, qa_task, doc_task, summary_task],
        process=Process.hierarchical,
        manager_agent=ceo,
        verbose=True,
    )
    print("\n===== 最终交付 =====\n")
    result = crew.kickoff(inputs={"task": task})
    print(result)

if __name__ == "__main__":
    import sys
    start_sse_server(8011)
    main(" ".join(sys.argv[1:]) or "做一个天气查询网页")
