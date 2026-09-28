@echo off
REM AI Multi-Agent Studio - LiteLLM 网关启动（本地 8000 端口）
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo 首次运行：创建虚拟环境...
  python -m venv .venv
  .venv\Scripts\python -m pip install -i https://pypi.org/simple "litellm[proxy]" -q
)
set OPENCODE_GO_API_KEY=<paste-your-key>
set XIAOMI_API_KEY=<paste-your-key>
.venv\Scripts\python -m litellm --config config.yaml --port 8010