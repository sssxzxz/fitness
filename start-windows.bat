@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 请先安装 Node.js: https://nodejs.org/ && pause && exit /b)
start "" http://localhost:8686
node server.js
pause
