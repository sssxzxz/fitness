@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul && (start "" http://localhost:8686 & node server.js & pause & exit /b)
if exist "%USERPROFILE%\anaconda3\python.exe" ("%USERPROFILE%\anaconda3\python.exe" server.py & pause & exit /b)
where python >nul 2>nul && (python server.py & pause & exit /b)
where py >nul 2>nul && (py server.py & pause & exit /b)
echo Need Python or Node.js: https://www.python.org/  https://nodejs.org/
pause
