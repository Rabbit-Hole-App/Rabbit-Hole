@echo off
rem ===== Sandbox dev deploy (preview only, NOT a release): moves dev + preview.digrabbithole.com forward to the gated sandbox commit. Never pushes main. =====
rem Usage: sandbox-dev-deploy.cmd            (deploys)      sandbox-dev-deploy.cmd --check   (read-only verification)
setlocal EnableExtensions
if /i "%~1"=="--check" if not defined SD_INNER (
  set SD_INNER=1
  start "Sandbox dev deploy check" /wait "%ComSpec%" /d /c ""%~f0" %*"
  exit /b %ERRORLEVEL%
)
set "GIT=C:\Users\cyudhist\AppData\Local\Programs\Git"
set "BASHEXE=%GIT%\usr\bin\bash.exe"
set "PATH=%GIT%\usr\bin;%GIT%\cmd;%GIT%\mingw64\bin;C:\Program Files\nodejs;C:\Users\cyudhist\AppData\Local\Programs\gh\bin;%PATH%"
set "SCRIPT=C:/s/spec/explain-sandbox/launcher/sandbox-dev-deploy.sh"
set "LOGDIR=C:\s\spec\logs"
if not exist "%BASHEXE%" (echo FAILED: Git bash not found. Next: tell Claude. & set RC=2 & goto :done)
if not exist "%SCRIPT%" (echo FAILED: script missing. Next: tell Claude. & set RC=2 & goto :done)
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo.
"%BASHEXE%" -c "set -o pipefail; L=/c/s/spec/logs/sandbox-dev-deploy-$(date +%%Y%%m%%d-%%H%%M%%S).log; echo log: $L; bash %SCRIPT% %* 2>&1 | tee $L"
set RC=%ERRORLEVEL%
:done
echo.
if "%RC%"=="0" (
  if /i "%~1"=="--check" (echo ===== CHECK PASSED ^(exit code 0^): nothing was pushed. =====) else (echo ===== OK ^(exit code 0^). Tell Claude: sandbox dev deploy done. =====)
) else (echo ===== STOPPED ^(exit code %RC%^). Copy the last STOP line above to Claude. Re-running resumes. =====)
pause
exit /b %RC%
