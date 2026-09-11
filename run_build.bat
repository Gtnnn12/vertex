@echo off
cd /d E:\vertex
pnpm build --filter @vertex/web
echo ERRORLEVEL=%ERRORLEVEL%