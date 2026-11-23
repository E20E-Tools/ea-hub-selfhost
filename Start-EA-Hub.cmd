@echo off
setlocal
cd /d "%~dp0"
node -e "fetch('http://127.0.0.1:4175/').then(r=>r.text()).then(t=>process.exit(t.includes('s-home home-page')?0:1)).catch(()=>process.exit(1))"
if not errorlevel 1 (
  start "" "http://127.0.0.1:4175/"
  exit /b 0
)
if not exist ".output\server\index.mjs" (
  call npm.cmd run build:local
  if errorlevel 1 exit /b 1
)
echo EA-Hub local preview: http://127.0.0.1:4175/
call npm.cmd start
