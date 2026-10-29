@echo off
rem ===== /explain generated programs in PRODUCTION: release and rollbacks. Runs from any directory and any cmd PATH, in its own console window. =====
rem Usage: explain-prod.cmd release [--check]           the pinned release (EXPLAIN_PROGRAM_ENABLED true, kill false); no typed phrase
rem        explain-prod.cmd generation-off [--check]    rollback: no new programs, accepted cards keep running      (you type GENERATION OFF)
rem        explain-prod.cmd kill [--check]              rollback: program cards stop loading/running after reload      (you type KILL EXECUTION)
rem        explain-prod.cmd emergency [--check]         rollback the Worker pair to before the release, about 1 minute (you type ROLL BACK WORKER)
rem --check: read-only (checks and live read-back); nothing is pushed, rolled back or recorded. Reruns resume. Log: C:\s\spec\logs\explain-prod-<action>-<time>.log
setlocal EnableExtensions
set "ACT=%~1"
if /i not "%ACT%"=="release" if /i not "%ACT%"=="generation-off" if /i not "%ACT%"=="kill" if /i not "%ACT%"=="emergency" (echo usage: explain-prod.cmd release^|generation-off^|kill^|emergency [--check] & exit /b 2)
if not "%~2"=="" if /i not "%~2"=="--check" (echo usage: explain-prod.cmd %ACT% [--check] & exit /b 2)
if not defined EP_INNER (
  set EP_INNER=1
  start "Explain prod %ACT% %~2" /wait "%ComSpec%" /d /c ""%~f0" %*"
  exit /b %ERRORLEVEL%
)
set "GIT=C:\Users\cyudhist\AppData\Local\Programs\Git"
set "BASHEXE=%GIT%\usr\bin\bash.exe"
set "PATH=%GIT%\usr\bin;%GIT%\cmd;%GIT%\mingw64\bin;C:\Program Files\nodejs;C:\Users\cyudhist\AppData\Local\Programs\gh\bin;%PATH%"
set "SCRIPT=C:/s/spec/explain-sandbox/prod/explain-prod.sh"
set "LOGDIR=C:\s\spec\logs"
echo.
echo ===== explain prod %ACT% %~2 =====
if not exist "%BASHEXE%" (echo FAILED: Git bash not found at %BASHEXE%. Next: tell Claude. & set RC=2 & goto :done)
if not exist "C:\s\spec\explain-sandbox\prod\explain-prod.sh" (echo FAILED: script missing. Next: tell Claude. & set RC=2 & goto :done)
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if /i not "%ACT%"=="release" if /i not "%~2"=="--check" (
  "%BASHEXE%" -c "test -r /dev/tty && : </dev/tty" 2>nul || (echo FAILED: this window has no readable terminal for the typed confirmation. Next: tell Claude. & set RC=3 & goto :done)
  echo Click in THIS window when asked and TYPE the confirmation phrase.
  rem Discard keystrokes already buffered in this console so a stray Enter cannot answer the prompt.
  powershell -NoProfile -Command "try { while ([Console]::KeyAvailable) { [void][Console]::ReadKey($true) } } catch {}" >nul 2>nul
)
"%BASHEXE%" -c "set -o pipefail; L=/c/s/spec/logs/explain-prod-%ACT%-$(date +%%Y%%m%%d-%%H%%M%%S).log; echo log: $L; bash %SCRIPT% %ACT% %~2 2>&1 | tee $L"
set RC=%ERRORLEVEL%
:done
echo.
if "%RC%"=="0" (
  if /i "%~2"=="--check" (echo ===== CHECK PASSED ^(exit code 0^): nothing was changed. =====) else (echo ===== OK ^(exit code 0^): explain prod %ACT% done. Tell Claude. =====)
) else (echo ===== STOPPED ^(exit code %RC%^). Copy the last EXPLAIN PROD STOP line to Claude. Re-running resumes. =====)
pause
exit /b %RC%
