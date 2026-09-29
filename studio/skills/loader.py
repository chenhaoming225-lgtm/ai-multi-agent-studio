#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
skills/loader.py —— 技能广场加载器（SKILL.md + meta.json，与 Claude Code Agent Skills 兼容）
格式逆向自 Marvis 的 skills/market/<name>/{SKILL.md, meta.json}
"""
import json
import os
import re

SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skills")


def parse_frontmatter(text):
    """解析 SKILL.md 顶部 YAML frontmatter（--- 包围的 name/description）"""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if mm:
            fm[mm.group(1)] = mm.group(2).strip().strip('"\'')
    return fm, text[m.end():]


def load_skills():
    """扫描 skills 目录，返回技能列表"""
    out = []
    if not os.path.isdir(SKILLS_DIR):
        return out
    for name in sorted(os.listdir(SKILLS_DIR)):
        d = os.path.join(SKILLS_DIR, name)
        if not os.path.isdir(d):
            continue
        skill_md = os.path.join(d, "SKILL.md")
        entry = {"id": name, "dir": name}
        if os.path.isfile(skill_md):
            with open(skill_md, "r", encoding="utf-8") as f:
                fm, body = parse_frontmatter(f.read())
            entry["name"] = fm.get("name", name)
            entry["description"] = fm.get("description", "")
            entry["body_chars"] = len(body)
        meta_f = os.path.join(d, "meta.json")
        if os.path.isfile(meta_f):
            try:
                with open(meta_f, "r", encoding="utf-8") as f:
                    entry["meta"] = json.load(f)
            except Exception:
                entry["meta"] = {}
        out.append(entry)
    return out


if __name__ == "__main__":
    for s in load_skills():
        m = s.get("meta", {})
        print("%-22s %-16s dl=%-5s %s" % (s.get("id"), m.get("display_name", "-"), m.get("download_count", 0), (s.get("description") or "")[:50]))
