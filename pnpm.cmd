@echo off
setlocal

cd /d "%~dp0"
set "COREPACK_HOME=%~dp0.corepack"

where corepack.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] corepack.cmd was not found.
  echo Install the current Node.js LTS release, then run this command again.
  exit /b 1
)

call corepack.cmd pnpm %*
exit /b %ERRORLEVEL%
