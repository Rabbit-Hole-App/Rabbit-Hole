@echo off
rem ===== W0.3: create rabbit-hole-whiteboard-renderer, install its bearer token on the app and on the production Worker, deploy the pinned commit. Usage: whiteboard-renderer.cmd [--check]  (--check reads state and changes nothing) =====
setlocal EnableExtensions
set "GIT=C:\Users\cyudhist\AppData\Local\Programs\Git"
set "BASHEXE=%GIT%\usr\bin\bash.exe"
set "NODEEXE=C:\Program Files\nodejs\node.exe"
set "SCRIPT=C:/s/spec/release-queue/whiteboard-renderer.mjs"
set "PATH=%GIT%\usr\bin;%GIT%\cmd;%GIT%\mingw64\bin;C:\Program Files\nodejs;C:\Users\cyudhist\.fly\bin;%PATH%"
set "LOGDIR=C:\s\spec\logs"
if not exist "%BASHEXE%" (echo FAILED: Git bash not found. & set RC=2 & goto :done)
if not exist "%NODEEXE%" (echo FAILED: node not found. & set RC=2 & goto :done)
if not exist "C:\s\spec\release-queue\whiteboard-renderer.pins" (echo FAILED: no pins file. & set RC=2 & goto :done)
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo.
"%BASHEXE%" -c "set -o pipefail; L=/c/s/spec/logs/whiteboard-renderer-$(date +%%Y%%m%%d-%%H%%M%%S).log; echo log: $L; '/c/Program Files/nodejs/node.exe' %SCRIPT% %* 2>&1 | tee $L"
set RC=%ERRORLEVEL%
:done
echo.
if "%RC%"=="0" (
  if /i "%~1"=="--check" (echo ===== CHECK PASSED ^(exit code 0^): nothing was changed. =====) else (echo ===== OK ^(exit code 0^). Tell Claude: whiteboard renderer done. =====)
) else (echo ===== STOPPED ^(exit code %RC%^). Copy the last STOP line to Claude. Re-running resumes. =====)
pause
exit /b %RC%
