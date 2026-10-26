@echo off
rem Starts the read-only MetaTrader 5 bridge, builds the web app, starts the server with FX
rem routed to MT5, and opens the terminal in the browser. MT5 must be running and logged in.
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist bridge\.venv call bridge\setup.cmd
start "MT5 bridge" /min bridge\.venv\Scripts\python.exe -I bridge\mt5_bridge.py
call npm run build --silent || goto :error
set QT_FX_PROVIDER=mt5
start "" http://localhost:4180/
call npm start
goto :eof
:error
echo Build failed - see the messages above.
pause
