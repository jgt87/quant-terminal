@echo off
rem Updates to the latest release, installs dependencies, builds the web app, starts the
rem Quant Terminal server and opens it in the browser once it is listening.
rem Data: Yahoo + Binance. For live FX from MetaTrader 5 use "Start Terminal (MT5).cmd".
setlocal
cd /d "%~dp0"
title Quant Terminal

where node >nul 2>nul || goto :nonode
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" || goto :oldnode

rem Update to the latest release (git checkouts; QT_NO_UPDATE=1 turns it off). cmd parses a ( ) block
rem as a whole before running it, so the update may replace this file safely; after an update the
rem launcher restarts from the new version.
if not defined QT_UPDATED (
  node tools\update.mjs
  if errorlevel 10 (
    set QT_UPDATED=1
    call "%~f0" %*
    exit /b
  )
)

rem Installs exactly what package-lock.json pins (npm ci) when it changed; instant otherwise.
node tools\ensure-deps.mjs || goto :installfailed

echo Building the app...
call npm run build --silent || goto :buildfailed

set QT_OPEN_BROWSER=1
call npm start --silent || goto :serverfailed
goto :eof

:nonode
echo Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this again.
goto :fail
:oldnode
for /f "delims=" %%v in ('node -v') do echo Node.js %%v is too old. Install Node.js 20 or newer from https://nodejs.org and run this again.
goto :fail
:installfailed
echo Installing dependencies failed - see the messages above. Check your internet connection and try again.
goto :fail
:buildfailed
echo Build failed - see the messages above.
goto :fail
:serverfailed
echo The server stopped with an error - see the messages above.
:fail
pause
exit /b 1
