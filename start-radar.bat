@echo off
rem Start Radar on this Windows machine: the API and the website in their own
rem windows, then open the browser. Close those two windows to stop Radar.
setlocal
set ROOT=%~dp0

if not exist "%ROOT%.env" (
  echo Missing .env in %ROOT% - add GROQ_API_KEY and the other keys first.
  pause
  exit /b 1
)
if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
  echo The Python environment is missing. See README, section Setup.
  pause
  exit /b 1
)

start "Radar API (port 8000)" /D "%ROOT%backend" cmd /k ".venv\Scripts\python -m uvicorn radar.api:app --port 8000"
start "Radar website (port 3000)" /D "%ROOT%frontend" cmd /k "npm run dev"

echo Waiting for Radar to start...
timeout /t 12 /nobreak >nul
start "" http://localhost:3000
endlocal
