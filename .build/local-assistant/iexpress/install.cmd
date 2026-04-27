@echo off
setlocal
set "APP_DIR=%LOCALAPPDATA%\LocalPublishAssistant"
set "ZIP_FILE=%~dp0assistant-package.zip"

if not exist "%APP_DIR%" mkdir "%APP_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP_FILE%' -DestinationPath '%APP_DIR%' -Force"
if errorlevel 1 (
  echo Failed to extract assistant package.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$appDir=$env:LOCALAPPDATA + '\LocalPublishAssistant';" ^
  "$startupDir=[Environment]::GetFolderPath('Startup');" ^
  "$programsDir=[Environment]::GetFolderPath('Programs');" ^
  "$desktopDir=[Environment]::GetFolderPath('Desktop');" ^
  "$target='wscript.exe';" ^
  "$args='"""' + $appDir + '\assistant\run-assistant-hidden.vbs' + '"""';" ^
  "$shell=New-Object -ComObject WScript.Shell;" ^
  "$startup=$shell.CreateShortcut((Join-Path $startupDir '?????????.lnk'));" ^
  "$startup.TargetPath=$target;" ^
  "$startup.Arguments=$args;" ^
  "$startup.WorkingDirectory=$appDir;" ^
  "$startup.Save();" ^
  "$menu=$shell.CreateShortcut((Join-Path $programsDir '?????????.lnk'));" ^
  "$menu.TargetPath=$target;" ^
  "$menu.Arguments=$args;" ^
  "$menu.WorkingDirectory=$appDir;" ^
  "$menu.Save();" ^
  "$desktop=$shell.CreateShortcut((Join-Path $desktopDir '?????????.lnk'));" ^
  "$desktop.TargetPath=$target;" ^
  "$desktop.Arguments=$args;" ^
  "$desktop.WorkingDirectory=$appDir;" ^
  "$desktop.Save();"
if errorlevel 1 (
  echo Failed to create assistant shortcuts.
  exit /b 1
)

start "" wscript.exe "%APP_DIR%\assistant\run-assistant-hidden.vbs"
echo Local publish assistant installed successfully.
exit /b 0
