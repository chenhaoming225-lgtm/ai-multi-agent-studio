#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
a2a/registry.py —— 管家团队（A2A 卡片）注册表
逆向自 Marvis 的 cache/a2a_cards/*.json 协议：
  卡片声明 name/description/supportedInterfaces(JSONRPC)/capabilities/skills
  注册表负责：扫描加载 -> 在线检测 -> 按 skill 调用远端 Agent
"""
import json
import os
import urllib.request
import urllib.error

CARDS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "a2a_cards")


def load_cards():
    """扫描 a2a_cards 目录，返回卡片列表（含解析后的 endpoint）"""
    cards = []
    if not os.path.isdir(CARDS_DIR):
        return cards
    for fn in sorted(os.listdir(CARDS_DIR)):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(CARDS_DIR, fn), "r", encoding="utf-8") as f:
                card = json.load(f)
            card["_file"] = fn
            card["_endpoint"] = (card.get("supportedInterfaces") or [{}])[0].get("url", "")
            cards.append(card)
        except Exception as e:
            cards.append({"name": fn, "description": "卡片解析失败: " + str(e), "_file": fn, "_endpoint": "", "skills": []})
    return cards


def health(card, timeout=1.2):
    """检测远端 Agent 在线：JSONRPC ping"""
    url = card.get("_endpoint", "")
    if not url:
        return {"online": False, "error": "no endpoint"}
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {}}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read().decode("utf-8"))
        return {"online": True, "result": body.get("result")}
    except Exception as e:
        return {"online": False, "error": str(e)[:120]}


def invoke(card, skill_id, payload, timeout=60):
    """按 JSONRPC 调用远端 Agent 的某个 skill"""
    url = card.get("_endpoint", "")
    req = urllib.request.Request(
        url,
        data=json.dumps({
            "jsonrpc": "2.0", "id": 2,
            "method": "skill.invoke",
            "params": {"skill": skill_id, "input": payload},
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.loads(r.read().decode("utf-8"))
    if "error" in body:
        raise RuntimeError(str(body["error"]))
    return body.get("result", {})


if __name__ == "__main__":
    for c in load_cards():
        h = health(c)
        print(("*" if h.get("online") else " "), c.get("name"), "|", c.get("_endpoint"), "|", len(c.get("skills", [])), "skills")
