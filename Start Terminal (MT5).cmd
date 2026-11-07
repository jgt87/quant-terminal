@echo off
rem Starts Quant Terminal with FX from MetaTrader 5 (MT5 must be running and logged in).
rem All steps live in tools\launch.mjs (shared by every launcher): update to the latest release, check
rem this computer, install dependencies, build, start the server and open the browser.
rem Options: --check (only check), --no-update, --no-browser. QT_NO_UPDATE=1 turns updates off.
cd /d "%~dp0"
title Quant Terminal (MT5)
where node >nul 2>nul || (echo Node.js was not found. Install the current LTS of Node.js from https://nodejs.org and run this again. & pause & exit /b 1)
rem One line on purpose: an update may replace this file while it runs, and cmd reads a batch file
rem line by line, so nothing after the launcher may be read from it.
node tools\launch.mjs --fx mt5 %* & if errorlevel 1 (pause & exit /b 1) else exit /b 0
