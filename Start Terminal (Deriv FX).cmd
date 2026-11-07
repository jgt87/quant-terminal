@echo off
rem Updates to the latest release, installs dependencies, builds the web app, starts the
rem Quant Terminal server and opens it in the browser once it is listening.
rem FX pairs (EURUSD=X, FX:EURUSD) come from Deriv's public feed: live ticks, no account needed.
setlocal
cd /d "%~dp0"
title Quant Terminal (Deriv FX)

where node >nul 2>nul || goto :nonode
rem The Deriv feed needs Node.js 22.12 or newer (built-in WebSocket, Vite 8).
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===22&&b>=12)||a>=23?0:1)" || goto :oldnode

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

set QT_FX_PROVIDER=deriv
set QT_OPEN_BROWSER=1
call npm start --silent || goto :serverfailed
goto :eof

:nonode
echo Node.js was not found. Install the current LTS of Node.js (22.12 or newer) from https://nodejs.org and run this again.
goto :fail
:oldnode
for /f "delims=" %%v in ('node -v') do echo Node.js %%v is not supported. Install the current LTS of Node.js (22.12 or newer) from https://nodejs.org and run this again.
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
