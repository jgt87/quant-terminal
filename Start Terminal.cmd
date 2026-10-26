@echo off
rem Builds the web app, starts the Quant Terminal server and opens it in the browser.
rem Data: Yahoo + Binance. For live FX from MetaTrader 5 use "Start Terminal (MT5).cmd".
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run build --silent || goto :error
start "" http://localhost:4180/
call npm start
goto :eof
:error
echo Build failed - see the messages above.
pause
