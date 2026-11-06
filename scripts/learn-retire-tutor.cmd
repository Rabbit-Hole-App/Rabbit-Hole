@echo off
rem Tutor cleanup Learn database launcher (owner-run). Usage: learn-retire-tutor.cmd ^<dev^|parallel^|prod^> ^<check^|backfill^|gate^|window-check^|retire^>
rem check, gate and window-check only read. backfill and retire ask you to type a phrase first; nothing runs without it.
rem Log: C:\s\spec\logs\tutor-cleanup-db-^<env^>.log   Runbook: docs\features\explain-on-canvas\receipts\p6-db-runbook.md
setlocal
if "%~2"=="" (echo usage: learn-retire-tutor.cmd ^<dev^|parallel^|prod^> ^<check^|backfill^|gate^|window-check^|retire^> & exit /b 2)
"C:\Program Files\nodejs\node.exe" "%~dp0learn-retire-tutor-runner.mjs" %1 %2
set RC=%ERRORLEVEL%
echo Exit code %RC%
pause
exit /b %RC%
