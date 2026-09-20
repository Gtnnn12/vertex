@echo off
REM ─────────────────────────────────────────────────────────────
REM  VERTEX — arranque de desarrollo con un doble click
REM  1. Backend API en :3005   2. Web (Vite) en :5173   3. Electron
REM ─────────────────────────────────────────────────────────────
setlocal
set ROOT=%~dp0

echo [VERTEX] matando procesos viejos (puertos 3005/5173)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3005 .*LISTENING :5173 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1

echo [VERTEX] arrancando backend en :3005...
start "vertex-server" /min cmd /c "cd /d %ROOT%packages\server && set PORT=3005&& npx tsx src/index.ts"

echo [VERTEX] arrancando web en :5173...
start "vertex-web" /min cmd /c "cd /d %ROOT%packages\web && npx vite --port 5173"

echo [VERTEX] esperando a que los servicios respondan...
:waitloop
timeout /t 2 /nobreak >nul
curl -s -o nul http://localhost:3005/api/instance/info
if errorlevel 1 goto waitloop
curl -s -o nul http://localhost:5173/
if errorlevel 1 goto waitloop

echo [VERTEX] lanzando Electron (apunta a :5173)...
set BACKSPACE_URL=http://localhost:5173
cd /d %ROOT%packages\desktop
npx electron .

endlocal
