#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
a2a/mock_agent.py —— 本地 A2A 管家（JSONRPC over HTTP）
实现 doc-summarize skill，验证管家团队协议链路真实可用。
用法: python mock_agent.py   (监听 127.0.0.1:8020/rpc)
"""
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler


def summarize(text):
    text = re.sub(r"[#*\u3000]+", " ", text or "")
    sentences = [s.strip() for s in re.split(r"[。！？\n.!?]+", text) if len(s.strip()) > 6]
    points = sentences[:5]
    return {
        "summary": "；".join(points) if points else "（内容过短，无要点）",
        "points": points,
        "chars_in": len(text or ""),
        "points_out": len(points),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            req = {}
        method = req.get("method")
        rid = req.get("id")
        if method == "ping":
            result = {"pong": True, "agent": "doc-summary-agent", "version": "0.1.0"}
        elif method == "skill.invoke":
            params = req.get("params") or {}
            skill = params.get("skill")
            if skill != "doc-summarize":
                resp = {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown skill: " + str(skill)}}
                self._send(resp)
                return
            result = summarize((params.get("input") or {}).get("text", ""))
        elif method == "skills.list":
            result = {"skills": ["doc-summarize"]}
        else:
            resp = {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "unknown method: " + str(method)}}
            self._send(resp)
            return
        self._send({"jsonrpc": "2.0", "id": rid, "result": result})

    def _send(self, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8020
    print("A2A mock agent on http://127.0.0.1:%d/rpc" % port)
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
