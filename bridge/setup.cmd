@echo off
rem One-time setup of the MT5 bridge environment (needs 64-bit Python 3.12 via the py launcher).
cd /d "%~dp0"
if not exist .venv py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
