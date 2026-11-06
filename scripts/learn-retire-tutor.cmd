@echo off
rem Tutor cleanup Learn archive backfill launcher (owner-run). Usage: learn-retire-tutor.cmd ^<dev^|parallel^|prod^> ^<check^|backfill^|gate^>
rem check and gate only read. backfill asks you to type BACKFILL ^<ENV^>, then archives, verifies 0 and writes the receipt.
rem Log: C:\s\spec\logs\tutor-cleanup-db-^<env^>.log   Runbook: docs\features\explain-on-canvas\receipts\p6-db-runbook.md
setlocal
if "%~2"=="" (echo usage: learn-retire-tutor.cmd ^<dev^|parallel^|prod^> ^<check^|backfill^|gate^> & exit /b 2)
"C:\Program Files\nodejs\node.exe" "%~dp0learn-retire-tutor-runner.mjs" %1 %2
set RC=%ERRORLEVEL%
echo Exit code %RC%
pause
exit /b %RC%
