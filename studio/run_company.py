#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Multi-Agent Studio —— crewAI 层级公司模式示例
总指挥(CEO) 拆解任务 → 各员工(模型)并行执行 → 汇总交付
所有 LLM 调用统一走 LiteLLM 网关 (http://localhost:8010)，成本看板见网关 /spend/logs
"""
import os
from crewai import Agent, Task, Crew, Process, LLM

GATEWAY = os.environ.get("LITELLM_URL", "http://localhost:8000")

# 在 LiteLLM config.yaml 里注册的模型名（代理层名字）
fast_model  = "opencode-go/deepseek-v4-flash"   # 便宜：研发/文档
big_model   = "opencode-go/deepseek-v4-pro"     # 总指挥/复杂推理
vision_model = "xiaomi/mimo-v2.6-pro"           # 看图（按 token，仅必需时）

def llm(model: str) -> LLM:
    return LLM(model=model, base_url=GATEWAY, api_key="sk-local")

def main(task: str):
    ceo = Agent(
        role="总指挥 CEO",
        goal="把任务拆解成清晰的子任务并汇总各部门成果为最终交付",
        backstory="一家 AI 软件公司的 CEO，擅长任务拆解与决策",
        llm=llm(big_model),
    )
    dev = Agent(
        role="研发工程师",
        goal="编写可运行的具体代码或技术方案",
        backstory="资深全栈工程师",
        llm=llm(fast_model),
    )
    qa = Agent(
        role="测试工程师",
        goal="审查研发成果，找出 bug 与风险",
        backstory="挑剔的质量工程师",
        llm=llm(fast_model),
    )
    doc = Agent(
        role="文档专员",
        goal="把最终成果整理成清晰的说明文档",
        backstory="文档专家",
        llm=llm(fast_model),
    )

    plan_task = Task(
        description=f"将任务拆解为 3 个子任务：{task}",
        expected_output="3 行子任务列表（研发/测试/文档各一）",
        agent=ceo,
    )
    dev_task = Task(description="完成研发子任务", expected_output="具体成果", agent=dev)
    qa_task = Task(description="审查研发成果", expected_output="问题清单", agent=qa)
    doc_task = Task(description="整理最终交付文档", expected_output="完整文档", agent=doc)
    summary_task = Task(description="汇总全部成果为最终交付", expected_output="给老板的交付报告", agent=ceo)

    crew = Crew(
        agents=[ceo, dev, qa, doc],
        tasks=[plan_task, dev_task, qa_task, doc_task, summary_task],
        process=Process.hierarchical,   # 层级：CEO 管理员工
        manager_agent=ceo,
        verbose=True,
    )
    result = crew.kickoff(inputs={"task": task})
    print("\n===== 最终交付 =====\n", result)

if __name__ == "__main__":
    import sys
    main(" ".join(sys.argv[1:]) or "做一个天气查询网页")