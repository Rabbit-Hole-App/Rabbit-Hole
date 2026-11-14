@echo off
title /interactive preview (signed in)
node "C:\s\spec\interact-real\open-preview.mjs" %*
echo.
echo ===== exit code %ERRORLEVEL% =====
pause
