@echo off
REM VERTEX - arranque completo: backend (:3005) + web (:5173) + Electron
title start-vertex

cd /d "%~dp0"

echo [vertex] arrancando backend (packages/server) en puerto 3005...
start "vertex-server" cmd /k "cd /d %~dp0packages\server && npm run dev"

timeout /t 3 /nobreak >nul

echo [vertex] arrancando web (packages/web) en puerto 5173...
start "vertex-web" cmd /k "cd /d %~dp0packages\web && npx vite --port 5173 --strictPort"

timeout /t 5 /nobreak >nul

echo [vertex] lanzando Electron apuntando a http://localhost:5173 ...
cd /d %~dp0packages\desktop
set BACKSPACE_URL=http://localhost:5173
npx electron .

echo [vertex] Electron cerrado. Los servidores siguen en sus terminales.
pause
