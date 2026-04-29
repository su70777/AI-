@echo off
setlocal
set "HEALTH_URL=http://127.0.0.1:3047/health"
set "SCRIPT_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo Local Publish Assistant is already running.
  echo %HEALTH_URL%
  pause
  exit /b 0
)

start "" wscript.exe "%SCRIPT_DIR%run-assistant-hidden.vbs"
echo Starting Local Publish Assistant...
timeout /t 3 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 5; Write-Host $r.Content; exit 0 } catch { Write-Host 'Local Publish Assistant failed to start. Please check assistant-data\assistant.log under the install folder.'; exit 1 }"
pause
