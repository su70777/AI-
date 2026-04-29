param(
  [string]$AppVersion = "1.0.2",
  [string]$OutputBaseName = "LocalPublishAssistant-Setup"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$buildRoot = Join-Path $env:TEMP "local-assistant-build"
$appStage = Join-Path $buildRoot "app"
$iexpressRoot = Join-Path $buildRoot "iexpress"
$outputDir = Join-Path $repoRoot "dist-installer"
$zipPath = Join-Path $iexpressRoot "assistant-package.zip"
$installCmdPath = Join-Path $iexpressRoot "install.cmd"
$sedPath = Join-Path $iexpressRoot "package.sed"
$tempTargetExe = Join-Path $env:TEMP "$OutputBaseName.exe"
$targetExe = Join-Path $outputDir "$OutputBaseName.exe"
$iexpressExe = Join-Path $env:WINDIR "System32\\iexpress.exe"

function Write-Step([string]$Message) {
  Write-Host "[build-local-assistant] $Message"
}

function Copy-Tree([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

if (!(Test-Path $iexpressExe)) {
  throw "IExpress was not found at $iexpressExe"
}

$nodeCommand = Get-Command node -ErrorAction Stop
$nodeExe = $nodeCommand.Source
if (!(Test-Path $nodeExe)) {
  throw "Node runtime not found."
}

Write-Step "Cleaning previous build output"
Remove-Item $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $tempTargetExe -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $appStage, $iexpressRoot, $outputDir | Out-Null

Write-Step "Copying assistant application files"
Copy-Item $nodeExe (Join-Path $appStage "node.exe") -Force
Copy-Tree (Join-Path $repoRoot "assistant") (Join-Path $appStage "assistant")
Copy-Tree (Join-Path $repoRoot "server\\lib") (Join-Path $appStage "server\\lib")
Copy-Tree (Join-Path $repoRoot "shared") (Join-Path $appStage "shared")
New-Item -ItemType Directory -Force -Path (Join-Path $appStage "server\\data"), (Join-Path $appStage "server\\uploads"), (Join-Path $appStage "assistant-data") | Out-Null

$rootPackage = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$assistantPackage = [ordered]@{
  name = "local-publish-assistant"
  private = $true
  version = $AppVersion
  type = "module"
  dependencies = [ordered]@{
    cors = $rootPackage.dependencies.cors
    dotenv = $rootPackage.dependencies.dotenv
    express = $rootPackage.dependencies.express
    "playwright-core" = $rootPackage.dependencies."playwright-core"
  }
}
$assistantPackage | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $appStage "package.json") -Encoding UTF8

@"
ASSISTANT_HOST=127.0.0.1
ASSISTANT_PORT=3047
"@ | Set-Content (Join-Path $appStage "assistant\\.env") -Encoding UTF8

Write-Step "Installing production dependencies for the assistant package"
Push-Location $appStage
try {
  & npm.cmd install --omit=dev
} finally {
  Pop-Location
}

Write-Step "Compressing the assistant application payload"
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
Compress-Archive -Path (Join-Path $appStage "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force

Write-Step "Writing installer command script"
@'
@echo off
setlocal
set "APP_DIR=%LOCALAPPDATA%\LocalPublishAssistant"
set "ZIP_FILE=%~dp0assistant-package.zip"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*LocalPublishAssistant*assistant-server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

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
  "$manualTarget=$appDir + '\assistant\start-assistant.cmd';" ^
  "$shell=New-Object -ComObject WScript.Shell;" ^
  "$startup=$shell.CreateShortcut((Join-Path $startupDir '本机发布助手.lnk'));" ^
  "$startup.TargetPath=$target;" ^
  "$startup.Arguments=$args;" ^
  "$startup.WorkingDirectory=$appDir;" ^
  "$startup.Save();" ^
  "$startupEnglish=$shell.CreateShortcut((Join-Path $startupDir 'Local Publish Assistant.lnk'));" ^
  "$startupEnglish.TargetPath=$target;" ^
  "$startupEnglish.Arguments=$args;" ^
  "$startupEnglish.WorkingDirectory=$appDir;" ^
  "$startupEnglish.Save();" ^
  "$menu=$shell.CreateShortcut((Join-Path $programsDir '本机发布助手.lnk'));" ^
  "$menu.TargetPath=$manualTarget;" ^
  "$menu.WorkingDirectory=$appDir;" ^
  "$menu.Save();" ^
  "$menuEnglish=$shell.CreateShortcut((Join-Path $programsDir 'Local Publish Assistant.lnk'));" ^
  "$menuEnglish.TargetPath=$manualTarget;" ^
  "$menuEnglish.WorkingDirectory=$appDir;" ^
  "$menuEnglish.Save();" ^
  "$desktop=$shell.CreateShortcut((Join-Path $desktopDir '本机发布助手.lnk'));" ^
  "$desktop.TargetPath=$manualTarget;" ^
  "$desktop.WorkingDirectory=$appDir;" ^
  "$desktop.Save();" ^
  "$desktopEnglish=$shell.CreateShortcut((Join-Path $desktopDir 'Local Publish Assistant.lnk'));" ^
  "$desktopEnglish.TargetPath=$manualTarget;" ^
  "$desktopEnglish.WorkingDirectory=$appDir;" ^
  "$desktopEnglish.Save();"
if errorlevel 1 (
  echo Failed to create assistant shortcuts.
  exit /b 1
)

start "" wscript.exe "%APP_DIR%\assistant\run-assistant-hidden.vbs"
echo Local publish assistant installed successfully.
exit /b 0
'@ | Set-Content $installCmdPath -Encoding ASCII

Write-Step "Writing IExpress directive"
$sourceDir = $iexpressRoot.Replace("\", "\\")
$targetName = $tempTargetExe.Replace("\", "\\")
@"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=Local publish assistant installation completed.
TargetName=$targetName
FriendlyName=Local Publish Assistant Installer
AppLaunched=cmd.exe /d /s /c ""install.cmd""
PostInstallCmd=<None>
AdminQuietInstCmd=cmd.exe /d /s /c ""install.cmd""
UserQuietInstCmd=cmd.exe /d /s /c ""install.cmd""
SourceFiles=SourceFiles
[Strings]
FILE0=assistant-package.zip
FILE1=install.cmd
[SourceFiles]
SourceFiles0=$sourceDir
[SourceFiles0]
%FILE0%=
%FILE1%=
"@ | Set-Content $sedPath -Encoding ASCII

Write-Step "Building Setup.exe with IExpress"
& $iexpressExe /N $sedPath | Out-Null

if (!(Test-Path $tempTargetExe)) {
  throw "Installer build failed. Missing output: $tempTargetExe"
}

Copy-Item $tempTargetExe $targetExe -Force
Write-Step "Installer created at $targetExe"
