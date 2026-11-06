@echo off
rem One-time setup of the MT5 bridge environment (needs 64-bit Python 3.12 via the py launcher).
rem Safe to run again: it reuses bridge\.venv and only installs what is missing.
setlocal
cd /d "%~dp0"

if exist .venv\Scripts\python.exe goto :install
where py >nul 2>nul || goto :nopy
py -3.12-64 -c "" >nul 2>nul || goto :nopy
echo Creating the bridge environment (bridge\.venv)...
py -3.12-64 -m venv .venv || goto :failed

:install
echo Installing the MetaTrader5 package...
.venv\Scripts\python.exe -m pip install --disable-pip-version-check -q -r requirements.txt || goto :failed
echo MT5 bridge setup done.
exit /b 0

:nopy
echo 64-bit Python 3.12 was not found. Install it from https://www.python.org/downloads/
echo (keep "py launcher" checked), then run this again.
exit /b 1
:failed
echo The MT5 bridge setup failed - see the messages above.
exit /b 1
